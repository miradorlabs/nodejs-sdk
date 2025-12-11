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
  private channel: grpc.Channel;
  private url: string;
  private apiKey?: string;

  constructor(url: string, apiKey?: string) {
    this.url = url;
    this.apiKey = apiKey;
    this.channel = new grpc.Channel(
      url,
      grpc.ChannelCredentials.createInsecure(),
      {}
    );
  }

  async request(
    service: string,
    method: string,
    data: Uint8Array,
    metadata?: grpc.Metadata
  ): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      console.log(`[gRPC] Making request to ${this.url}/${service}/${method}`);
      const credentials = grpc.ChannelCredentials.createInsecure();
      const client = new grpc.Client(this.url, credentials);

      const grpcMetadata = metadata || new grpc.Metadata();

      // Add API key to metadata if provided
      if (this.apiKey) {
        grpcMetadata.add('x-api-key', this.apiKey);
      }

      const deadline = new Date();
      deadline.setSeconds(deadline.getSeconds() + 5);

      // Make the unary RPC call
      client.makeUnaryRequest(
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
      const credentials = grpc.ChannelCredentials.createInsecure();
      const client = new grpc.Client(this.url, credentials);

      const metadata = new grpc.Metadata();

      // Add API key to metadata if provided
      if (this.apiKey) {
        metadata.add('x-api-key', this.apiKey);
      }

      const call = client.makeServerStreamRequest(
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
