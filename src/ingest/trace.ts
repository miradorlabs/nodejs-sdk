/**
 * Trace builder class for constructing traces with method chaining.
 * Supports auto-flush mode where SDK calls are batched via microtask and flushed
 * at the end of the current JS tick, or manual flush via flush().
 */
import type {
  FlushTraceRequest,
  FlushTraceResponse,
  KeepAliveRequest,
  KeepAliveResponse,
  CloseTraceRequest,
  CloseTraceResponse,
  TraceData,
} from 'mirador-gateway-ingest/proto/gateway/ingest/v1/ingest_gateway';
import { Chain } from 'mirador-gateway-ingest/proto/gateway/ingest/v1/ingest_gateway';
import { ResponseStatus_StatusCode } from 'mirador-gateway-ingest/proto/gateway/common/v1/status';
import type { ChainName, TraceEvent, TxHashHint, SafeMsgHintData, SafeTxHintData, AddEventOptions, StackTrace, EIP1193Provider, TxHintOptions, TransactionLike, TransactionRequest, Logger, TraceCallbacks } from './types';
import { captureStackTrace, formatStackTrace } from './stacktrace';
import { chainIdToName } from './chains';

/** Options passed to Trace constructor (with defaults applied) */
interface ResolvedTraceOptions {
  name?: string;
  traceId: string;
  captureStackTrace: boolean;
  maxRetries: number;
  retryBackoff: number;
  keepAliveIntervalMs: number;
  provider?: EIP1193Provider;
  autoKeepAlive: boolean;
  callTimeoutMs: number;
  maxTraceLifetimeMs: number;
  maxQueueSize?: number;
  callbacks?: TraceCallbacks;
}

/** gRPC status codes that are safe to retry */
const RETRYABLE_GRPC_CODES = new Set([
  4,  // DEADLINE_EXCEEDED
  8,  // RESOURCE_EXHAUSTED (rate limited)
  13, // INTERNAL
  14, // UNAVAILABLE
]);

/** Default queue size limit */
const DEFAULT_MAX_QUEUE_SIZE = 4096;

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
 * Schedule a microtask with fallback for older runtimes
 */
const scheduleMicrotask = typeof queueMicrotask === 'function'
  ? queueMicrotask
  : (cb: () => void) => { Promise.resolve().then(cb); };

/**
 * Interface for the client that Trace uses to submit traces
 * @internal
 */
export interface TraceSubmitter {
  _flushTrace(request: FlushTraceRequest): Promise<FlushTraceResponse>;
  _keepAlive(request: KeepAliveRequest): Promise<KeepAliveResponse>;
  _closeTrace(request: CloseTraceRequest): Promise<CloseTraceResponse>;
  readonly logger: Logger;
  rateLimitedUntil: number;
}

/**
 * Builder class for constructing traces with method chaining.
 * Builder methods (addAttribute, addEvent, etc.) automatically schedule a flush
 * via microtask, batching all synchronous calls within the same JS tick into a
 * single network request. You can also call flush() explicitly.
 */
export class Trace {
  private name?: string;
  private client: TraceSubmitter;
  private traceId: string;
  private flushedOnce: boolean = false;
  private closed: boolean = false;
  private creationStackTrace: StackTrace | null = null;

  // Pending data — cleared after each flush
  private pendingAttributes: { [key: string]: string } = {};
  private pendingTags: string[] = [];
  private pendingEvents: TraceEvent[] = [];
  private pendingTxHashHints: TxHashHint[] = [];
  private pendingSafeMsgHints: SafeMsgHintData[] = [];
  private pendingSafeTxHints: SafeTxHintData[] = [];

  // Flush infrastructure
  private microtaskScheduled: boolean = false;
  private flushQueue: Promise<void> = Promise.resolve();

  // Keep-alive configuration
  private autoKeepAlive: boolean;
  private keepAliveTimer: NodeJS.Timeout | null = null;
  private keepAliveIntervalMs: number;

  // Retry configuration
  private maxRetries: number;
  private retryBackoff: number;
  private callTimeoutMs: number;

  // KeepAlive resilience
  private keepAliveInFlight: boolean = false;
  private keepAliveConsecutiveFailures: number = 0;
  private static readonly MAX_KEEPALIVE_FAILURES = 3;

  // Flush batch size limit
  private static readonly MAX_FLUSH_BATCH_SIZE = 100;

  // Max trace lifetime
  private maxTraceLifetimeMs: number;
  private traceCreatedAt: number = Date.now();

  // Queue size limit
  private maxQueueSize: number;

  // Lifecycle callbacks
  private callbacks?: TraceCallbacks;

  // Trace abandonment
  private abandoned: boolean = false;

  // Provider configuration
  private provider: EIP1193Provider | null = null;
  private providerChainName: ChainName | null = null;

  constructor(client: TraceSubmitter, options: ResolvedTraceOptions) {
    this.client = client;
    this.name = options.name;
    this.traceId = options.traceId;
    this.autoKeepAlive = options.autoKeepAlive;
    this.keepAliveIntervalMs = options.keepAliveIntervalMs;
    this.maxRetries = options.maxRetries;
    this.retryBackoff = options.retryBackoff;
    this.callTimeoutMs = options.callTimeoutMs;
    this.maxTraceLifetimeMs = options.maxTraceLifetimeMs;
    this.maxQueueSize = options.maxQueueSize ?? DEFAULT_MAX_QUEUE_SIZE;
    this.callbacks = options.callbacks;

    if (options.provider) {
      this.setProvider(options.provider);
    }

    if (options.captureStackTrace) {
      // Skip 2 frames: this constructor and the trace() method that called it
      this.creationStackTrace = captureStackTrace(2);
    }
  }

  /**
   * Get current total pending items count
   */
  private get pendingCount(): number {
    return Object.keys(this.pendingAttributes).length +
      this.pendingTags.length +
      this.pendingEvents.length +
      this.pendingTxHashHints.length +
      this.pendingSafeMsgHints.length +
      this.pendingSafeTxHints.length;
  }

  /**
   * Check if the queue is full and warn/invoke callback if so
   */
  private isQueueFull(itemCount: number = 1): boolean {
    if (this.pendingCount + itemCount > this.maxQueueSize) {
      this.client.logger.warn(`[MiradorTrace] Queue full (${this.maxQueueSize}), dropping ${itemCount} item(s)`);
      this.invokeCallback('onDropped', itemCount, 'Queue full');
      return true;
    }
    return false;
  }

  /**
   * Safely invoke a lifecycle callback, swallowing errors
   */
  private invokeCallback<K extends keyof TraceCallbacks>(
    name: K,
    ...args: Parameters<NonNullable<TraceCallbacks[K]>>
  ): void {
    const cb = this.callbacks?.[name];
    if (cb) {
      try {
        (cb as (...a: unknown[]) => void)(...args);
      } catch {
        // Swallow callback errors
      }
    }
  }

  /**
   * Schedule an auto-flush via microtask.
   * All synchronous SDK calls within the same JS tick are batched together
   * and flushed once at the end of the microtask queue.
   */
  private scheduleFlush(): void {
    if (this.microtaskScheduled) return;
    this.microtaskScheduled = true;
    scheduleMicrotask(() => {
      if (!this.microtaskScheduled) return; // Cancelled by explicit flush()
      this.microtaskScheduled = false;
      this.flush();
    });
  }

  /**
   * Add an attribute to the trace
   * @param key Attribute key
   * @param value Attribute value (objects are stringified, primitives converted to string)
   * @returns This trace builder for chaining
   */
  addAttribute(key: string, value: string | number | boolean | object): this {
    if (this.closed) {
      this.client.logger.warn('[MiradorTrace] Trace is closed, ignoring addAttribute');
      return this;
    }
    if (this.isQueueFull()) return this;
    this.pendingAttributes[key] =
      typeof value === 'object' && value !== null
        ? JSON.stringify(value)
        : String(value);
    this.scheduleFlush();
    return this;
  }

  /**
   * Add multiple attributes to the trace
   * @param attributes Object containing key-value pairs (objects are stringified)
   * @returns This trace builder for chaining
   */
  addAttributes(attributes: { [key: string]: string | number | boolean | object }): this {
    if (this.closed) {
      this.client.logger.warn('[MiradorTrace] Trace is closed, ignoring addAttributes');
      return this;
    }
    if (this.isQueueFull(Object.keys(attributes).length)) return this;
    for (const [key, value] of Object.entries(attributes)) {
      this.pendingAttributes[key] =
        typeof value === 'object' && value !== null
          ? JSON.stringify(value)
          : String(value);
    }
    this.scheduleFlush();
    return this;
  }

  /**
   * Add a tag to the trace
   * @param tag Tag to add
   * @returns This trace builder for chaining
   */
  addTag(tag: string): this {
    if (this.closed) {
      this.client.logger.warn('[MiradorTrace] Trace is closed, ignoring addTag');
      return this;
    }
    if (this.isQueueFull()) return this;
    this.pendingTags.push(tag);
    this.scheduleFlush();
    return this;
  }

  /**
   * Add multiple tags to the trace
   * @param tags Array of tags to add
   * @returns This trace builder for chaining
   */
  addTags(tags: string[]): this {
    if (this.closed) {
      this.client.logger.warn('[MiradorTrace] Trace is closed, ignoring addTags');
      return this;
    }
    if (this.isQueueFull(tags.length)) return this;
    this.pendingTags.push(...tags);
    this.scheduleFlush();
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
      this.client.logger.warn('[MiradorTrace] Trace is closed, ignoring addEvent');
      return this;
    }
    if (this.isQueueFull()) return this;

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

    this.pendingEvents.push({
      eventName,
      details: finalDetails,
      timestamp: timestamp || new Date(),
    });
    this.scheduleFlush();
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
      this.client.logger.warn('[MiradorTrace] Trace is closed. Ignoring addStackTrace call.');
      return this;
    }
    if (this.isQueueFull()) return this;

    const stackTrace = captureStackTrace(1); // Skip 1 frame (this method)
    const details = {
      ...additionalDetails,
      stackTrace: {
        frames: stackTrace.frames,
        raw: stackTrace.raw,
      },
    };

    this.pendingEvents.push({
      eventName,
      details: JSON.stringify(details),
      timestamp: new Date(),
    });
    this.scheduleFlush();
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
      this.client.logger.warn('[MiradorTrace] Trace is closed. Ignoring addExistingStackTrace call.');
      return this;
    }
    if (this.isQueueFull()) return this;

    const details = {
      ...additionalDetails,
      stackTrace: {
        frames: stackTrace.frames,
        raw: stackTrace.raw,
      },
    };

    this.pendingEvents.push({
      eventName,
      details: JSON.stringify(details),
      timestamp: new Date(),
    });
    this.scheduleFlush();
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
      this.client.logger.warn('[MiradorTrace] Trace is closed, ignoring addTxHint');
      return this;
    }
    if (this.isQueueFull()) return this;

    let details: string | undefined;
    if (typeof options === 'string') {
      details = options;
    } else if (options) {
      if (options.input) {
        this.addTxInputData(options.input);
      }
      details = options.details;
    }

    this.pendingTxHashHints.push({
      txHash,
      chain,
      details,
      timestamp: new Date(),
    });
    this.scheduleFlush();
    return this;
  }

  /**
   * Add a Safe message hint for tracking Safe multisig message confirmations.
   * @param msgHint The Safe message hash to track
   * @param chain Chain name (e.g., "ethereum", "polygon", "base")
   * @param details Optional details string
   * @returns This trace builder for chaining
   */
  addSafeMsgHint(msgHint: string, chain: ChainName, details?: string): this {
    if (this.closed) {
      this.client.logger.warn('[MiradorTrace] Trace is closed, ignoring addSafeMsgHint');
      return this;
    }
    if (this.isQueueFull()) return this;

    this.pendingSafeMsgHints.push({
      messageHash: msgHint,
      chain,
      details,
      timestamp: new Date(),
    });
    this.scheduleFlush();
    return this;
  }

  /**
   * Add a Safe transaction hint for tracking Safe multisig transaction executions.
   * @param safeTxHash The Safe transaction hash to track
   * @param chain Chain name (e.g., "ethereum", "polygon", "base")
   * @param details Optional details string
   * @returns This trace builder for chaining
   */
  addSafeTxHint(safeTxHash: string, chain: ChainName, details?: string): this {
    if (this.closed) {
      this.client.logger.warn('[MiradorTrace] Trace is closed, ignoring addSafeTxHint');
      return this;
    }
    if (this.isQueueFull()) return this;

    this.pendingSafeTxHints.push({
      safeTxHash,
      chain,
      details,
      timestamp: new Date(),
    });
    this.scheduleFlush();
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
      this.client.logger.warn('[MiradorTrace] Trace is closed, ignoring addTx');
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
   * Flush pending data to the gateway.
   * Fire-and-forget — returns immediately but maintains strict ordering of requests.
   * Each flush sends FlushTrace (an idempotent create-or-update RPC).
   */
  flush(): void {
    if (this.closed || this.abandoned) {
      return;
    }

    // Clear microtask flag since we're flushing now
    this.microtaskScheduled = false;

    // Check if there's anything to flush
    const hasPendingData =
      Object.keys(this.pendingAttributes).length > 0 ||
      this.pendingTags.length > 0 ||
      this.pendingEvents.length > 0 ||
      this.pendingTxHashHints.length > 0 ||
      this.pendingSafeMsgHints.length > 0 ||
      this.pendingSafeTxHints.length > 0;

    if (!hasPendingData && this.flushedOnce) {
      return; // Nothing to flush and trace already sent
    }

    // Cap batch size: if too many items, keep extras pending for next flush
    const totalItems = this.pendingEvents.length + this.pendingTxHashHints.length +
      this.pendingSafeMsgHints.length + this.pendingSafeTxHints.length;
    let overflow = false;

    if (totalItems > Trace.MAX_FLUSH_BATCH_SIZE) {
      overflow = true;
      let budget = Trace.MAX_FLUSH_BATCH_SIZE;
      const eventsToSend = this.pendingEvents.slice(0, budget);
      budget -= eventsToSend.length;
      const txHintsToSend = this.pendingTxHashHints.slice(0, budget);
      budget -= txHintsToSend.length;
      const safeMsgHintsToSend = this.pendingSafeMsgHints.slice(0, budget);
      budget -= safeMsgHintsToSend.length;
      const safeTxHintsToSend = this.pendingSafeTxHints.slice(0, budget);

      // Keep the rest pending
      this.pendingEvents = this.pendingEvents.slice(eventsToSend.length);
      this.pendingTxHashHints = this.pendingTxHashHints.slice(txHintsToSend.length);
      this.pendingSafeMsgHints = this.pendingSafeMsgHints.slice(safeMsgHintsToSend.length);
      this.pendingSafeTxHints = this.pendingSafeTxHints.slice(safeTxHintsToSend.length);

      // Temporarily swap in the batch for buildTraceData
      const savedEvents = this.pendingEvents;
      const savedTxHints = this.pendingTxHashHints;
      const savedSafeMsgs = this.pendingSafeMsgHints;
      const savedSafeTxs = this.pendingSafeTxHints;
      this.pendingEvents = eventsToSend;
      this.pendingTxHashHints = txHintsToSend;
      this.pendingSafeMsgHints = safeMsgHintsToSend;
      this.pendingSafeTxHints = safeTxHintsToSend;

      const traceData = this.buildTraceData();
      const itemCount = this.countItems(traceData);
      this.pendingAttributes = {};
      this.pendingTags = [];
      this.pendingEvents = savedEvents;
      this.pendingTxHashHints = savedTxHints;
      this.pendingSafeMsgHints = savedSafeMsgs;
      this.pendingSafeTxHints = savedSafeTxs;

      this.enqueueFlush(traceData, itemCount);
    } else {
      const traceData = this.buildTraceData();
      const itemCount = this.countItems(traceData);
      this.clearPending();
      this.enqueueFlush(traceData, itemCount);
    }

    if (overflow) {
      this.scheduleFlush();
    }
  }

  /**
   * Count total items in a TraceData payload
   */
  private countItems(traceData: TraceData): number {
    return (traceData.events?.length ?? 0) +
      (traceData.txHashHints?.length ?? 0) +
      (traceData.safeMsgHints?.length ?? 0) +
      (traceData.safeTxHints?.length ?? 0) +
      (traceData.attributes?.length ?? 0) +
      (traceData.tags?.length ?? 0);
  }

  /**
   * Enqueue a flush operation onto the flush queue for strict ordering.
   */
  private enqueueFlush(traceData: TraceData, itemCount: number): void {
    const traceName = this.name;

    this.flushQueue = this.flushQueue.then(async () => {
      if (this.abandoned) return;

      // Rate limit check: if rate-limited, wait until the window passes
      const now = Date.now();
      if (this.client.rateLimitedUntil > now) {
        const waitMs = this.client.rateLimitedUntil - now;
        this.client.logger.warn(`[MiradorTrace] Rate limited, waiting ${waitMs}ms`);
        await this.sleep(waitMs);
      }

      await this.flushTrace(traceData, itemCount);
    }).catch(err => {
      const context = traceName ? ` (trace: ${traceName})` : '';
      this.client.logger.error(`[MiradorTrace] Flush error during FlushTrace${context}:`, err);
      this.invokeCallback('onFlushError', err as Error, 'FlushTrace');
    });
  }

  /**
   * Get the trace ID (available immediately — generated client-side)
   * @returns The trace ID
   */
  getTraceId(): string {
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
   * Sleep for the specified duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Race a promise against a timeout
   */
  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
      promise.then(
        (val) => { clearTimeout(timer); resolve(val); },
        (err) => { clearTimeout(timer); reject(err); },
      );
    });
  }

  /**
   * Check if an error is retryable (network errors and specific gRPC status codes)
   */
  private isRetryableError(err: unknown): boolean {
    if (err instanceof Error && err.message.startsWith('Timeout after ')) return true;
    const code = (err as { code?: number }).code;
    if (code !== undefined && RETRYABLE_GRPC_CODES.has(code)) return true;
    return false;
  }

  /**
   * Execute an operation with exponential backoff retry.
   * Only retries on network errors and specific gRPC status codes.
   * Uses full jitter to prevent thundering herd.
   */
  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.withTimeout(operation(), this.callTimeoutMs);
      } catch (err) {
        lastError = err as Error;

        // Detect rate limiting (RESOURCE_EXHAUSTED) and set client-wide backoff
        const code = (err as { code?: number }).code;
        if (code === 8) {
          this.client.rateLimitedUntil = Date.now() + 30_000;
        }

        if (!this.isRetryableError(err)) {
          break;
        }

        if (attempt < this.maxRetries) {
          // Full jitter: random(0, base * 2^attempt) to prevent thundering herd
          const maxDelay = this.retryBackoff * Math.pow(2, attempt);
          const delay = Math.random() * maxDelay;
          this.client.logger.warn(
            `[MiradorTrace] ${operationName} failed, retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${this.maxRetries})`
          );
          await this.sleep(delay);
        }
      }
    }

    throw lastError;
  }

  /**
   * Send FlushTrace request (idempotent create-or-update)
   */
  private async flushTrace(traceData: TraceData, itemCount: number = 0): Promise<void> {
    const request: FlushTraceRequest = {
      traceId: this.traceId,
      name: this.name,
      data: traceData,
      sendClientTimestamp: new Date(),
    };

    try {
      const response = await this.retryWithBackoff(
        () => this.client._flushTrace(request),
        'FlushTrace'
      );

      if (response.status?.code !== ResponseStatus_StatusCode.STATUS_CODE_SUCCESS) {
        this.client.logger.error('[MiradorTrace] FlushTrace failed:', response.status?.errorMessage || 'Unknown error');
        return;
      }

      // Note: response.traceId is intentionally ignored. IDs are client-generated,
      // so we don't expect the server to reassign them. If server-side deduplication
      // or ID correction is ever needed, this is where to handle the reassigned ID.

      this.flushedOnce = true;
      this.invokeCallback('onFlushed', this.traceId, itemCount);
      if (this.autoKeepAlive) {
        this.startKeepAlive();
      }
    } catch (err) {
      this.client.logger.error('[MiradorTrace] FlushTrace error after retries:', err);
      this.invokeCallback('onFlushError', err as Error, 'FlushTrace');
      this.abandonTrace();
    }
  }

  /**
   * Build the TraceData payload from pending data.
   * Stack trace attributes are included on the first flush only.
   */
  private buildTraceData(): TraceData {
    const attributesToSend = { ...this.pendingAttributes };

    // Include stack trace attributes on the first flush only
    if (!this.flushedOnce && this.creationStackTrace) {
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
      tags: this.pendingTags.length > 0
        ? [{ tags: [...this.pendingTags], timestamp: new Date() }]
        : [],
      events: this.pendingEvents.map((e) => ({
        name: e.eventName,
        details: e.details,
        timestamp: e.timestamp,
      })),
      txHashHints: this.pendingTxHashHints.map((hint) => ({
        chain: CHAIN_MAP[hint.chain],
        txHash: hint.txHash,
        details: hint.details,
        timestamp: hint.timestamp,
      })),
      safeMsgHints: this.pendingSafeMsgHints.map((hint) => ({
        chain: CHAIN_MAP[hint.chain],
        messageHash: hint.messageHash,
        details: hint.details,
        timestamp: hint.timestamp,
      })),
      safeTxHints: this.pendingSafeTxHints.map((hint) => ({
        chain: CHAIN_MAP[hint.chain],
        safeTxHash: hint.safeTxHash,
        details: hint.details,
        timestamp: hint.timestamp,
      })),
    };
  }

  /**
   * Clear all pending data after a flush
   */
  private clearPending(): void {
    this.pendingAttributes = {};
    this.pendingTags = [];
    this.pendingEvents = [];
    this.pendingTxHashHints = [];
    this.pendingSafeMsgHints = [];
    this.pendingSafeTxHints = [];
  }

  /**
   * Start the keep-alive timer.
   * Called automatically for new traces. Call manually to enable keepalive on resumed traces.
   */
  startKeepAlive(): void {
    if (this.keepAliveTimer || this.closed) {
      return;
    }

    this.keepAliveTimer = setInterval(() => {
      // Max trace lifetime safety net (0 = disabled)
      if (this.maxTraceLifetimeMs > 0 && Date.now() - this.traceCreatedAt >= this.maxTraceLifetimeMs) {
        this.close('Max trace lifetime exceeded');
        return;
      }
      this.sendKeepAlive();
    }, this.keepAliveIntervalMs);
  }

  /**
   * Stop the keep-alive timer
   */
  stopKeepAlive(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }

  /**
   * Send a keep-alive ping to the server.
   * Includes in-flight guard, single retry, and consecutive failure tracking.
   */
  private async sendKeepAlive(): Promise<void> {
    if (!this.traceId || this.closed || this.abandoned) {
      return;
    }

    // In-flight guard — skip if previous keepAlive hasn't completed
    if (this.keepAliveInFlight) {
      return;
    }

    this.keepAliveInFlight = true;
    const request: KeepAliveRequest = {
      traceId: this.traceId,
    };

    try {
      const response = await this.withTimeout(
        this.client._keepAlive(request),
        this.callTimeoutMs,
      );

      if (!response.accepted) {
        this.client.logger.warn('[MiradorTrace] Keep-alive not accepted for trace:', this.traceId);
        this.stopKeepAlive();
      }
      this.keepAliveConsecutiveFailures = 0;
    } catch (firstErr) {
      // Single immediate retry before counting as failure
      try {
        const retryResponse = await this.withTimeout(
          this.client._keepAlive(request),
          this.callTimeoutMs,
        );
        if (retryResponse.accepted) {
          this.keepAliveConsecutiveFailures = 0;
          return;
        }
      } catch {
        // Retry also failed
      }

      this.keepAliveConsecutiveFailures++;
      this.client.logger.error('[MiradorTrace] Keep-alive error:', firstErr);
      if (this.keepAliveConsecutiveFailures >= Trace.MAX_KEEPALIVE_FAILURES) {
        this.client.logger.warn('[MiradorTrace] KeepAlive stopped after consecutive failures');
        this.stopKeepAlive();
      }
    } finally {
      this.keepAliveInFlight = false;
    }
  }

  /**
   * Mark the trace as abandoned after retry exhaustion.
   * No further API calls will be attempted.
   */
  private abandonTrace(): void {
    this.abandoned = true;
    this.microtaskScheduled = false;
    this.stopKeepAlive();
    this.clearPending();
  }

  /**
   * Close the trace and stop all timers.
   * Drains the flush queue before sending CloseTrace to ensure all pending data is sent.
   * @param reason Optional reason for closing the trace
   */
  async close(reason?: string): Promise<void> {
    if (this.closed) {
      return;
    }

    // Flush any pending data before marking closed
    this.flush();

    this.closed = true;
    this.stopKeepAlive();

    // If trace was abandoned, skip all network calls
    if (this.abandoned) {
      return;
    }

    // Wait for flush queue with a timeout to avoid indefinite hangs
    await Promise.race([this.flushQueue, this.sleep(5000)]);

    // Send close request — retry once on failure
    if (this.traceId) {
      const request: CloseTraceRequest = {
        traceId: this.traceId,
        text: reason,
      };

      try {
        const response = await this.withTimeout(
          this.client._closeTrace(request),
          3000,
        );

        if (!response.accepted) {
          this.client.logger.warn('[MiradorTrace] Close request not accepted for trace:', this.traceId);
        }
      } catch {
        // Single retry
        try {
          await this.withTimeout(
            this.client._closeTrace(request),
            3000,
          );
        } catch (retryErr) {
          this.client.logger.error('[MiradorTrace] CloseTrace error after retry:', retryErr);
        }
      }

      this.invokeCallback('onClosed', this.traceId, reason);
    }
  }
}

/**
 * No-op trace returned when sampling decides not to send the trace.
 * Has the same API surface as Trace but does nothing.
 */
export class NoopTrace extends Trace {
  constructor() {
    const noopLogger = { debug() {}, warn() {}, error() {} };
    const noop = () => Promise.resolve({ status: null, traceId: '', accepted: true } as never);
    const stub: TraceSubmitter = {
      _flushTrace: noop,
      _keepAlive: noop,
      _closeTrace: noop,
      logger: noopLogger,
      rateLimitedUntil: 0,
    };
    super(stub, {
      traceId: '0'.repeat(32),
      captureStackTrace: false,
      maxRetries: 0,
      retryBackoff: 0,
      keepAliveIntervalMs: 0,
      autoKeepAlive: false,
      callTimeoutMs: 0,
      maxTraceLifetimeMs: 0,
    });
    // Immediately close to prevent any timers or network calls
    (this as unknown as { closed: boolean }).closed = true;
  }

  // Override all public methods to be no-ops
  addAttribute(): this { return this; }
  addAttributes(): this { return this; }
  addTag(): this { return this; }
  addTags(): this { return this; }
  addEvent(): this { return this; }
  addStackTrace(): this { return this; }
  addExistingStackTrace(): this { return this; }
  addTxHint(): this { return this; }
  addSafeMsgHint(): this { return this; }
  addSafeTxHint(): this { return this; }
  addTxInputData(): this { return this; }
  addTx(): this { return this; }
  setProvider(): this { return this; }
  flush(): void {}
  async close(): Promise<void> {}
  getTraceId(): string { return '0'.repeat(32); }
  isClosed(): boolean { return true; }
  startKeepAlive(): void {}
  stopKeepAlive(): void {}
}
