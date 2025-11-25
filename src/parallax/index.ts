
// Parallax SDK Client
import type {
  CreateTraceRequest,
  StartSpanRequest,
  FinishSpanRequest,
  AddSpanAttributesRequest,
  AddSpanEventRequest,
  AddSpanErrorRequest,
  AddSpanHintRequest
} from "mirador-gateway-parallax/proto/gateway/parallax/v1/parallax_gateway";
import * as apiGateway from "mirador-gateway-parallax/proto/gateway/parallax/v1/parallax_gateway";
import { NodeGrpcRpc } from "../grpc";


const GRPC_GATEWAY_API_URL = process.env.GRPC_BASE_URL_API || "localhost:50053";

const debugIssue = (trace: string, error: Error) => {
  // Handle our own debugging / logging here
  console.error(`[ParallaxClient][${trace}] Error:`, error);
}

class ParallaxClient {
  private apiUrl: string = GRPC_GATEWAY_API_URL;
  private apiGatewayRpc: NodeGrpcRpc;
  // TODO: eventually we use this to pass the api key into the NodeGrpcRpc headers
  constructor(public apiKey?: string) {
    // TODO: add apiKey integration for sdk consumption
    // TODO: add the options into the apiGatewayRpc initialization.
    this.apiGatewayRpc = new NodeGrpcRpc(this.apiUrl, apiKey);
  }

  /**
   * Create a new trace
   */
  async createTrace(params: CreateTraceRequest): Promise<apiGateway.CreateTraceResponse> {
    try {
      const apiGatewayClient = new apiGateway.ParallaxGatewayServiceClientImpl(
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
   */
  async startSpan(params: StartSpanRequest) {
    try {
      const apiGatewayClient = new apiGateway.ParallaxGatewayServiceClientImpl(
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
   */
  async finishSpan(params: FinishSpanRequest) {
    try {
      const apiGatewayClient = new apiGateway.ParallaxGatewayServiceClientImpl(
        this.apiGatewayRpc
      );
      return await apiGatewayClient.FinishSpan(params);
    } catch (_error) {
      debugIssue("finishSpan", new Error('Error finishing span'));
      throw _error;
    }
  }

  /**
   * Add attributes to a span
   * @param params Parameters to add attributes to a span
   */
  async addSpanAttributes(params: AddSpanAttributesRequest) {
    try {
      const apiGatewayClient = new apiGateway.ParallaxGatewayServiceClientImpl(
        this.apiGatewayRpc
      );
      return await apiGatewayClient.AddSpanAttributes(params);
    } catch (_error) {
      debugIssue("addSpanAttributes", new Error('Error adding span attributes'));
      throw _error;
    }
  }

  /**
   * Add an event to a span
   * @param params Parameters to add an event to a span
   */
  async addSpanEvent(params: AddSpanEventRequest) {
    try {
      const apiGatewayClient = new apiGateway.ParallaxGatewayServiceClientImpl(
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
   */
  async addSpanError(params: AddSpanErrorRequest) {
    try {
      const apiGatewayClient = new apiGateway.ParallaxGatewayServiceClientImpl(
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
   */
  async addSpanHint(params: AddSpanHintRequest) {
    try {
      const apiGatewayClient = new apiGateway.ParallaxGatewayServiceClientImpl(
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