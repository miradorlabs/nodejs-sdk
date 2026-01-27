/**
 * ParallaxClient - Main client for interacting with the Parallax Gateway
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
import { ParallaxGatewayServiceClientImpl } from 'mirador-gateway-parallax/proto/gateway/parallax/v1/parallax_gateway';
import { NodeGrpcRpc } from '../grpc';
import { ParallaxTrace } from './trace';
import type { ParallaxClientOptions, TraceOptions } from './types';

// Default configuration values
const DEFAULT_API_URL = 'parallax-gateway-dev.mirador.org:443';
const DEFAULT_KEEP_ALIVE_INTERVAL_MS = 10000;

/**
 * Main client for interacting with the Parallax Gateway API
 */
export class ParallaxClient {
  public apiUrl: string;
  public apiKey?: string;
  public keepAliveIntervalMs: number;
  private rpc: NodeGrpcRpc;

  /**
   * Create a new ParallaxClient instance
   * @param apiKey API key for authentication (sent as x-parallax-api-key header)
   * @param options Optional configuration options
   */
  constructor(apiKey?: string, options?: ParallaxClientOptions) {
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
    const client = new ParallaxGatewayServiceClientImpl(this.rpc);
    return await client.CreateTrace(request);
  }

  /**
   * Internal method to update an existing trace
   * @internal
   */
  async _updateTrace(request: UpdateTraceRequest): Promise<UpdateTraceResponse> {
    const client = new ParallaxGatewayServiceClientImpl(this.rpc);
    return await client.UpdateTrace(request);
  }

  /**
   * Internal method to send keep-alive ping
   * @internal
   */
  async _keepAlive(request: KeepAliveRequest): Promise<KeepAliveResponse> {
    const client = new ParallaxGatewayServiceClientImpl(this.rpc);
    return await client.KeepAlive(request);
  }

  /**
   * Internal method to close a trace
   * @internal
   */
  async _closeTrace(request: CloseTraceRequest): Promise<CloseTraceResponse> {
    const client = new ParallaxGatewayServiceClientImpl(this.rpc);
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
   * @returns A ParallaxTrace builder instance
   */
  trace(name: string = '', options?: TraceOptions): ParallaxTrace {
    return new ParallaxTrace(this, name, options);
  }
}
