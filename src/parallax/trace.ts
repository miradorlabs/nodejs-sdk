/**
 * ParallaxTrace builder class for constructing traces with method chaining
 */
import type {
  CreateTraceRequest,
  CreateTraceResponse,
  UpdateTraceRequest,
  UpdateTraceResponse,
  KeepAliveRequest,
  KeepAliveResponse,
  CloseTraceRequest,
  CloseTraceResponse,
} from 'mirador-gateway-parallax/proto/gateway/parallax/v1/parallax_gateway';
import { Chain } from 'mirador-gateway-parallax/proto/gateway/parallax/v1/parallax_gateway';
import { ResponseStatus_StatusCode } from 'mirador-gateway-parallax/proto/common/v1/status';
import type { ChainName, TraceEvent, TxHashHint } from './types';

/**
 * Maps chain names to proto Chain enum values
 */
const CHAIN_MAP: Record<ChainName, Chain> = {
  ethereum: Chain.CHAIN_ETHEREUM,
  polygon: Chain.CHAIN_POLYGON,
  arbitrum: Chain.CHAIN_ARBITRUM,
  base: Chain.CHAIN_BASE,
  optimism: Chain.CHAIN_OPTIMISM,
  bsc: Chain.CHAIN_BSC,
};

/**
 * Interface for the client that ParallaxTrace uses to submit traces
 * @internal
 */
export interface TraceSubmitter {
  keepAliveIntervalMs: number;
  _sendTrace(request: CreateTraceRequest): Promise<CreateTraceResponse>;
  _updateTrace(request: UpdateTraceRequest): Promise<UpdateTraceResponse>;
  _keepAlive(request: KeepAliveRequest): Promise<KeepAliveResponse>;
  _closeTrace(request: CloseTraceRequest): Promise<CloseTraceResponse>;
}

/**
 * Builder class for constructing traces with method chaining
 */
export class ParallaxTrace {
  private name: string;
  private attributes: { [key: string]: string } = {};
  private tags: string[] = [];
  private events: TraceEvent[] = [];
  private txHashHints: TxHashHint[] = [];
  private client: TraceSubmitter;
  private traceId: string | null = null;
  private keepAliveTimer: NodeJS.Timeout | null = null;
  private keepAliveIntervalMs: number;
  private closed: boolean = false;

  constructor(client: TraceSubmitter, name: string = '') {
    this.client = client;
    this.name = name;
    this.keepAliveIntervalMs = client.keepAliveIntervalMs;
  }

  /**
   * Add an attribute to the trace
   * @param key Attribute key
   * @param value Attribute value (objects are stringified, primitives converted to string)
   * @returns This trace builder for chaining
   */
  addAttribute(key: string, value: string | number | boolean | object): this {
    if (this.closed) {
      console.warn('[ParallaxTrace] Trace is closed, ignoring addAttribute');
      return this;
    }
    this.attributes[key] =
      typeof value === 'object' && value !== null
        ? JSON.stringify(value)
        : String(value);
    return this;
  }

  /**
   * Add multiple attributes to the trace
   * @param attributes Object containing key-value pairs (objects are stringified)
   * @returns This trace builder for chaining
   */
  addAttributes(attributes: { [key: string]: string | number | boolean | object }): this {
    if (this.closed) {
      console.warn('[ParallaxTrace] Trace is closed, ignoring addAttributes');
      return this;
    }
    for (const [key, value] of Object.entries(attributes)) {
      this.attributes[key] =
        typeof value === 'object' && value !== null
          ? JSON.stringify(value)
          : String(value);
    }
    return this;
  }

  /**
   * Add a tag to the trace
   * @param tag Tag to add
   * @returns This trace builder for chaining
   */
  addTag(tag: string): this {
    if (this.closed) {
      console.warn('[ParallaxTrace] Trace is closed, ignoring addTag');
      return this;
    }
    this.tags.push(tag);
    return this;
  }

  /**
   * Add multiple tags to the trace
   * @param tags Array of tags to add
   * @returns This trace builder for chaining
   */
  addTags(tags: string[]): this {
    if (this.closed) {
      console.warn('[ParallaxTrace] Trace is closed, ignoring addTags');
      return this;
    }
    this.tags.push(...tags);
    return this;
  }

  /**
   * Add an event to the trace
   * @param eventName Name of the event
   * @param details Optional details (can be a JSON string or object that will be stringified)
   * @param timestamp Optional timestamp (defaults to current time)
   * @returns This trace builder for chaining
   */
  addEvent(eventName: string, details?: string | object, timestamp?: Date): this {
    if (this.closed) {
      console.warn('[ParallaxTrace] Trace is closed, ignoring addEvent');
      return this;
    }
    const detailsString =
      typeof details === 'object' && details !== null
        ? JSON.stringify(details)
        : details;

    this.events.push({
      eventName,
      details: detailsString,
      timestamp: timestamp || new Date(),
    });
    return this;
  }

  /**
   * Add a transaction hash hint for blockchain correlation
   * @param txHash Transaction hash
   * @param chain Chain name (e.g., "ethereum", "polygon", "base")
   * @param details Optional details about the transaction
   * @returns This trace builder for chaining
   */
  addTxHint(txHash: string, chain: ChainName, details?: string): this {
    if (this.closed) {
      console.warn('[ParallaxTrace] Trace is closed, ignoring addTxHint');
      return this;
    }
    this.txHashHints.push({
      txHash,
      chain,
      details,
      timestamp: new Date(),
    });
    return this;
  }

  /**
   * Create and submit the trace to the gateway
   * @returns The trace ID if successful, undefined if failed
   */
  async create(): Promise<string | undefined> {
    if (this.closed) {
      console.warn('[ParallaxTrace] Trace is closed, cannot create');
      return undefined;
    }

    const request: CreateTraceRequest = {
      name: this.name,
      data: {
        attributes: Object.keys(this.attributes).length > 0
          ? [{ attributes: this.attributes, timestamp: new Date() }]
          : [],
        tags: this.tags.length > 0
          ? [{ tags: this.tags, timestamp: new Date() }]
          : [],
        events: this.events.map((e) => ({
          name: e.eventName,
          details: e.details,
          timestamp: e.timestamp,
        })),
        txHashHints: this.txHashHints.map((hint) => ({
          chain: CHAIN_MAP[hint.chain],
          txHash: hint.txHash,
          details: hint.details,
          timestamp: hint.timestamp,
        })),
      },
      sendClientTimestamp: new Date(),
    };

    try {
      const response = await this.client._sendTrace(request);

      if (response.status?.code !== ResponseStatus_StatusCode.STATUS_CODE_SUCCESS) {
        console.log('[ParallaxTrace] Error:', response.status?.errorMessage || 'Unknown error');
        return undefined;
      }

      this.traceId = response.traceId || null;

      // Start keep-alive timer after successful trace creation
      if (this.traceId) {
        this.startKeepAlive();
      }

      return response.traceId;
    } catch (error) {
      console.log('[ParallaxTrace] Error creating trace:', error);
      return undefined;
    }
  }

  /**
   * Get the trace ID (available after create() completes successfully)
   * @returns The trace ID or null if not yet created
   */
  getTraceId(): string | null {
    return this.traceId;
  }

  /**
   * Check if the trace has been closed
   * @returns True if the trace is closed
   */
  isClosed(): boolean {
    return this.closed;
  }

  /**
   * Start the keep-alive timer
   * @private
   */
  private startKeepAlive(): void {
    if (this.keepAliveTimer || !this.traceId || this.closed) {
      return;
    }

    this.keepAliveTimer = setInterval(() => {
      this.sendKeepAlive();
    }, this.keepAliveIntervalMs);
  }

  /**
   * Stop the keep-alive timer
   * @private
   */
  private stopKeepAlive(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }

  /**
   * Send a keep-alive ping to the server
   * @private
   */
  private async sendKeepAlive(): Promise<void> {
    if (!this.traceId || this.closed) {
      return;
    }

    try {
      const request: KeepAliveRequest = {
        traceId: this.traceId,
      };

      const response = await this.client._keepAlive(request);

      if (!response.accepted) {
        console.log('[ParallaxTrace] Keep-alive not accepted for trace:', this.traceId);
        this.stopKeepAlive();
      }
    } catch (error) {
      console.log('[ParallaxTrace] Error sending keep-alive:', error);
    }
  }

  /**
   * Close the trace and stop all timers
   * @param reason Optional reason for closing the trace
   */
  async close(reason?: string): Promise<void> {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.stopKeepAlive();

    if (this.traceId) {
      try {
        const request: CloseTraceRequest = {
          traceId: this.traceId,
          text: reason,
        };

        const response = await this.client._closeTrace(request);

        if (!response.accepted) {
          console.log('[ParallaxTrace] Close request not accepted for trace:', this.traceId);
        }
      } catch (error) {
        console.log('[ParallaxTrace] Error closing trace:', error);
      }
    }
  }
}
