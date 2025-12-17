// Parallax SDK Client
import type {
  CreateTraceRequest,
  CreateTraceResponse,
  StartSpanRequest,
  StartSpanResponse,
  FinishSpanRequest,
  FinishSpanResponse,
  AddSpanEventRequest,
  AddSpanEventResponse,
  AddSpanErrorRequest,
  AddSpanErrorResponse,
  AddSpanHintRequest,
  AddSpanHintResponse
} from "mirador-gateway-parallax/proto/gateway/parallax/v1/parallax_gateway";
import { ParallaxGatewayServiceClientImpl } from "mirador-gateway-parallax/proto/gateway/parallax/v1/parallax_gateway";
import { NodeGrpcRpc } from "../grpc";

const GRPC_GATEWAY_API_URL = process.env.GRPC_BASE_URL_API || "gateway-parallax-dev.platform.svc.cluster.local:50053";

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
   * Create a new trace
   * @param params Parameters to create a new trace
   * @returns Response from the create trace operation
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
   * Start a new span within a trace
   * @param params Parameters to start a new span
   * @returns Response from the start span operation
   */
  async startSpan(params: StartSpanRequest): Promise<StartSpanResponse> {
    try {
      const apiGatewayClient = new ParallaxGatewayServiceClientImpl(
        this.apiGatewayRpc
      );
      return await apiGatewayClient.StartSpan(params);
    } catch (_error) {
      debugIssue("startSpan", new Error('Error starting span'));
      throw _error;
    }
  }

  /**
   * Finish a span within a trace
   * @param params Parameters to finish a span
   * @returns Response from the finish span operation
   */
  async finishSpan(params: FinishSpanRequest): Promise<FinishSpanResponse> {
    try {
      const apiGatewayClient = new ParallaxGatewayServiceClientImpl(
        this.apiGatewayRpc
      );
      return await apiGatewayClient.FinishSpan(params);
    } catch (_error) {
      debugIssue("finishSpan", new Error('Error finishing span'));
      throw _error;
    }
  }

  /**
   * Add an event to a span
   * @param params Parameters to add an event to a span
   * @returns Response from the add span event operation
   */
  async addSpanEvent(params: AddSpanEventRequest): Promise<AddSpanEventResponse> {
    try {
      const apiGatewayClient = new ParallaxGatewayServiceClientImpl(
        this.apiGatewayRpc
      );
      return await apiGatewayClient.AddSpanEvent(params);
    } catch (_error) {
      debugIssue("addSpanEvent", new Error('Error adding span event'));
      throw _error;
    }
  }

  /**
   * Add an error to a span
   * @param params Parameters to add an error to a span
   * @returns Response from the add span error operation
   */
  async addSpanError(params: AddSpanErrorRequest): Promise<AddSpanErrorResponse> {
    try {
      const apiGatewayClient = new ParallaxGatewayServiceClientImpl(
        this.apiGatewayRpc
      );
      return await apiGatewayClient.AddSpanError(params);
    } catch (_error) {
      debugIssue("addSpanError", new Error('Error adding span error'));
      throw _error;
    }
  }

  /**
   * Add a hint to a span
   * @param params Parameters to add a hint to a span
   * @returns Response from the add span hint operation
   */
  async addSpanHint(params: AddSpanHintRequest): Promise<AddSpanHintResponse> {
    try {
      const apiGatewayClient = new ParallaxGatewayServiceClientImpl(
        this.apiGatewayRpc
      );
      return await apiGatewayClient.AddSpanHint(params);
    } catch (_error) {
      debugIssue("addSpanHint", new Error('Error adding span hint'));
      throw _error;
    }
  }
}

export { ParallaxClient };