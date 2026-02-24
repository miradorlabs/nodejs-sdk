/**
 * Trace builder class for constructing traces with method chaining
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
} from 'mirador-gateway-ingest/proto/gateway/ingest/v1/ingest_gateway';
import { Chain } from 'mirador-gateway-ingest/proto/gateway/ingest/v1/ingest_gateway';
import { ResponseStatus_StatusCode } from 'mirador-gateway-ingest/proto/gateway/common/v1/status';
import type { ChainName, TraceEvent, TxHashHint, AddEventOptions, StackTrace } from './types';
import { captureStackTrace, formatStackTrace } from './stacktrace';

/** Options passed to Trace constructor (with defaults applied) */
interface ResolvedTraceOptions {
  name?: string;
  captureStackTrace: boolean;
  maxRetries: number;
  retryBackoff: number;
  keepAliveIntervalMs: number;
}

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
 * Interface for the client that Trace uses to submit traces
 * @internal
 */
export interface TraceSubmitter {
  _sendTrace(request: CreateTraceRequest): Promise<CreateTraceResponse>;
  _updateTrace(request: UpdateTraceRequest): Promise<UpdateTraceResponse>;
  _keepAlive(request: KeepAliveRequest): Promise<KeepAliveResponse>;
  _closeTrace(request: CloseTraceRequest): Promise<CloseTraceResponse>;
}

/**
 * Builder class for constructing traces with method chaining
 */
export class Trace {
  private name?: string;
  private attributes: { [key: string]: string } = {};
  private tags: string[] = [];
  private events: TraceEvent[] = [];
  private txHashHints: TxHashHint[] = [];
  private client: TraceSubmitter;
  private traceId: string | null = null;
  private keepAliveTimer: NodeJS.Timeout | null = null;
  private keepAliveIntervalMs: number;
  private closed: boolean = false;
  private creationStackTrace: StackTrace | null = null;

  // Retry configuration
  private maxRetries: number;
  private retryBackoff: number;

  constructor(client: TraceSubmitter, options: ResolvedTraceOptions) {
    this.client = client;
    this.name = options.name;
    this.keepAliveIntervalMs = options.keepAliveIntervalMs;
    this.maxRetries = options.maxRetries;
    this.retryBackoff = options.retryBackoff;

    if (options.captureStackTrace) {
      // Skip 2 frames: this constructor and the trace() method that called it
      this.creationStackTrace = captureStackTrace(2);
    }
  }

  /**
   * Add an attribute to the trace
   * @param key Attribute key
   * @param value Attribute value (objects are stringified, primitives converted to string)
   * @returns This trace builder for chaining
   */
  addAttribute(key: string, value: string | number | boolean | object): this {
    if (this.closed) {
      console.warn('[MiradorTrace] Trace is closed, ignoring addAttribute');
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
      console.warn('[MiradorTrace] Trace is closed, ignoring addAttributes');
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
      console.warn('[MiradorTrace] Trace is closed, ignoring addTag');
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
      console.warn('[MiradorTrace] Trace is closed, ignoring addTags');
      return this;
    }
    this.tags.push(...tags);
    return this;
  }

  /**
   * Add an event to the trace
   * @param eventName Name of the event
   * @param details Optional details (can be a JSON string or object that will be stringified)
   * @param options Optional settings including captureStackTrace
   * @returns This trace builder for chaining
   */
  addEvent(eventName: string, details?: string | object, options?: AddEventOptions | Date): this {
    if (this.closed) {
      console.warn('[MiradorTrace] Trace is closed, ignoring addEvent');
      return this;
    }

    // Handle backward compatibility: options can be a Date (legacy timestamp parameter)
    let timestamp: Date | undefined;
    let eventOptions: AddEventOptions | undefined;

    if (options instanceof Date) {
      timestamp = options;
    } else {
      eventOptions = options;
    }

    // Build details object with optional stack trace
    let finalDetails: string | undefined;
    if (eventOptions?.captureStackTrace) {
      const stackTrace = captureStackTrace(1); // Skip 1 frame (this method)
      const detailsObj = typeof details === 'object' && details !== null
        ? details
        : details !== undefined
          ? { message: details }
          : {};
      finalDetails = JSON.stringify({
        ...detailsObj,
        stackTrace: {
          frames: stackTrace.frames,
          raw: stackTrace.raw,
        },
      });
    } else {
      finalDetails =
        typeof details === 'object' && details !== null
          ? JSON.stringify(details)
          : details;
    }

    this.events.push({
      eventName,
      details: finalDetails,
      timestamp: timestamp || new Date(),
    });
    return this;
  }

  /**
   * Capture and add the current stack trace as an event
   * @param eventName Name for the stack trace event (defaults to "stack_trace")
   * @param additionalDetails Optional additional details to include with the stack trace
   * @returns This trace builder for chaining
   */
  addStackTrace(eventName: string = 'stack_trace', additionalDetails?: object): this {
    if (this.closed) {
      console.warn('[MiradorTrace] Trace is closed. Ignoring addStackTrace call.');
      return this;
    }

    const stackTrace = captureStackTrace(1); // Skip 1 frame (this method)
    const details = {
      ...additionalDetails,
      stackTrace: {
        frames: stackTrace.frames,
        raw: stackTrace.raw,
      },
    };

    this.events.push({
      eventName,
      details: JSON.stringify(details),
      timestamp: new Date(),
    });
    return this;
  }

  /**
   * Add a pre-captured stack trace as an event
   * @param stackTrace The stack trace to add
   * @param eventName Name for the stack trace event (defaults to "stack_trace")
   * @param additionalDetails Optional additional details to include with the stack trace
   * @returns This trace builder for chaining
   */
  addExistingStackTrace(stackTrace: StackTrace, eventName: string = 'stack_trace', additionalDetails?: object): this {
    if (this.closed) {
      console.warn('[MiradorTrace] Trace is closed. Ignoring addExistingStackTrace call.');
      return this;
    }

    const details = {
      ...additionalDetails,
      stackTrace: {
        frames: stackTrace.frames,
        raw: stackTrace.raw,
      },
    };

    this.events.push({
      eventName,
      details: JSON.stringify(details),
      timestamp: new Date(),
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
      console.warn('[MiradorTrace] Trace is closed, ignoring addTxHint');
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
   * Add transaction input data (calldata) as a trace event.
   * Useful for debugging failed transactions where input data is still available.
   * @param inputData The hex-encoded transaction input data (e.g., "0xa9059cbb...")
   * @returns This trace builder for chaining
   */
  addTxInputData(inputData: string): this {
    return this.addEvent('Tx input data', inputData);
  }

  /**
   * Sleep for the specified duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Execute an operation with exponential backoff retry
   */
  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (err) {
        lastError = err as Error;

        if (attempt < this.maxRetries) {
          const delay = this.retryBackoff * Math.pow(2, attempt);
          console.warn(
            `[MiradorTrace] ${operationName} failed, retrying in ${delay}ms (attempt ${attempt + 1}/${this.maxRetries})`
          );
          await this.sleep(delay);
        }
      }
    }

    throw lastError;
  }

  /**
   * Create and submit the trace to the gateway
   * @returns The trace ID if successful, undefined if failed
   */
  async create(): Promise<string | undefined> {
    if (this.closed) {
      console.warn('[MiradorTrace] Trace is closed, cannot create');
      return undefined;
    }

    // Build attributes, including creation stack trace if captured
    const attributesToSend = { ...this.attributes };
    if (this.creationStackTrace) {
      attributesToSend['source.stack_trace'] = formatStackTrace(this.creationStackTrace);
      if (this.creationStackTrace.frames.length > 0) {
        const topFrame = this.creationStackTrace.frames[0];
        attributesToSend['source.file'] = topFrame.fileName;
        attributesToSend['source.line'] = String(topFrame.lineNumber);
        attributesToSend['source.function'] = topFrame.functionName;
      }
    }

    const request: CreateTraceRequest = {
      name: this.name,
      data: {
        attributes: Object.keys(attributesToSend).length > 0
          ? [{ attributes: attributesToSend, timestamp: new Date() }]
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
      const response = await this.retryWithBackoff(
        () => this.client._sendTrace(request),
        'CreateTrace'
      );

      if (response.status?.code !== ResponseStatus_StatusCode.STATUS_CODE_SUCCESS) {
        console.error('[MiradorTrace] CreateTrace failed:', response.status?.errorMessage || 'Unknown error');
        return undefined;
      }

      this.traceId = response.traceId || null;

      // Start keep-alive timer after successful trace creation
      if (this.traceId) {
        this.startKeepAlive();
      }

      return response.traceId;
    } catch (error) {
      console.error('[MiradorTrace] CreateTrace error after retries:', error);
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
        console.warn('[MiradorTrace] Keep-alive not accepted for trace:', this.traceId);
        this.stopKeepAlive();
      }
    } catch (error) {
      console.error('[MiradorTrace] Keep-alive error:', error);
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
          console.warn('[MiradorTrace] Close request not accepted for trace:', this.traceId);
        }
      } catch (error) {
        console.error('[MiradorTrace] Close error:', error);
      }
    }
  }
}
