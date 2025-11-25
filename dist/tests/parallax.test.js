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
// ParallaxClient Unit Tests
const parallax_1 = require("../src/parallax");
const grpc_1 = require("../src/grpc");
const apiGateway = __importStar(require("mirador-gateway-api/proto/gateway/api/v1/api_gateway"));
const status_1 = require("mirador-gateway-api/proto/common/v1/status");
// Mock the NodeGrpcRpc class
jest.mock('../src/grpc');
// Mock console.error to avoid cluttering test output
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation();
describe('ParallaxClient', () => {
    let parallaxClient;
    let mockApiGatewayClient;
    beforeEach(() => {
        // Clear all mocks before each test
        jest.clearAllMocks();
        // Create a new ParallaxClient instance
        parallaxClient = new parallax_1.ParallaxClient('test-api-key');
        // Create mock for ApiGatewayServiceClientImpl
        mockApiGatewayClient = {
            CreateTrace: jest.fn(),
            StartSpan: jest.fn(),
            FinishSpan: jest.fn(),
            AddSpanAttributes: jest.fn(),
            AddSpanEvent: jest.fn(),
            AddSpanError: jest.fn(),
            AddSpanHint: jest.fn(),
        };
        // Mock the ApiGatewayServiceClientImpl constructor
        jest.spyOn(apiGateway, 'ApiGatewayServiceClientImpl').mockImplementation(() => mockApiGatewayClient);
    });
    afterEach(() => {
        mockConsoleError.mockClear();
    });
    afterAll(() => {
        mockConsoleError.mockRestore();
    });
    describe('constructor', () => {
        it('should create a ParallaxClient instance with API key', () => {
            const client = new parallax_1.ParallaxClient('my-api-key');
            expect(client).toBeInstanceOf(parallax_1.ParallaxClient);
            expect(client.apiKey).toBe('my-api-key');
        });
        it('should create a ParallaxClient instance without API key', () => {
            const client = new parallax_1.ParallaxClient();
            expect(client).toBeInstanceOf(parallax_1.ParallaxClient);
            expect(client.apiKey).toBeUndefined();
        });
        it('should initialize NodeGrpcRpc with the correct URL and API key', () => {
            const apiKey = 'test-key';
            new parallax_1.ParallaxClient(apiKey);
            expect(grpc_1.NodeGrpcRpc).toHaveBeenCalledWith('localhost:50053', apiKey);
        });
    });
    describe('createTrace', () => {
        it('should create a trace successfully', () => __awaiter(void 0, void 0, void 0, function* () {
            const mockRequest = {
                name: 'Test Trace',
                attributes: {
                    'project.id': 'test-project',
                    'environment': 'test'
                },
            };
            const mockResponse = {
                status: {
                    code: status_1.ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
                    errorMessage: undefined
                },
                traceId: 'trace-123',
            };
            mockApiGatewayClient.CreateTrace.mockResolvedValue(mockResponse);
            const result = yield parallaxClient.createTrace(mockRequest);
            expect(result).toEqual(mockResponse);
            expect(mockApiGatewayClient.CreateTrace).toHaveBeenCalledWith(mockRequest);
            expect(mockApiGatewayClient.CreateTrace).toHaveBeenCalledTimes(1);
        }));
        it('should handle errors when creating a trace', () => __awaiter(void 0, void 0, void 0, function* () {
            const mockRequest = {
                name: 'Test Trace',
                attributes: {},
            };
            const mockError = new Error('gRPC connection failed');
            mockApiGatewayClient.CreateTrace.mockRejectedValue(mockError);
            yield expect(parallaxClient.createTrace(mockRequest)).rejects.toThrow('gRPC connection failed');
            expect(mockConsoleError).toHaveBeenCalledWith('[ParallaxClient][createTrace] Error:', expect.any(Error));
        }));
    });
    describe('startSpan', () => {
        it('should start a span successfully', () => __awaiter(void 0, void 0, void 0, function* () {
            const mockRequest = {
                name: 'Test Span',
                traceId: 'trace-123',
                parentSpanId: undefined,
                attributes: {
                    'span.type': 'http'
                },
                startTime: undefined,
            };
            const mockResponse = {
                status: {
                    code: status_1.ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
                    errorMessage: undefined
                },
                spanId: 'span-456',
            };
            mockApiGatewayClient.StartSpan.mockResolvedValue(mockResponse);
            const result = yield parallaxClient.startSpan(mockRequest);
            expect(result).toEqual(mockResponse);
            expect(mockApiGatewayClient.StartSpan).toHaveBeenCalledWith(mockRequest);
            expect(mockApiGatewayClient.StartSpan).toHaveBeenCalledTimes(1);
        }));
        it('should handle errors when starting a span', () => __awaiter(void 0, void 0, void 0, function* () {
            const mockRequest = {
                name: 'Test Span',
                traceId: 'trace-123',
                attributes: {},
            };
            const mockError = new Error('Span creation failed');
            mockApiGatewayClient.StartSpan.mockRejectedValue(mockError);
            yield expect(parallaxClient.startSpan(mockRequest)).rejects.toThrow('Span creation failed');
            expect(mockConsoleError).toHaveBeenCalledWith('[ParallaxClient][startSpan] Error:', expect.any(Error));
        }));
    });
    describe('finishSpan', () => {
        it('should finish a span successfully', () => __awaiter(void 0, void 0, void 0, function* () {
            const mockRequest = {
                traceId: 'trace-123',
                spanId: 'span-456',
                endTime: undefined,
                status: undefined,
            };
            const mockResponse = {
                status: {
                    code: status_1.ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
                    errorMessage: undefined
                },
            };
            mockApiGatewayClient.FinishSpan.mockResolvedValue(mockResponse);
            const result = yield parallaxClient.finishSpan(mockRequest);
            expect(result).toEqual(mockResponse);
            expect(mockApiGatewayClient.FinishSpan).toHaveBeenCalledWith(mockRequest);
            expect(mockApiGatewayClient.FinishSpan).toHaveBeenCalledTimes(1);
        }));
        it('should handle errors when finishing a span', () => __awaiter(void 0, void 0, void 0, function* () {
            const mockRequest = {
                traceId: 'trace-123',
                spanId: 'span-456',
            };
            const mockError = new Error('Finish span failed');
            mockApiGatewayClient.FinishSpan.mockRejectedValue(mockError);
            yield expect(parallaxClient.finishSpan(mockRequest)).rejects.toThrow('Finish span failed');
            expect(mockConsoleError).toHaveBeenCalledWith('[ParallaxClient][finishSpan] Error:', expect.any(Error));
        }));
    });
    describe('addSpanAttributes', () => {
        it('should add span attributes successfully', () => __awaiter(void 0, void 0, void 0, function* () {
            const mockRequest = {
                traceId: 'trace-123',
                spanId: 'span-456',
                attributes: {
                    key1: 'value1',
                    key2: 'value2',
                },
            };
            const mockResponse = {
                status: {
                    code: status_1.ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
                    errorMessage: undefined
                },
            };
            mockApiGatewayClient.AddSpanAttributes.mockResolvedValue(mockResponse);
            const result = yield parallaxClient.addSpanAttributes(mockRequest);
            expect(result).toEqual(mockResponse);
            expect(mockApiGatewayClient.AddSpanAttributes).toHaveBeenCalledWith(mockRequest);
            expect(mockApiGatewayClient.AddSpanAttributes).toHaveBeenCalledTimes(1);
        }));
        it('should handle errors when adding span attributes', () => __awaiter(void 0, void 0, void 0, function* () {
            const mockRequest = {
                traceId: 'trace-123',
                spanId: 'span-456',
                attributes: {},
            };
            const mockError = new Error('Add attributes failed');
            mockApiGatewayClient.AddSpanAttributes.mockRejectedValue(mockError);
            yield expect(parallaxClient.addSpanAttributes(mockRequest)).rejects.toThrow('Add attributes failed');
            expect(mockConsoleError).toHaveBeenCalledWith('[ParallaxClient][addSpanAttributes] Error:', expect.any(Error));
        }));
    });
    describe('addSpanEvent', () => {
        it('should add span event successfully', () => __awaiter(void 0, void 0, void 0, function* () {
            const mockRequest = {
                traceId: 'trace-123',
                spanId: 'span-456',
                eventName: 'Test Event',
                attributes: {
                    eventType: 'custom',
                },
                timestamp: undefined,
            };
            const mockResponse = {
                status: {
                    code: status_1.ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
                    errorMessage: undefined
                },
            };
            mockApiGatewayClient.AddSpanEvent.mockResolvedValue(mockResponse);
            const result = yield parallaxClient.addSpanEvent(mockRequest);
            expect(result).toEqual(mockResponse);
            expect(mockApiGatewayClient.AddSpanEvent).toHaveBeenCalledWith(mockRequest);
            expect(mockApiGatewayClient.AddSpanEvent).toHaveBeenCalledTimes(1);
        }));
        it('should handle errors when adding span event', () => __awaiter(void 0, void 0, void 0, function* () {
            const mockRequest = {
                traceId: 'trace-123',
                spanId: 'span-456',
                eventName: 'Test Event',
                attributes: {},
            };
            const mockError = new Error('Add event failed');
            mockApiGatewayClient.AddSpanEvent.mockRejectedValue(mockError);
            yield expect(parallaxClient.addSpanEvent(mockRequest)).rejects.toThrow('Add event failed');
            expect(mockConsoleError).toHaveBeenCalledWith('[ParallaxClient][addSpanEvent] Error:', expect.any(Error));
        }));
    });
    describe('addSpanError', () => {
        it('should add span error successfully', () => __awaiter(void 0, void 0, void 0, function* () {
            const mockRequest = {
                traceId: 'trace-123',
                spanId: 'span-456',
                errorType: 'RuntimeError',
                message: 'Something went wrong',
                stackTrace: undefined,
                attributes: {},
                timestamp: undefined,
            };
            const mockResponse = {
                status: {
                    code: status_1.ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
                    errorMessage: undefined
                },
            };
            mockApiGatewayClient.AddSpanError.mockResolvedValue(mockResponse);
            const result = yield parallaxClient.addSpanError(mockRequest);
            expect(result).toEqual(mockResponse);
            expect(mockApiGatewayClient.AddSpanError).toHaveBeenCalledWith(mockRequest);
            expect(mockApiGatewayClient.AddSpanError).toHaveBeenCalledTimes(1);
        }));
        it('should handle errors when adding span error', () => __awaiter(void 0, void 0, void 0, function* () {
            const mockRequest = {
                traceId: 'trace-123',
                spanId: 'span-456',
                errorType: 'Error',
                message: 'Error message',
                attributes: {},
            };
            const mockError = new Error('Add error failed');
            mockApiGatewayClient.AddSpanError.mockRejectedValue(mockError);
            yield expect(parallaxClient.addSpanError(mockRequest)).rejects.toThrow('Add error failed');
            expect(mockConsoleError).toHaveBeenCalledWith('[ParallaxClient][addSpanError] Error:', expect.any(Error));
        }));
    });
    describe('addSpanHint', () => {
        it('should add span hint successfully', () => __awaiter(void 0, void 0, void 0, function* () {
            const mockRequest = {
                traceId: 'trace-123',
                parentSpanId: 'span-456',
                timestamp: undefined,
                chainTransaction: {
                    txHash: '0x123abc',
                    chainId: 1,
                },
            };
            const mockResponse = {
                status: {
                    code: status_1.ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
                    errorMessage: undefined
                },
            };
            mockApiGatewayClient.AddSpanHint.mockResolvedValue(mockResponse);
            const result = yield parallaxClient.addSpanHint(mockRequest);
            expect(result).toEqual(mockResponse);
            expect(mockApiGatewayClient.AddSpanHint).toHaveBeenCalledWith(mockRequest);
            expect(mockApiGatewayClient.AddSpanHint).toHaveBeenCalledTimes(1);
        }));
        it('should handle errors when adding span hint', () => __awaiter(void 0, void 0, void 0, function* () {
            const mockRequest = {
                traceId: 'trace-123',
                parentSpanId: 'span-456',
                chainTransaction: undefined,
            };
            const mockError = new Error('Add hint failed');
            mockApiGatewayClient.AddSpanHint.mockRejectedValue(mockError);
            yield expect(parallaxClient.addSpanHint(mockRequest)).rejects.toThrow('Add hint failed');
            expect(mockConsoleError).toHaveBeenCalledWith('[ParallaxClient][addSpanHint] Error:', expect.any(Error));
        }));
    });
    describe('integration scenarios', () => {
        it('should handle multiple method calls in sequence', () => __awaiter(void 0, void 0, void 0, function* () {
            const traceRequest = {
                name: 'Integration Test',
                attributes: {
                    'project.id': 'test-project'
                },
            };
            const spanRequest = {
                name: 'Integration Span',
                traceId: 'trace-123',
                attributes: {},
            };
            mockApiGatewayClient.CreateTrace.mockResolvedValue({
                traceId: 'trace-123',
                status: {
                    code: status_1.ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
                    errorMessage: undefined
                }
            });
            mockApiGatewayClient.StartSpan.mockResolvedValue({
                spanId: 'span-456',
                status: {
                    code: status_1.ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
                    errorMessage: undefined
                }
            });
            yield parallaxClient.createTrace(traceRequest);
            yield parallaxClient.startSpan(spanRequest);
            expect(mockApiGatewayClient.CreateTrace).toHaveBeenCalledTimes(1);
            expect(mockApiGatewayClient.StartSpan).toHaveBeenCalledTimes(1);
        }));
        it('should create client instances with different API keys', () => {
            const client1 = new parallax_1.ParallaxClient('key1');
            const client2 = new parallax_1.ParallaxClient('key2');
            const client3 = new parallax_1.ParallaxClient();
            expect(client1.apiKey).toBe('key1');
            expect(client2.apiKey).toBe('key2');
            expect(client3.apiKey).toBeUndefined();
        });
    });
});
