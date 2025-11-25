import type { CreateTraceRequest, StartSpanRequest, FinishSpanRequest, AddSpanAttributesRequest, AddSpanEventRequest, AddSpanErrorRequest, AddSpanHintRequest } from "mirador-gateway-api/proto/gateway/api/v1/api_gateway";
import * as apiGateway from "mirador-gateway-api/proto/gateway/api/v1/api_gateway";
declare class ParallaxClient {
    apiKey?: string | undefined;
    private apiUrl;
    private apiGatewayRpc;
    constructor(apiKey?: string | undefined);
    /**
     * Create a new trace
     */
    createTrace(params: CreateTraceRequest): Promise<apiGateway.CreateTraceResponse>;
    /**
     * Start a new span within a trace
     * @param params Parameters to start a new span
     */
    startSpan(params: StartSpanRequest): Promise<apiGateway.StartSpanResponse>;
    /**
     * Finish a span within a trace
     * @param params Parameters to finish a span
     */
    finishSpan(params: FinishSpanRequest): Promise<apiGateway.FinishSpanResponse>;
    /**
     * Add attributes to a span
     * @param params Parameters to add attributes to a span
     */
    addSpanAttributes(params: AddSpanAttributesRequest): Promise<apiGateway.AddSpanAttributesResponse>;
    /**
     * Add an event to a span
     * @param params Parameters to add an event to a span
     */
    addSpanEvent(params: AddSpanEventRequest): Promise<apiGateway.AddSpanEventResponse>;
    /**
     * Add an error to a span
     * @param params Parameters to add an error to a span
     */
    addSpanError(params: AddSpanErrorRequest): Promise<apiGateway.AddSpanErrorResponse>;
    /**
     * Add a hint to a span
     * @param params Parameters to add a hint to a span
     */
    addSpanHint(params: AddSpanHintRequest): Promise<apiGateway.AddSpanHintResponse>;
}
export { ParallaxClient };
