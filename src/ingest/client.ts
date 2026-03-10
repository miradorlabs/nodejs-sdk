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
import { Trace } from './trace';
import type { ClientOptions, TraceOptions } from './types';
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
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_BACKOFF = 1000;

/**
 * Main client for interacting with the Mirador Ingest Gateway API
 */
export class Client {
  public apiUrl: string;
  public apiKey?: string;
  public keepAliveIntervalMs: number;
  private rpc: NodeGrpcRpc;
  private provider?: import('./types').EIP1193Provider;

  /**
   * Create a new Client instance
   * @param apiKey API key for authentication (sent as x-ingest-api-key header)
   * @param options Optional configuration options
   */
  constructor(apiKey?: string, options?: ClientOptions) {
    this.apiKey = apiKey;
    this.apiUrl = options?.apiUrl || DEFAULT_API_URL;
    this.keepAliveIntervalMs = options?.keepAliveIntervalMs || DEFAULT_KEEP_ALIVE_INTERVAL_MS;
    this.provider = options?.provider;
    this.rpc = new NodeGrpcRpc(this.apiUrl, apiKey, options?.useSsl ?? true);
  }

  /**
   * Internal method to flush trace to gateway (idempotent create-or-update)
   * @internal
   */
  async _flushTrace(request: FlushTraceRequest): Promise<FlushTraceResponse> {
    const client = new IngestGatewayServiceClientImpl(this.rpc);
    return await client.FlushTrace(request);
  }

  /**
   * Internal method to send keep-alive ping
   * @internal
   */
  async _keepAlive(request: KeepAliveRequest): Promise<KeepAliveResponse> {
    const client = new IngestGatewayServiceClientImpl(this.rpc);
    return await client.KeepAlive(request);
  }

  /**
   * Internal method to close a trace
   * @internal
   */
  async _closeTrace(request: CloseTraceRequest): Promise<CloseTraceResponse> {
    const client = new IngestGatewayServiceClientImpl(this.rpc);
    return await client.CloseTrace(request);
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
   * @returns A Trace builder instance
   */
  trace(options?: TraceOptions): Trace {
    // Generate a W3C trace ID (32 hex chars) if not provided
    const traceId = options?.traceId ?? generateTraceId();

    return new Trace(this, {
      name: options?.name,
      traceId,
      captureStackTrace: options?.captureStackTrace ?? DEFAULT_CAPTURE_STACK_TRACE,
      maxRetries: options?.maxRetries ?? DEFAULT_MAX_RETRIES,
      retryBackoff: options?.retryBackoff ?? DEFAULT_RETRY_BACKOFF,
      keepAliveIntervalMs: this.keepAliveIntervalMs,
      provider: options?.provider ?? this.provider,
      autoKeepAlive: options?.autoKeepAlive ?? !options?.traceId,
    });
  }
}
