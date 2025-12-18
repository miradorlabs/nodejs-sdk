export * from './src/parallax';
export { NodeGrpcRpc } from './src/grpc';

// Re-export types from mirador-gateway-parallax for convenience
export type {
  CreateTraceRequest,
  CreateTraceResponse,
  CreateTraceRequest_Event,
} from 'mirador-gateway-parallax/proto/gateway/parallax/v1/parallax_gateway';