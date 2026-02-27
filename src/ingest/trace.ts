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
  TraceData,
} from 'mirador-gateway-ingest/proto/gateway/ingest/v1/ingest_gateway';
import { Chain } from 'mirador-gateway-ingest/proto/gateway/ingest/v1/ingest_gateway';
import { ResponseStatus_StatusCode } from 'mirador-gateway-ingest/proto/gateway/common/v1/status';
import type { ChainName, TraceEvent, TxHashHint, AddEventOptions, StackTrace, EIP1193Provider, TxHintOptions, TransactionLike, TransactionRequest } from './types';
import { captureStackTrace, formatStackTrace } from './stacktrace';
import { chainIdToName } from './chains';

/** Options passed to Trace constructor (with defaults applied) */
interface ResolvedTraceOptions {
  name?: string;
  traceId?: string;
  captureStackTrace: boolean;
  maxRetries: number;
  retryBackoff: number;
  keepAliveIntervalMs: number;
  provider?: EIP1193Provider;
}

/**
 * Serialize transaction params for EIP-1193, converting bigints to hex strings
 */
function serializeTxParams(tx: TransactionRequest): Record<string, string | undefined> {
  const toHex = (val: string | bigint | number | undefined): string | undefined => {
    if (val === undefined) return undefined;
    if (typeof val === 'bigint') return '0x' + val.toString(16);
    if (typeof val === 'number') return '0x' + val.toString(16);
    return String(val);
  };

  return {
    from: tx.from,
    to: tx.to,
    data: tx.data,
    value: toHex(tx.value),
    gas: toHex(tx.gas),
    gasPrice: toHex(tx.gasPrice),
    maxFeePerGas: toHex(tx.maxFeePerGas),
    maxPriorityFeePerGas: toHex(tx.maxPriorityFeePerGas),
    nonce: toHex(tx.nonce),
    chainId: toHex(tx.chainId),
  };
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

  // Provider configuration
  private provider: EIP1193Provider | null = null;
  private providerChainName: ChainName | null = null;

  constructor(client: TraceSubmitter, options: ResolvedTraceOptions) {
    this.client = client;
    this.name = options.name;
    this.traceId = options.traceId ?? null;
    this.keepAliveIntervalMs = options.keepAliveIntervalMs;
    this.maxRetries = options.maxRetries;
    this.retryBackoff = options.retryBackoff;

    if (options.provider) {
      this.setProvider(options.provider);
    }

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
   * @param options Optional details string or TxHintOptions object
   * @returns This trace builder for chaining
   */
  addTxHint(txHash: string, chain: ChainName, options?: string | TxHintOptions): this {
    if (this.closed) {
      console.warn('[MiradorTrace] Trace is closed, ignoring addTxHint');
      return this;
    }

    let details: string | undefined;
    if (typeof options === 'string') {
      details = options;
    } else if (options) {
      if (options.input) {
        this.addTxInputData(options.input);
      }
      details = options.details;
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
    if (!inputData || inputData === '0x') return this;
    return this.addEvent('Tx input data', inputData);
  }

  /**
   * Add a transaction object, extracting hash, chain, and input data automatically.
   * @param tx A transaction-like object (ethers, viem, or raw RPC format)
   * @param chain Optional chain name override (inferred from tx.chainId if not provided)
   * @returns This trace builder for chaining
   */
  addTx(tx: TransactionLike, chain?: ChainName): this {
    if (this.closed) {
      console.warn('[MiradorTrace] Trace is closed, ignoring addTx');
      return this;
    }

    const resolvedChain = this.resolveChain(chain, tx.chainId);
    const input = tx.data ?? tx.input;

    if (input) {
      this.addTxInputData(input);
    }
    this.addTxHint(tx.hash, resolvedChain);
    return this;
  }

  /**
   * Set an EIP-1193 provider for transaction operations.
   * Also initiates async chain ID detection.
   * @param provider An EIP-1193 compatible provider
   * @returns This trace builder for chaining
   */
  setProvider(provider: EIP1193Provider): this {
    this.provider = provider;
    provider.request({ method: 'eth_chainId' }).then((chainId) => {
      this.providerChainName = chainIdToName(Number(chainId as string)) ?? null;
    }).catch(() => { /* ignore */ });
    return this;
  }

  /**
   * Get the cached provider chain name
   * @returns The provider's chain name or null if not available
   */
  getProviderChain(): ChainName | null {
    return this.providerChainName;
  }

  /**
   * Resolve chain name from explicit parameter, chainId, or provider cache.
   * @param chain Explicit chain name
   * @param chainId Chain ID from transaction
   * @returns Resolved ChainName
   * @throws If chain cannot be determined
   */
  resolveChain(chain?: ChainName, chainId?: number | bigint | string): ChainName {
    if (chain) return chain;
    if (chainId !== undefined) {
      const resolved = chainIdToName(chainId);
      if (resolved) return resolved;
    }
    if (this.providerChainName) return this.providerChainName;
    throw new Error('[MiradorTrace] Cannot determine chain. Provide chain parameter, chainId, or set a provider.');
  }

  /**
   * Send a transaction through the trace, capturing events and errors.
   * @param tx Transaction parameters (EIP-1193 style)
   * @param provider Optional provider override
   * @returns The transaction hash
   */
  async sendTransaction(tx: TransactionRequest, provider?: EIP1193Provider): Promise<string> {
    const p = provider ?? this.provider;
    if (!p) throw new Error('[MiradorTrace] No provider configured. Use setProvider() or pass a provider.');

    this.addEvent('tx:send', {
      to: tx.to,
      value: tx.value?.toString(),
      data: tx.data ? `${tx.data.slice(0, 10)}...` : undefined,
    });

    try {
      const txHash = await p.request({
        method: 'eth_sendTransaction',
        params: [serializeTxParams(tx)],
      }) as string;

      const chain = this.resolveChain(undefined, tx.chainId);
      if (tx.data) {
        this.addTxInputData(tx.data);
      }
      this.addTxHint(txHash, chain);
      this.addEvent('tx:sent', { txHash });

      return txHash;
    } catch (err) {
      const error = err as Error & { code?: unknown; data?: unknown };
      this.addEvent('tx:error', {
        message: error.message,
        code: error.code,
        data: error.data,
      });
      throw err;
    }
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

    // If trace ID was pre-set (e.g., from frontend SDK), send an update instead of create
    if (this.traceId) {
      try {
        const request: UpdateTraceRequest = {
          traceId: this.traceId,
          data: this.buildTraceData(),
          sendClientTimestamp: new Date(),
        };
        await this.retryWithBackoff(
          () => this.client._updateTrace(request),
          'UpdateTrace (resumed)'
        );
        this.startKeepAlive();
        return this.traceId;
      } catch (error) {
        console.error('[MiradorTrace] UpdateTrace error after retries (resumed trace):', error);
        return undefined;
      }
    }

    const request: CreateTraceRequest = {
      name: this.name,
      data: this.buildTraceData(),
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
   * Set the trace ID on an existing trace instance, allowing it to resume
   * a trace created elsewhere (e.g., passed from a frontend SDK via HTTP header).
   * Subsequent calls to create() will send an UpdateTrace instead of CreateTrace.
   * @param traceId The trace ID to resume
   * @returns This trace builder for chaining
   */
  setTraceId(traceId: string): this {
    if (this.closed) {
      console.warn('[MiradorTrace] Trace is closed, ignoring setTraceId');
      return this;
    }
    this.traceId = traceId;
    return this;
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
   * Build the TraceData payload from accumulated attributes, tags, events, and tx hints.
   * @private
   */
  private buildTraceData(): TraceData {
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

    return {
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
    };
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
