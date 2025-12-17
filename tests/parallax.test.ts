// ParallaxClient Unit Tests
import { ParallaxClient } from '../src/parallax';
import { NodeGrpcRpc } from '../src/grpc';
import * as apiGateway from "mirador-gateway-parallax/proto/gateway/parallax/v1/parallax_gateway";
import { ResponseStatus_StatusCode } from "mirador-gateway-parallax/proto/common/v1/status";

// Mock the NodeGrpcRpc class
jest.mock('../src/grpc');

// Mock console.error to avoid cluttering test output
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation();

describe('ParallaxClient', () => {
  let parallaxClient: ParallaxClient;
  let mockApiGatewayClient: jest.Mocked<apiGateway.ParallaxGatewayServiceClientImpl>;

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Create a new ParallaxClient instance
    parallaxClient = new ParallaxClient("test-api-key");

    // Create mock for ApiGatewayServiceClientImpl
    mockApiGatewayClient = {
      CreateTrace: jest.fn(),
      StartSpan: jest.fn(),
      FinishSpan: jest.fn(),
      AddSpanEvent: jest.fn(),
      AddSpanError: jest.fn(),
      AddSpanHint: jest.fn(),
    } as unknown as jest.Mocked<apiGateway.ParallaxGatewayServiceClientImpl>;

    // Mock the ParallaxGatewayServiceClientImpl constructor
    jest
      .spyOn(apiGateway, "ParallaxGatewayServiceClientImpl")
      .mockImplementation(() => mockApiGatewayClient);
  });

  afterEach(() => {
    mockConsoleError.mockClear();
  });

  afterAll(() => {
    mockConsoleError.mockRestore();
  });

  describe('constructor', () => {
    it('should create a ParallaxClient instance with API key', () => {
      const client = new ParallaxClient('my-api-key');
      expect(client).toBeInstanceOf(ParallaxClient);
      expect(client.apiKey).toBe('my-api-key');
    });

    it('should create a ParallaxClient instance without API key', () => {
      const client = new ParallaxClient();
      expect(client).toBeInstanceOf(ParallaxClient);
      expect(client.apiKey).toBeUndefined();
    });

    it('should initialize NodeGrpcRpc with the correct URL and API key', () => {
      const apiKey = 'test-key';
      new ParallaxClient(apiKey);
      expect(NodeGrpcRpc).toHaveBeenCalledWith('gateway-parallax-dev.platform.svc.cluster.local:50053', apiKey);
    });
  });

  describe('createTrace', () => {
    it('should create a trace successfully', async () => {
      const mockRequest: apiGateway.CreateTraceRequest = {
        name: 'Test Trace',
        attributes: {
          'project.id': 'test-project',
          'environment': 'test'
        },
        tags: ['tag1', 'tag2'],
      };

      const mockResponse: apiGateway.CreateTraceResponse = {
        status: {
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        },
        traceId: 'trace-123',
        rootSpanId: 'span-root',
      };

      mockApiGatewayClient.CreateTrace.mockResolvedValue(mockResponse);

      const result = await parallaxClient.createTrace(mockRequest);

      expect(result).toEqual(mockResponse);
      expect(mockApiGatewayClient.CreateTrace).toHaveBeenCalledWith(mockRequest);
      expect(mockApiGatewayClient.CreateTrace).toHaveBeenCalledTimes(1);
    });

    it('should handle errors when creating a trace', async () => {
      const mockRequest: apiGateway.CreateTraceRequest = {
        name: 'Test Trace',
        attributes: {},
        tags: ['tag1', 'tag2'],
      };

      const mockError = new Error('gRPC connection failed');
      mockApiGatewayClient.CreateTrace.mockRejectedValue(mockError);

      await expect(parallaxClient.createTrace(mockRequest)).rejects.toThrow('gRPC connection failed');
      expect(mockConsoleError).toHaveBeenCalledWith(
        '[ParallaxClient][createTrace] Error:',
        expect.any(Error)
      );
    });
  });

  describe('startSpan', () => {
    it('should start a span successfully', async () => {
      const mockRequest: apiGateway.StartSpanRequest = {
        name: 'Test Span',
        traceId: 'trace-123',
        parentSpanId: 'test-123',
        attributes: {
          'span.type': 'http'
        },
        startTime: undefined,
      };

      const mockResponse: apiGateway.StartSpanResponse = {
        status: { 
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        },
        spanId: 'span-456',
      };

      mockApiGatewayClient.StartSpan.mockResolvedValue(mockResponse);

      const result = await parallaxClient.startSpan(mockRequest);

      expect(result).toEqual(mockResponse);
      expect(mockApiGatewayClient.StartSpan).toHaveBeenCalledWith(mockRequest);
      expect(mockApiGatewayClient.StartSpan).toHaveBeenCalledTimes(1);
    });

    it('should handle errors when starting a span', async () => {
      const mockRequest: apiGateway.StartSpanRequest = {
        name: 'Test Span',
        traceId: 'trace-123',
        parentSpanId: 'test-123',
        attributes: {},
      };

      const mockError = new Error('Span creation failed');
      mockApiGatewayClient.StartSpan.mockRejectedValue(mockError);

      await expect(parallaxClient.startSpan(mockRequest)).rejects.toThrow('Span creation failed');
      expect(mockConsoleError).toHaveBeenCalledWith(
        '[ParallaxClient][startSpan] Error:',
        expect.any(Error)
      );
    });
  });

  describe('finishSpan', () => {
    it('should finish a span successfully', async () => {
      const mockRequest: apiGateway.FinishSpanRequest = {
        traceId: 'trace-123',
        spanId: 'span-456',
        endTime: undefined,
        status: undefined,
      };

      const mockResponse: apiGateway.FinishSpanResponse = {
        status: { 
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        },
      };

      mockApiGatewayClient.FinishSpan.mockResolvedValue(mockResponse);

      const result = await parallaxClient.finishSpan(mockRequest);

      expect(result).toEqual(mockResponse);
      expect(mockApiGatewayClient.FinishSpan).toHaveBeenCalledWith(mockRequest);
      expect(mockApiGatewayClient.FinishSpan).toHaveBeenCalledTimes(1);
    });

    it('should handle errors when finishing a span', async () => {
      const mockRequest: apiGateway.FinishSpanRequest = {
        traceId: 'trace-123',
        spanId: 'span-456',
      };

      const mockError = new Error('Finish span failed');
      mockApiGatewayClient.FinishSpan.mockRejectedValue(mockError);

      await expect(parallaxClient.finishSpan(mockRequest)).rejects.toThrow('Finish span failed');
      expect(mockConsoleError).toHaveBeenCalledWith(
        '[ParallaxClient][finishSpan] Error:',
        expect.any(Error)
      );
    });
  });

  describe('addSpanEvent', () => {
    it('should add span event successfully', async () => {
      const mockRequest: apiGateway.AddSpanEventRequest = {
        traceId: 'trace-123',
        spanId: 'span-456',
        eventName: 'Test Event',
        attributes: {
          eventType: 'custom',
        },
        timestamp: undefined,
      };

      const mockResponse: apiGateway.AddSpanEventResponse = {
        status: { 
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        },
      };

      mockApiGatewayClient.AddSpanEvent.mockResolvedValue(mockResponse);

      const result = await parallaxClient.addSpanEvent(mockRequest);

      expect(result).toEqual(mockResponse);
      expect(mockApiGatewayClient.AddSpanEvent).toHaveBeenCalledWith(mockRequest);
      expect(mockApiGatewayClient.AddSpanEvent).toHaveBeenCalledTimes(1);
    });

    it('should handle errors when adding span event', async () => {
      const mockRequest: apiGateway.AddSpanEventRequest = {
        traceId: 'trace-123',
        spanId: 'span-456',
        eventName: 'Test Event',
        attributes: {},
      };

      const mockError = new Error('Add event failed');
      mockApiGatewayClient.AddSpanEvent.mockRejectedValue(mockError);

      await expect(parallaxClient.addSpanEvent(mockRequest)).rejects.toThrow('Add event failed');
      expect(mockConsoleError).toHaveBeenCalledWith(
        '[ParallaxClient][addSpanEvent] Error:',
        expect.any(Error)
      );
    });
  });

  describe('addSpanError', () => {
    it('should add span error successfully', async () => {
      const mockRequest: apiGateway.AddSpanErrorRequest = {
        traceId: 'trace-123',
        spanId: 'span-456',
        errorType: 'RuntimeError',
        message: 'Something went wrong',
        stackTrace: undefined,
        attributes: {},
        timestamp: undefined,
      };

      const mockResponse: apiGateway.AddSpanErrorResponse = {
        status: { 
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        },
      };

      mockApiGatewayClient.AddSpanError.mockResolvedValue(mockResponse);

      const result = await parallaxClient.addSpanError(mockRequest);

      expect(result).toEqual(mockResponse);
      expect(mockApiGatewayClient.AddSpanError).toHaveBeenCalledWith(mockRequest);
      expect(mockApiGatewayClient.AddSpanError).toHaveBeenCalledTimes(1);
    });

    it('should handle errors when adding span error', async () => {
      const mockRequest: apiGateway.AddSpanErrorRequest = {
        traceId: 'trace-123',
        spanId: 'span-456',
        errorType: 'Error',
        message: 'Error message',
        attributes: {},
      };

      const mockError = new Error('Add error failed');
      mockApiGatewayClient.AddSpanError.mockRejectedValue(mockError);

      await expect(parallaxClient.addSpanError(mockRequest)).rejects.toThrow('Add error failed');
      expect(mockConsoleError).toHaveBeenCalledWith(
        '[ParallaxClient][addSpanError] Error:',
        expect.any(Error)
      );
    });
  });

  describe('addSpanHint', () => {
    it('should add span hint successfully', async () => {
      const mockRequest: apiGateway.AddSpanHintRequest = {
        traceId: 'trace-123',
        parentSpanId: 'span-456',
        timestamp: undefined,
        chainTransaction: {
          txHash: '0x123abc',
          chainId: 1,
        },
      };

      const mockResponse: apiGateway.AddSpanHintResponse = {
        status: { 
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        },
      };

      mockApiGatewayClient.AddSpanHint.mockResolvedValue(mockResponse);

      const result = await parallaxClient.addSpanHint(mockRequest);

      expect(result).toEqual(mockResponse);
      expect(mockApiGatewayClient.AddSpanHint).toHaveBeenCalledWith(mockRequest);
      expect(mockApiGatewayClient.AddSpanHint).toHaveBeenCalledTimes(1);
    });

    it('should handle errors when adding span hint', async () => {
      const mockRequest: apiGateway.AddSpanHintRequest = {
        traceId: 'trace-123',
        parentSpanId: 'span-456',
        chainTransaction: undefined,
      };

      const mockError = new Error('Add hint failed');
      mockApiGatewayClient.AddSpanHint.mockRejectedValue(mockError);

      await expect(parallaxClient.addSpanHint(mockRequest)).rejects.toThrow('Add hint failed');
      expect(mockConsoleError).toHaveBeenCalledWith(
        '[ParallaxClient][addSpanHint] Error:',
        expect.any(Error)
      );
    });
  });

  describe('integration scenarios', () => {
    it('should handle multiple method calls in sequence', async () => {
      const traceRequest: apiGateway.CreateTraceRequest = {
        name: 'Integration Test',
        attributes: {
          'project.id': 'test-project'
        },
        tags: ['tag1', 'tag2'],
      };

      const spanRequest: apiGateway.StartSpanRequest = {
        name: 'Integration Span',
        traceId: 'trace-123',
        parentSpanId: 'span-root',
        attributes: {},
      };

      mockApiGatewayClient.CreateTrace.mockResolvedValue({
        traceId: 'trace-123',
        rootSpanId: 'span-root',
        status: {
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        }
      });
      mockApiGatewayClient.StartSpan.mockResolvedValue({ 
        spanId: 'span-456', 
        status: { 
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        }
      });

      await parallaxClient.createTrace(traceRequest);
      await parallaxClient.startSpan(spanRequest);

      expect(mockApiGatewayClient.CreateTrace).toHaveBeenCalledTimes(1);
      expect(mockApiGatewayClient.StartSpan).toHaveBeenCalledTimes(1);
    });

    it('should create client instances with different API keys', () => {
      const client1 = new ParallaxClient('key1');
      const client2 = new ParallaxClient('key2');
      const client3 = new ParallaxClient();

      expect(client1.apiKey).toBe('key1');
      expect(client2.apiKey).toBe('key2');
      expect(client3.apiKey).toBeUndefined();
    });
  });
});
