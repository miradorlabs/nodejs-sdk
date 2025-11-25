import * as grpc from "@grpc/grpc-js";
import { Observable } from "rxjs";
interface Rpc {
    request(service: string, method: string, data: Uint8Array, metadata?: grpc.Metadata): Promise<Uint8Array>;
    clientStreamingRequest(service: string, method: string, data: Observable<Uint8Array>): Promise<Uint8Array>;
    serverStreamingRequest(service: string, method: string, data: Uint8Array): Observable<Uint8Array>;
    bidirectionalStreamingRequest(service: string, method: string, data: Observable<Uint8Array>): Observable<Uint8Array>;
}
export declare class NodeGrpcRpc implements Rpc {
    private channel;
    private url;
    constructor(url: string, apiKey?: string);
    request(service: string, method: string, data: Uint8Array, metadata?: grpc.Metadata): Promise<Uint8Array>;
    clientStreamingRequest(): Promise<Uint8Array>;
    serverStreamingRequest(service: string, method: string, data: Uint8Array): Observable<Uint8Array>;
    bidirectionalStreamingRequest(): Observable<Uint8Array>;
}
export {};
