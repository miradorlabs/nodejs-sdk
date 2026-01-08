/**
 * ParallaxClient - Main client for interacting with the Parallax Gateway
 */
import type { CreateTraceRequest, CreateTraceResponse } from 'mirador-gateway-parallax/proto/gateway/parallax/v1/parallax_gateway';
import { ParallaxGatewayServiceClientImpl } from 'mirador-gateway-parallax/proto/gateway/parallax/v1/parallax_gateway';
import { NodeGrpcRpc } from '../grpc';
import { ParallaxTrace } from './trace';

const DEFAULT_API_URL = 'parallax-gateway-dev.mirador.org:443';

/**
 * Main client for interacting with the Parallax Gateway API
 */
export class ParallaxClient {
  public apiUrl: string;
  public apiKey?: string;
  private rpc: NodeGrpcRpc;

  /**
   * Create a new ParallaxClient instance
   * @param apiKey API key for authentication (sent as x-parallax-api-key header)
   * @param apiUrl Optional gateway URL (defaults to parallax-gateway-dev.mirador.org:443)
   */
  constructor(apiKey?: string, apiUrl?: string) {
    this.apiKey = apiKey;
    this.apiUrl = apiUrl || DEFAULT_API_URL;
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
   * Create a new trace builder
   *
   * Example usage:
   * ```typescript
   * const traceId = await client.trace("swap_execution")
   *   .addAttribute("user", "0xabc...")
   *   .addAttribute("slippage_bps", 25)
   *   .addTag("dex")
   *   .addEvent("wallet_connected", { wallet: "MetaMask" })
   *   .setTxHint("0x123...", "ethereum")
   *   .create();
   * ```
   *
   * @param name Optional name of the trace (defaults to empty string)
   * @returns A ParallaxTrace builder instance
   */
  trace(name: string = ''): ParallaxTrace {
    return new ParallaxTrace(this, name);
  }
}
