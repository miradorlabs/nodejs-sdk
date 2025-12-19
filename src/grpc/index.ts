import * as grpc from "@grpc/grpc-js";
import { Observable } from "rxjs";

import {
  deserialize,
  serialize
} from "../helpers";

interface Rpc {
  request(
    service: string,
    method: string,
    data: Uint8Array,
    metadata?: grpc.Metadata
  ): Promise<Uint8Array>;
  clientStreamingRequest(
    service: string,
    method: string,
    data: Observable<Uint8Array>
  ): Promise<Uint8Array>;
  serverStreamingRequest(
    service: string,
    method: string,
    data: Uint8Array
  ): Observable<Uint8Array>;
  bidirectionalStreamingRequest(
    service: string,
    method: string,
    data: Observable<Uint8Array>
  ): Observable<Uint8Array>;
}

export class NodeGrpcRpc implements Rpc {
  private client: grpc.Client;
  private url: string;
  private apiKey?: string;

  constructor(url: string, apiKey?: string) {
    this.url = url;
    this.apiKey = apiKey;
    // Create a single reusable client with connection pooling
    const credentials = grpc.ChannelCredentials.createSsl();
    this.client = new grpc.Client(url, credentials, {
      'grpc.keepalive_time_ms': 30000,
      'grpc.keepalive_timeout_ms': 10000,
      'grpc.keepalive_permit_without_calls': 1,
    });
  }

  async request(
    service: string,
    method: string,
    data: Uint8Array,
    metadata?: grpc.Metadata
  ): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      console.log(`[gRPC] Making request to ${this.url}/${service}/${method}`);
      const grpcMetadata = metadata || new grpc.Metadata();

      // Add API key to metadata if provided
      if (this.apiKey) {
        console.log(`[gRPC] Adding X-Parallax-Api-Key header with API key: ${this.apiKey?.substring(0, 10)}...`);
        grpcMetadata.add('x-parallax-api-key', this.apiKey);
      } else {
        console.log(`[gRPC] WARNING: No API key provided!`);
      }

      const deadline = new Date();
      deadline.setSeconds(deadline.getSeconds() + 5);

      // Make the unary RPC call using the reusable client
      this.client.makeUnaryRequest(
        `/${service}/${method}`,
        serialize,
        deserialize,
        Buffer.from(data),
        grpcMetadata,
        { deadline },
        (err: grpc.ServiceError | null, value?: Buffer) => {
          if (err) {
            console.error(
              `[gRPC] Error from ${this.url}/${service}/${method}:`,
              err.message
            );
            reject(err);
          } else if (value) {
            console.log(`[gRPC] Success from ${this.url}/${service}/${method}`);
            resolve(new Uint8Array(value));
          } else {
            reject(new Error("No response received"));
          }
        }
      );
    });
  }

  clientStreamingRequest(): Promise<Uint8Array> {
    throw new Error("Client streaming not yet implemented");
  }

  serverStreamingRequest(
    service: string,
    method: string,
    data: Uint8Array
  ): Observable<Uint8Array> {
    return new Observable((subscriber) => {
      const metadata = new grpc.Metadata();

      // Add API key to metadata if provided
      if (this.apiKey) {
        metadata.add('x-parallax-api-key', this.apiKey);
      }

      // Use the reusable client
      const call = this.client.makeServerStreamRequest(
        `/${service}/${method}`,
        serialize,
        deserialize,
        Buffer.from(data),
        metadata
      );

      call.on("data", (response: Buffer) => {
        subscriber.next(new Uint8Array(response));
      });

      call.on("end", () => {
        subscriber.complete();
      });

      call.on("error", (err: Error) => {
        subscriber.error(err);
      });

      return () => {
        call.cancel();
      };
    });
  }

  bidirectionalStreamingRequest(): Observable<Uint8Array> {
    throw new Error("Bidirectional streaming not yet implemented");
  }
}
