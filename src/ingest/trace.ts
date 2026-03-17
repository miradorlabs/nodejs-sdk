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
import { ResponseStatus_StatusCode } from 'mirador-gateway-ingest/proto/gateway/common/v1/status';
import type { TraceEvent, StackTrace, TraceCallbacks } from './types';
import type { AddEventOptions, Logger } from '@miradorlabs/plugins';
import type { MiradorPlugin, TraceContext, FlushBuilder } from '@miradorlabs/plugins';
import { captureStackTrace, formatStackTrace } from './stacktrace';
import { HINT_SERIALIZERS } from './hint-serializers';

/** Options passed to Trace constructor (with defaults applied) */
interface ResolvedTraceOptions {
  name?: string;
  traceId: string;
  captureStackTrace: boolean;
  maxRetries: number;
  retryBackoff: number;
  keepAliveIntervalMs: number;
  autoKeepAlive: boolean;
  callTimeoutMs: number;
  maxTraceLifetimeMs: number;
  maxQueueSize?: number;
  callbacks?: TraceCallbacks;
}

/** gRPC status codes that are safe to retry.
 * Note: RESOURCE_EXHAUSTED (8) is handled separately in retryWithBackoff
 * via client-wide rate limiting, not via retry. */
const RETRYABLE_GRPC_CODES = new Set([
  4,  // DEADLINE_EXCEEDED
  13, // INTERNAL
  14, // UNAVAILABLE
]);

/** Default queue size limit */
const DEFAULT_MAX_QUEUE_SIZE = 4096;

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
  protected closed: boolean = false;
  private creationStackTrace: StackTrace | null = null;

  // Pending data — cleared after each flush
  private pendingAttributes: { [key: string]: string } = {};
  private pendingTags: string[] = [];
  private pendingEvents: TraceEvent[] = [];

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
  private lifetimeTimer: ReturnType<typeof setTimeout> | null = null;

  // Queue size limit
  private maxQueueSize: number;

  // Lifecycle callbacks
  private callbacks?: TraceCallbacks;

  // Trace abandonment
  private abandoned: boolean = false;
  // Set during close() to skip rate-limit waits in enqueueFlush
  private closing: boolean = false;

  // Plugin system
  private pluginOnFlush: Array<(builder: FlushBuilder) => void> = [];
  private pluginOnClose: Array<() => void> = [];
  private pluginHasPending: Array<() => boolean> = [];

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

    if (options.captureStackTrace) {
      // Skip 2 frames: this constructor and the trace() method that called it
      this.creationStackTrace = captureStackTrace(2);
    }

    // Dedicated lifetime timer — fires even when autoKeepAlive is false
    if (this.maxTraceLifetimeMs > 0) {
      this.lifetimeTimer = setTimeout(() => {
        this.close('Max trace lifetime exceeded');
      }, this.maxTraceLifetimeMs);
    }
  }

  /**
   * Initialize plugins on this trace instance.
   * Called by Client.trace() after construction.
   * @internal
   */
  _initPlugins(plugins: MiradorPlugin<object>[]): void {
    const ctx: TraceContext = {
      addEvent: (name, details, options) => { this.addEvent(name, details, options); },
      addAttribute: (key, value) => { this.addAttribute(key, value); },
      addAttributes: (attrs) => { this.addAttributes(attrs); },
      addTag: (tag) => { this.addTag(tag); },
      addTags: (tags) => { this.addTags(tags); },
      getTraceId: () => this.getTraceId(),
      isClosed: () => this.isClosed(),
      scheduleFlush: () => this.scheduleFlush(),
      logger: this.client.logger,
    };

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const trace = this;

    function mergeNamespace(
      target: Record<string, unknown>,
      source: Record<string, unknown>,
      pluginName: string,
    ): void {
      for (const [key, value] of Object.entries(source)) {
        if (typeof value === 'function') {
          if (key in target && typeof target[key] !== 'undefined') {
            ctx.logger.warn(
              `[MiradorTrace] Plugin "${pluginName}" method "${key}" conflicts with existing method. Skipping.`
            );
            continue;
          }
          const fn = value as (...args: unknown[]) => unknown;
          target[key] = (...args: unknown[]) => {
            const ret = fn(...args);
            return ret === undefined ? trace : ret;
          };
        } else if (typeof value === 'object' && value !== null) {
          if (!target[key] || typeof target[key] !== 'object') {
            target[key] = {};
          }
          mergeNamespace(target[key] as Record<string, unknown>, value as Record<string, unknown>, pluginName);
        }
      }
    }

    for (const plugin of plugins) {
      try {
        const result = plugin.setup(ctx);
        mergeNamespace(this as unknown as Record<string, unknown>, result.methods as Record<string, unknown>, plugin.name);

        if (result.onFlush) {
          this.pluginOnFlush.push(result.onFlush);
        }
        if (result.onClose) {
          this.pluginOnClose.push(result.onClose);
        }
        if (result.hasPendingData) {
          this.pluginHasPending.push(result.hasPendingData);
        }
      } catch (err) {
        ctx.logger.error(`[MiradorTrace] Plugin "${plugin.name}" setup failed:`, err);
      }
    }
  }

  /**
   * Get current total pending items count
   */
  private get pendingCount(): number {
    return Object.keys(this.pendingAttributes).length +
      this.pendingTags.length +
      this.pendingEvents.length;
  }

  /**
   * Check if the queue is full and warn/invoke callback if so
   */
  private isQueueFull(itemCount: number = 1): boolean {
    if (this.abandoned) {
      this.invokeCallback('onDropped', itemCount, 'Trace abandoned');
      return true;
    }
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

    // Check if there's anything to flush (core data or plugin data)
    const hasCoreData =
      Object.keys(this.pendingAttributes).length > 0 ||
      this.pendingTags.length > 0 ||
      this.pendingEvents.length > 0;

    const hasPluginData = this.pluginHasPending.some(fn => {
      try { return fn(); } catch { return false; }
    });

    if (!hasCoreData && !hasPluginData && this.flushedOnce) {
      return; // Nothing to flush and trace already sent
    }

    // Cap batch size: if too many events, keep extras pending for next flush
    const totalItems = this.pendingEvents.length;
    let overflow = false;

    if (totalItems > Trace.MAX_FLUSH_BATCH_SIZE) {
      overflow = true;
      const eventsToSend = this.pendingEvents.slice(0, Trace.MAX_FLUSH_BATCH_SIZE);

      // Keep the rest pending
      const savedEvents = this.pendingEvents.slice(eventsToSend.length);
      this.pendingEvents = eventsToSend;

      const traceData = this.buildTraceData();
      const itemCount = this.countItems(traceData);
      this.pendingAttributes = {};
      this.pendingTags = [];
      this.pendingEvents = savedEvents;

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

      // Rate limit check: if rate-limited, wait unless we're closing (to avoid exceeding close timeout)
      if (!this.closing) {
        const now = Date.now();
        if (this.client.rateLimitedUntil > now) {
          const waitMs = this.client.rateLimitedUntil - now;
          this.client.logger.warn(`[MiradorTrace] Rate limited, waiting ${waitMs}ms`);
          await this.sleep(waitMs);
        }
      }

      await this.flushTrace(traceData, itemCount);
    }).catch(err => {
      // Safety net — flushTrace already handles expected errors and invokes onFlushError
      const context = traceName ? ` (trace: ${traceName})` : '';
      this.client.logger.error(`[MiradorTrace] Unexpected flush error${context}:`, err);
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

        // Detect rate limiting (RESOURCE_EXHAUSTED) and set client-wide backoff.
        // Don't retry here — enqueueFlush already waits out the rate-limit window.
        const code = (err as { code?: number }).code;
        if (code === 8) {
          this.client.rateLimitedUntil = Date.now() + 30_000;
          break;
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

      const wasFirstFlush = !this.flushedOnce;
      this.flushedOnce = true;
      if (wasFirstFlush) {
        this.invokeCallback('onCreated', this.traceId);
      }
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
   * Plugin onFlush hooks are called to contribute additional data.
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

    const traceData: TraceData = {
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
      txHashHints: [],
      safeMsgHints: [],
      safeTxHints: [],
    };

    // Let plugins contribute data
    if (this.pluginOnFlush.length > 0) {
      const builder = this.createFlushBuilder(traceData);
      for (const onFlush of this.pluginOnFlush) {
        try {
          onFlush(builder);
        } catch (err) {
          this.client.logger.error('[MiradorTrace] Plugin onFlush error:', err);
        }
      }
    }

    return traceData;
  }

  /**
   * Create a FlushBuilder that populates the given TraceData with plugin contributions.
   */
  private createFlushBuilder(traceData: TraceData): FlushBuilder {
    const logger = this.client.logger;
    return {
      addHint(type: string, data: Record<string, unknown>) {
        const serializer = HINT_SERIALIZERS[type];
        if (!serializer) {
          logger.warn(`[MiradorTrace] Unknown hint type: "${type}". Hint dropped.`);
          return;
        }
        serializer(traceData, data);
      },
      addEvent(event) {
        traceData.events!.push({
          name: event.name,
          details: event.details,
          timestamp: event.timestamp,
        });
      },
      addAttribute(key, value) {
        if (!traceData.attributes || traceData.attributes.length === 0) {
          traceData.attributes = [{ attributes: {}, timestamp: new Date() }];
        }
        traceData.attributes[0].attributes[key] = value;
      },
      addTag(tag) {
        if (!traceData.tags || traceData.tags.length === 0) {
          traceData.tags = [{ tags: [], timestamp: new Date() }];
        }
        traceData.tags[0].tags.push(tag);
      },
    };
  }

  /**
   * Clear all pending data after a flush
   */
  private clearPending(): void {
    this.pendingAttributes = {};
    this.pendingTags = [];
    this.pendingEvents = [];
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
    if (this.lifetimeTimer) {
      clearTimeout(this.lifetimeTimer);
      this.lifetimeTimer = null;
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
        // Retry succeeded but not accepted — stop keepalive
        this.client.logger.warn('[MiradorTrace] Keep-alive not accepted for trace:', this.traceId);
        this.stopKeepAlive();
        return;
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

    // Signal closing so enqueueFlush skips rate-limit waits
    this.closing = true;

    // Flush any pending data before marking closed
    this.flush();

    this.closed = true;
    this.stopKeepAlive();

    // Call plugin onClose hooks
    for (const onClose of this.pluginOnClose) {
      try {
        onClose();
      } catch (err) {
        this.client.logger.error('[MiradorTrace] Plugin onClose error:', err);
      }
    }

    // If trace was abandoned, skip all network calls
    if (this.abandoned) {
      return;
    }

    // Wait for flush queue with a timeout to avoid indefinite hangs
    let drainTimedOut = false;
    await Promise.race([
      this.flushQueue,
      this.sleep(5000).then(() => { drainTimedOut = true; }),
    ]);
    if (drainTimedOut) {
      this.client.logger.warn('[MiradorTrace] Flush queue drain timed out after 5s, some data may not have been sent');
    }

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
    this.closed = true;
  }

  /**
   * Override: Install plugin methods as no-ops without full setup.
   * @internal
   */
  _initPlugins(plugins: MiradorPlugin<object>[]): void {
    const noopCtx: TraceContext = {
      addEvent() {},
      addAttribute() {},
      addAttributes() {},
      addTag() {},
      addTags() {},
      getTraceId: () => '0'.repeat(32),
      isClosed: () => true,
      scheduleFlush() {},
      logger: { debug() {}, warn() {}, error() {} },
    };

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const trace = this;

    function mergeNamespaceNoop(
      target: Record<string, unknown>,
      source: Record<string, unknown>,
      noopSource: Record<string, unknown> | undefined,
    ): void {
      for (const [key, value] of Object.entries(source)) {
        const noopValue = noopSource?.[key];
        if (typeof value === 'function') {
          if (noopValue && typeof noopValue === 'function') {
            target[key] = noopValue;
          } else {
            target[key] = () => trace;
          }
        } else if (typeof value === 'object' && value !== null) {
          if (!target[key] || typeof target[key] !== 'object') {
            target[key] = {};
          }
          mergeNamespaceNoop(
            target[key] as Record<string, unknown>,
            value as Record<string, unknown>,
            (noopValue && typeof noopValue === 'object') ? noopValue as Record<string, unknown> : undefined,
          );
        }
      }
    }

    for (const plugin of plugins) {
      try {
        const result = plugin.setup(noopCtx);
        mergeNamespaceNoop(
          this as unknown as Record<string, unknown>,
          result.methods as Record<string, unknown>,
          result.noopMethods as Record<string, unknown> | undefined,
        );
        // Do NOT register onFlush/onClose hooks — NoopTrace never flushes
      } catch {
        // Swallow errors in noop context
      }
    }
  }

  // Override all public methods to be no-ops
  addAttribute(): this { return this; }
  addAttributes(): this { return this; }
  addTag(): this { return this; }
  addTags(): this { return this; }
  addEvent(): this { return this; }
  addStackTrace(): this { return this; }
  addExistingStackTrace(): this { return this; }
  flush(): void {}
  async close(): Promise<void> {}
  /** Sentinel trace ID — not a valid trace, used only for NoopTrace */
  getTraceId(): string { return '0'.repeat(32); }
  isClosed(): boolean { return true; }
  startKeepAlive(): void {}
  stopKeepAlive(): void {}
}
