/**
 * Client - Main client for interacting with the Mirador Ingest Gateway
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
import { IngestGatewayServiceClientImpl } from 'mirador-gateway-ingest/proto/gateway/ingest/v1/ingest_gateway';
import { NodeGrpcRpc } from '../grpc';
import { Trace } from './trace';
import type { ClientOptions, TraceOptions } from './types';

// Default configuration values
const DEFAULT_API_URL = 'ingest.mirador.org:443';
const DEFAULT_KEEP_ALIVE_INTERVAL_MS = 10000;

/**
 * Main client for interacting with the Mirador Ingest Gateway API
 */
export class Client {
  public apiUrl: string;
  public apiKey?: string;
  public keepAliveIntervalMs: number;
  private rpc: NodeGrpcRpc;

  /**
   * Create a new Client instance
   * @param apiKey API key for authentication (sent as x-ingest-api-key header)
   * @param options Optional configuration options
   */
  constructor(apiKey?: string, options?: ClientOptions) {
    this.apiKey = apiKey;
    this.apiUrl = options?.apiUrl || DEFAULT_API_URL;
    this.keepAliveIntervalMs = options?.keepAliveIntervalMs || DEFAULT_KEEP_ALIVE_INTERVAL_MS;
    this.rpc = new NodeGrpcRpc(this.apiUrl, apiKey);
  }

  /**
   * Internal method to send trace to gateway
   * @internal
   */
  async _sendTrace(request: CreateTraceRequest): Promise<CreateTraceResponse> {
    const client = new IngestGatewayServiceClientImpl(this.rpc);
    return await client.CreateTrace(request);
  }

  /**
   * Internal method to update an existing trace
   * @internal
   */
  async _updateTrace(request: UpdateTraceRequest): Promise<UpdateTraceResponse> {
    const client = new IngestGatewayServiceClientImpl(this.rpc);
    return await client.UpdateTrace(request);
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
   * Example usage:
   * ```typescript
   * const traceId = await client.trace("swap_execution", { captureStackTrace: true })
   *   .addAttribute("user", "0xabc...")
   *   .addAttribute("slippage_bps", 25)
   *   .addTag("dex")
   *   .addEvent("wallet_connected", { wallet: "MetaMask" })
   *   .setTxHint("0x123...", "ethereum")
   *   .create();
   * ```
   *
   * @param name Optional name of the trace (defaults to empty string)
   * @param options Optional trace options including captureStackTrace
   * @returns A Trace builder instance
   */
  trace(name: string = '', options?: TraceOptions): Trace {
    return new Trace(this, name, options);
  }
}
