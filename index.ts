export * from './src/parallax';
export { NodeGrpcRpc } from './src/grpc';

// Re-export types from mirador-gateway-parallax for convenience
export type {
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
} from 'mirador-gateway-parallax/proto/gateway/parallax/v1/parallax_gateway';

// Re-export enums
export { FinishSpanRequest_SpanStatus_StatusCode } from 'mirador-gateway-parallax/proto/gateway/parallax/v1/parallax_gateway';