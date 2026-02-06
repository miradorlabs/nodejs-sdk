export * from './src/ingest';
export { NodeGrpcRpc } from './src/grpc';

// Re-export types from mirador-gateway-ingest for advanced usage
export type {
  CreateTraceRequest,
  CreateTraceResponse,
} from 'mirador-gateway-ingest/proto/gateway/ingest/v1/ingest_gateway';
