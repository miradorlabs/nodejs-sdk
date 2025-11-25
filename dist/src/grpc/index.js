"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NodeGrpcRpc = void 0;
const grpc = __importStar(require("@grpc/grpc-js"));
const rxjs_1 = require("rxjs");
const helpers_1 = require("../helpers");
class NodeGrpcRpc {
    constructor(url, apiKey) {
        this.url = url;
        this.channel = new grpc.Channel(url, grpc.ChannelCredentials.createInsecure(), Object.assign({}, (apiKey ? { "x-api-key": apiKey } : {})));
    }
    request(service, method, data, metadata) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                console.log(`[gRPC] Making request to ${this.url}/${service}/${method}`);
                const credentials = grpc.ChannelCredentials.createInsecure();
                const client = new grpc.Client(this.url, credentials);
                const grpcMetadata = metadata || new grpc.Metadata();
                const deadline = new Date();
                deadline.setSeconds(deadline.getSeconds() + 5);
                // Make the unary RPC call
                client.makeUnaryRequest(`/${service}/${method}`, helpers_1.serialize, helpers_1.deserialize, Buffer.from(data), grpcMetadata, { deadline }, (err, value) => {
                    if (err) {
                        console.error(`[gRPC] Error from ${this.url}/${service}/${method}:`, err.message);
                        reject(err);
                    }
                    else if (value) {
                        console.log(`[gRPC] Success from ${this.url}/${service}/${method}`);
                        resolve(new Uint8Array(value));
                    }
                    else {
                        reject(new Error("No response received"));
                    }
                });
            });
        });
    }
    clientStreamingRequest() {
        throw new Error("Client streaming not yet implemented");
    }
    serverStreamingRequest(service, method, data) {
        return new rxjs_1.Observable((subscriber) => {
            const credentials = grpc.ChannelCredentials.createInsecure();
            const client = new grpc.Client(this.url, credentials);
            const metadata = new grpc.Metadata();
            const call = client.makeServerStreamRequest(`/${service}/${method}`, helpers_1.serialize, helpers_1.deserialize, Buffer.from(data), metadata);
            call.on("data", (response) => {
                subscriber.next(new Uint8Array(response));
            });
            call.on("end", () => {
                subscriber.complete();
            });
            call.on("error", (err) => {
                subscriber.error(err);
            });
            return () => {
                call.cancel();
            };
        });
    }
    bidirectionalStreamingRequest() {
        throw new Error("Bidirectional streaming not yet implemented");
    }
}
exports.NodeGrpcRpc = NodeGrpcRpc;
