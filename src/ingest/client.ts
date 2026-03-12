/**
 * Client - Main client for interacting with the Mirador Ingest Gateway
 */
import type {
  FlushTraceRequest,
  FlushTraceResponse,
  KeepAliveRequest,
  KeepAliveResponse,
  CloseTraceRequest,
  CloseTraceResponse,
} from 'mirador-gateway-ingest/proto/gateway/ingest/v1/ingest_gateway';
import { IngestGatewayServiceClientImpl } from 'mirador-gateway-ingest/proto/gateway/ingest/v1/ingest_gateway';
import { NodeGrpcRpc } from '../grpc';
import { Trace, NoopTrace } from './trace';
import type { ClientOptions, TraceOptions, Logger, TraceCallbacks } from './types';
import { randomBytes } from 'crypto';

/**
 * Generate a W3C-compatible trace ID (32 lowercase hex chars / 128 bits)
 */
function generateTraceId(): string {
  return randomBytes(16).toString('hex');
}

// Default configuration values
const DEFAULT_API_URL = 'ingest.mirador.org:443';
const DEFAULT_KEEP_ALIVE_INTERVAL_MS = 10000;
const DEFAULT_CAPTURE_STACK_TRACE = true;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_BACKOFF = 500;
const DEFAULT_CALL_TIMEOUT_MS = 5000;

/** Default no-op logger that silences all output */
const NOOP_LOGGER: Logger = {
  debug() {},
  warn() {},
  error() {},
};

/** Default console logger (uses dynamic lookup so test spies work) */
const CONSOLE_LOGGER: Logger = {
  debug(...args: unknown[]) { console.debug(...args); },
  warn(...args: unknown[]) { console.warn(...args); },
  error(...args: unknown[]) { console.error(...args); },
};

/**
 * Main client for interacting with the Mirador Ingest Gateway API
 */
export class Client {
  public apiUrl: string;
  public apiKey?: string;
  public keepAliveIntervalMs: number;
  private callTimeoutMs: number;
  private rpc: NodeGrpcRpc;
  private grpcClient: IngestGatewayServiceClientImpl;
  private provider?: import('./types').EIP1193Provider;

  /** @internal */ readonly logger: Logger;
  /** @internal */ readonly callbacks?: TraceCallbacks;
  /** @internal */ rateLimitedUntil: number = 0;

  private sampleRate: number;
  private sampler?: (options: TraceOptions) => boolean;

  /**
   * Create a new Client instance
   * @param apiKey API key for authentication (sent as x-ingest-api-key header)
   * @param options Optional configuration options
   */
  constructor(apiKey?: string, options?: ClientOptions) {
    this.apiKey = apiKey;
    this.apiUrl = options?.apiUrl ?? DEFAULT_API_URL;
    this.keepAliveIntervalMs = options?.keepAliveIntervalMs ?? DEFAULT_KEEP_ALIVE_INTERVAL_MS;
    this.callTimeoutMs = options?.callTimeoutMs ?? DEFAULT_CALL_TIMEOUT_MS;
    this.provider = options?.provider;
    this.callbacks = options?.callbacks;
    this.sampleRate = options?.sampleRate ?? 1;
    if (this.sampleRate < 0 || this.sampleRate > 1) {
      throw new Error('sampleRate must be between 0 and 1');
    }
    this.sampler = options?.sampler;

    // Configure logger: custom > debug console > noop
    if (options?.logger) {
      this.logger = options.logger;
    } else if (options?.debug) {
      this.logger = CONSOLE_LOGGER;
    } else {
      this.logger = NOOP_LOGGER;
    }

    this.rpc = new NodeGrpcRpc(this.apiUrl, apiKey, options?.useSsl ?? true);
    this.grpcClient = new IngestGatewayServiceClientImpl(this.rpc);
  }

  /**
   * Internal method to flush trace to gateway (idempotent create-or-update)
   * @internal
   */
  async _flushTrace(request: FlushTraceRequest): Promise<FlushTraceResponse> {
    return await this.grpcClient.FlushTrace(request);
  }

  /**
   * Internal method to send keep-alive ping
   * @internal
   */
  async _keepAlive(request: KeepAliveRequest): Promise<KeepAliveResponse> {
    return await this.grpcClient.KeepAlive(request);
  }

  /**
   * Internal method to close a trace
   * @internal
   */
  async _closeTrace(request: CloseTraceRequest): Promise<CloseTraceResponse> {
    return await this.grpcClient.CloseTrace(request);
  }

  /**
   * Create a new trace builder
   *
   * Builder methods auto-flush via microtask batching — no need to call create().
   *
   * Example usage:
   * ```typescript
   * const trace = client.trace({ name: "swap_execution" })
   *   .addAttribute("user", "0xabc...")
   *   .addTag("dex")
   *   .addEvent("wallet_connected", { wallet: "MetaMask" })
   *   .addTxHint("0x123...", "ethereum");
   * // Data is auto-flushed at the end of the current JS tick.
   * // Call trace.close() when the trace is complete.
   * ```
   *
   * @param options Trace configuration options
   * @returns A Trace builder instance (or NoopTrace if sampled out)
   */
  trace(options?: TraceOptions): Trace {
    // Sampling: check if this trace should be sampled out
    const traceOptions = options ?? {};
    if (this.sampler) {
      if (!this.sampler(traceOptions)) {
        return new NoopTrace();
      }
    } else if (this.sampleRate < 1) {
      if (Math.random() >= this.sampleRate) {
        return new NoopTrace();
      }
    }

    // Generate a W3C trace ID (32 hex chars) if not provided
    const traceId = traceOptions.traceId ?? generateTraceId();

    return new Trace(this, {
      name: traceOptions.name,
      traceId,
      captureStackTrace: traceOptions.captureStackTrace ?? DEFAULT_CAPTURE_STACK_TRACE,
      maxRetries: traceOptions.maxRetries ?? DEFAULT_MAX_RETRIES,
      retryBackoff: traceOptions.retryBackoff ?? DEFAULT_RETRY_BACKOFF,
      keepAliveIntervalMs: this.keepAliveIntervalMs,
      provider: traceOptions.provider ?? this.provider,
      autoKeepAlive: traceOptions.autoKeepAlive ?? !traceOptions.traceId,
      callTimeoutMs: this.callTimeoutMs,
      maxTraceLifetimeMs: traceOptions.maxTraceLifetimeMs ?? 0,
      maxQueueSize: traceOptions.maxQueueSize,
      callbacks: traceOptions.callbacks ?? this.callbacks,
    });
  }
}
