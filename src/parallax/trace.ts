/**
 * ParallaxTrace builder class for constructing traces with method chaining
 */
import type { CreateTraceRequest, CreateTraceResponse } from 'mirador-gateway-parallax/proto/gateway/parallax/v1/parallax_gateway';
import { ResponseStatus_StatusCode } from 'mirador-gateway-parallax/proto/common/v1/status';
import type { ChainName, TraceEvent, TxHashHint } from './types';

/**
 * Interface for the client that ParallaxTrace uses to submit traces
 * @internal
 */
export interface TraceSubmitter {
  _sendTrace(request: CreateTraceRequest): Promise<CreateTraceResponse>;
}

/**
 * Builder class for constructing traces with method chaining
 */
export class ParallaxTrace {
  private name: string;
  private attributes: { [key: string]: string } = {};
  private tags: string[] = [];
  private events: TraceEvent[] = [];
  private txHashHint?: TxHashHint;
  private client: TraceSubmitter;

  constructor(client: TraceSubmitter, name: string = '') {
    this.client = client;
    this.name = name;
  }

  /**
   * Add an attribute to the trace
   * @param key Attribute key
   * @param value Attribute value (objects are stringified, primitives converted to string)
   * @returns This trace builder for chaining
   */
  addAttribute(key: string, value: string | number | boolean | object): this {
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
    this.tags.push(tag);
    return this;
  }

  /**
   * Add multiple tags to the trace
   * @param tags Array of tags to add
   * @returns This trace builder for chaining
   */
  addTags(tags: string[]): this {
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
   * Set the transaction hash hint for blockchain correlation
   * @param txHash Transaction hash
   * @param chain Chain name (e.g., "ethereum", "polygon", "base")
   * @param details Optional details about the transaction
   * @returns This trace builder for chaining
   */
  setTxHint(txHash: string, chain: ChainName, details?: string): this {
    this.txHashHint = {
      txHash,
      chain,
      details,
      timestamp: new Date(),
    };
    return this;
  }

  /**
   * Create and submit the trace to the gateway
   * @returns The trace ID if successful, undefined if failed
   */
  async create(): Promise<string | undefined> {
    const request: CreateTraceRequest = {
      name: this.name,
      attributes: this.attributes,
      tags: this.tags,
      events: this.events.map((e) => ({
        eventName: e.eventName,
        details: e.details,
        timestamp: e.timestamp,
      })),
      txHashHint: this.txHashHint
        ? {
            chainId: this.txHashHint.chain,
            txHash: this.txHashHint.txHash,
            details: this.txHashHint.details,
            timestamp: this.txHashHint.timestamp,
          }
        : undefined,
    };

    try {
      const response = await this.client._sendTrace(request);

      if (response.status?.code !== ResponseStatus_StatusCode.STATUS_CODE_SUCCESS) {
        console.log('[ParallaxTrace] Error:', response.status?.errorMessage || 'Unknown error');
        return undefined;
      }

      return response.traceId;
    } catch (error) {
      console.log('[ParallaxTrace] Error creating trace:', error);
      return undefined;
    }
  }
}
