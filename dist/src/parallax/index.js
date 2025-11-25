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
exports.ParallaxClient = void 0;
const apiGateway = __importStar(require("mirador-gateway-api/proto/gateway/api/v1/api_gateway"));
const grpc_1 = require("../grpc");
const GRPC_GATEWAY_API_URL = process.env.GRPC_BASE_URL_API || "localhost:50053";
const debugIssue = (trace, error) => {
    // Handle our own debugging / logging here
    console.error(`[ParallaxClient][${trace}] Error:`, error);
};
class ParallaxClient {
    // TODO: eventually we use this to pass the api key into the NodeGrpcRpc headers
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.apiUrl = GRPC_GATEWAY_API_URL;
        // TODO: add apiKey integration for sdk consumption
        // TODO: add the options into the apiGatewayRpc initialization.
        this.apiGatewayRpc = new grpc_1.NodeGrpcRpc(this.apiUrl, apiKey);
    }
    /**
     * Create a new trace
     */
    createTrace(params) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const apiGatewayClient = new apiGateway.ApiGatewayServiceClientImpl(this.apiGatewayRpc);
                return yield apiGatewayClient.CreateTrace(params);
            }
            catch (_error) {
                debugIssue("createTrace", new Error('Error creating trace'));
                throw _error;
            }
        });
    }
    /**
     * Start a new span within a trace
     * @param params Parameters to start a new span
     */
    startSpan(params) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const apiGatewayClient = new apiGateway.ApiGatewayServiceClientImpl(this.apiGatewayRpc);
                return yield apiGatewayClient.StartSpan(params);
            }
            catch (_error) {
                debugIssue("startSpan", new Error('Error starting span'));
                throw _error;
            }
        });
    }
    /**
     * Finish a span within a trace
     * @param params Parameters to finish a span
     */
    finishSpan(params) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const apiGatewayClient = new apiGateway.ApiGatewayServiceClientImpl(this.apiGatewayRpc);
                return yield apiGatewayClient.FinishSpan(params);
            }
            catch (_error) {
                debugIssue("finishSpan", new Error('Error finishing span'));
                throw _error;
            }
        });
    }
    /**
     * Add attributes to a span
     * @param params Parameters to add attributes to a span
     */
    addSpanAttributes(params) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const apiGatewayClient = new apiGateway.ApiGatewayServiceClientImpl(this.apiGatewayRpc);
                return yield apiGatewayClient.AddSpanAttributes(params);
            }
            catch (_error) {
                debugIssue("addSpanAttributes", new Error('Error adding span attributes'));
                throw _error;
            }
        });
    }
    /**
     * Add an event to a span
     * @param params Parameters to add an event to a span
     */
    addSpanEvent(params) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const apiGatewayClient = new apiGateway.ApiGatewayServiceClientImpl(this.apiGatewayRpc);
                return yield apiGatewayClient.AddSpanEvent(params);
            }
            catch (_error) {
                debugIssue("addSpanEvent", new Error('Error adding span event'));
                throw _error;
            }
        });
    }
    /**
     * Add an error to a span
     * @param params Parameters to add an error to a span
     */
    addSpanError(params) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const apiGatewayClient = new apiGateway.ApiGatewayServiceClientImpl(this.apiGatewayRpc);
                return yield apiGatewayClient.AddSpanError(params);
            }
            catch (_error) {
                debugIssue("addSpanError", new Error('Error adding span error'));
                throw _error;
            }
        });
    }
    /**
     * Add a hint to a span
     * @param params Parameters to add a hint to a span
     */
    addSpanHint(params) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const apiGatewayClient = new apiGateway.ApiGatewayServiceClientImpl(this.apiGatewayRpc);
                return yield apiGatewayClient.AddSpanHint(params);
            }
            catch (_error) {
                debugIssue("addSpanHint", new Error('Error adding span hint'));
                throw _error;
            }
        });
    }
}
exports.ParallaxClient = ParallaxClient;
