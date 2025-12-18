// Parallax SDK Client
import type {
  CreateTraceRequest,
  CreateTraceResponse,
  CreateTraceRequest_Event,
} from "mirador-gateway-parallax/proto/gateway/parallax/v1/parallax_gateway";
import { ParallaxGatewayServiceClientImpl } from "mirador-gateway-parallax/proto/gateway/parallax/v1/parallax_gateway";
import { NodeGrpcRpc } from "../grpc";

const GRPC_GATEWAY_API_URL = "parallax-gateway.dev.mirador.org:443";

const debugIssue = (trace: string, error: Error) => {
  // Handle our own debugging / logging here
  console.error(`[ParallaxClient][${trace}] Error:`, error);
}

class ParallaxClient {
  public apiUrl: string = GRPC_GATEWAY_API_URL;
  private apiGatewayRpc: NodeGrpcRpc;

  constructor(public apiKey?: string, apiUrl?: string) {
    if (apiUrl) {
      this.apiUrl = apiUrl;
    }
    this.apiGatewayRpc = new NodeGrpcRpc(this.apiUrl, apiKey);
  }

  /**
   * Create a new trace with events
   *
   * Example usage:
   * ```typescript
   * const response = await client.createTrace({
   *   name: "my-trace",
   *   attributes: {
   *     userId: "123",
   *     environment: "production"
   *   },
   *   tags: ["payment", "critical"],
   *   events: [
   *     {
   *       eventName: "payment.initiated",
   *       details: JSON.stringify({ amount: 100, currency: "USD" }),
   *       timestamp: new Date()
   *     },
   *     {
   *       eventName: "payment.processed",
   *       details: JSON.stringify({ status: "success" }),
   *       timestamp: new Date()
   *     }
   *   ],
   *   txHashHint: {
   *     chainId: "ethereum",
   *     txHash: "0x123...",
   *     details: "Bridge transaction",
   *     timestamp: new Date()
   *   }
   * });
   * console.log("Created trace:", response.traceId);
   * ```
   *
   * @param params Parameters to create a new trace
   * @returns Response from the create trace operation containing the traceId
   */
  async createTrace(params: CreateTraceRequest): Promise<CreateTraceResponse> {
    try {
      const apiGatewayClient = new ParallaxGatewayServiceClientImpl(
        this.apiGatewayRpc
      );
      return await apiGatewayClient.CreateTrace(params);
    } catch (_error) {
      debugIssue("createTrace", new Error('Error creating trace'));
      throw _error;
    }
  }

  /**
   * Create a new trace builder
   *
   * Example usage:
   * ```typescript
   * const response = await client.trace("swap_execution")
   *   .addAttribute("user", "0xabc...")
   *   .addAttribute("slippage_bps", "25")
   *   .addTag("dex")
   *   .addTag("swap")
   *   .addEvent("wallet_connected", "MetaMask connected", new Date())
   *   .addEvent("quote_received", undefined, new Date())
   *   .addEvent("tx_signed")
   *   .submit("0x123...", "ethereum");
   * ```
   *
   * @param name The name of the trace
   * @returns A ParallaxTrace builder instance
   */
  trace(name: string): ParallaxTrace {
    return new ParallaxTrace(this, name);
  }
}

/**
 * Builder class for constructing traces with method chaining
 */
class ParallaxTrace {
  private name: string;
  private attributes: { [key: string]: string } = {};
  private tags: string[] = [];
  private events: CreateTraceRequest_Event[] = [];
  private txHashHint?: {
    txHash: string;
    chainId: string;
    details?: string;
    timestamp: Date;
  };
  private client: ParallaxClient;

  constructor(client: ParallaxClient, name: string) {
    this.client = client;
    this.name = name;
  }

  /**
   * Add an attribute to the trace
   * @param key Attribute key
   * @param value Attribute value (will be converted to string)
   * @returns This trace builder for chaining
   */
  addAttribute(key: string, value: string | number | boolean): this {
    this.attributes[key] = String(value);
    return this;
  }

  /**
   * Add multiple attributes to the trace
   * @param attributes Object containing key-value pairs
   * @returns This trace builder for chaining
   */
  addAttributes(attributes: { [key: string]: string | number | boolean }): this {
    for (const [key, value] of Object.entries(attributes)) {
      this.attributes[key] = String(value);
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
    const detailsString = typeof details === 'object' && details !== null
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
   * Set or update the transaction hash hint
   * @param txHash Transaction hash
   * @param chainId Chain ID (e.g., "ethereum", "polygon")
   * @param details Optional details about the transaction
   * @param timestamp Optional timestamp (defaults to current time)
   * @returns This trace builder for chaining
   */
  setTxHash(txHash: string, chainId: string, details?: string, timestamp?: Date): this {
    this.txHashHint = {
      txHash,
      chainId,
      details,
      timestamp: timestamp || new Date(),
    };
    return this;
  }

  /**
   * Submit the trace without a transaction hash hint (if not already set via setTxHash)
   * @returns Response from the create trace operation
   */
  async submit(): Promise<CreateTraceResponse>;

  /**
   * Submit the trace with a transaction hash hint (overrides any previously set via setTxHash)
   * @param txHash Transaction hash
   * @param chainId Chain ID (e.g., "ethereum", "polygon")
   * @param details Optional details about the transaction
   * @returns Response from the create trace operation
   */
  async submit(txHash: string, chainId: string, details?: string): Promise<CreateTraceResponse>;

  async submit(txHash?: string, chainId?: string, details?: string): Promise<CreateTraceResponse> {
    // If txHash and chainId are provided in submit(), they override any previously set txHashHint
    const finalTxHashHint = txHash && chainId ? {
      txHash,
      chainId,
      details,
      timestamp: new Date(),
    } : this.txHashHint;

    const request: CreateTraceRequest = {
      name: this.name,
      attributes: this.attributes,
      tags: this.tags,
      events: this.events,
      txHashHint: finalTxHashHint,
    };

    return this.client.createTrace(request);
  }
}

export { ParallaxClient, ParallaxTrace };