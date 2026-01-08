export * from './src/parallax';
export { NodeGrpcRpc } from './src/grpc';

// Re-export types from mirador-gateway-parallax for advanced usage
export type {
  CreateTraceRequest,
  CreateTraceResponse,
} from 'mirador-gateway-parallax/proto/gateway/parallax/v1/parallax_gateway';
