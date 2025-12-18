// ParallaxClient Unit Tests
import { ParallaxClient, ParallaxTrace } from '../src/parallax';
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

    it('should use custom API URL if provided', () => {
      const apiKey = 'test-key';
      const customUrl = 'custom-gateway.example.com:50053';
      new ParallaxClient(apiKey, customUrl);
      expect(NodeGrpcRpc).toHaveBeenCalledWith(customUrl, apiKey);
    });
  });

  describe('createTrace', () => {
    it('should create a trace successfully with basic attributes', async () => {
      const mockRequest: apiGateway.CreateTraceRequest = {
        name: 'Test Trace',
        attributes: {
          'project.id': 'test-project',
          'environment': 'test'
        },
        tags: ['tag1', 'tag2'],
        events: [],
        txHashHint: undefined,
      };

      const mockResponse: apiGateway.CreateTraceResponse = {
        status: {
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        },
        traceId: 'trace-123',
      };

      mockApiGatewayClient.CreateTrace.mockResolvedValue(mockResponse);

      const result = await parallaxClient.createTrace(mockRequest);

      expect(result).toEqual(mockResponse);
      expect(mockApiGatewayClient.CreateTrace).toHaveBeenCalledWith(mockRequest);
      expect(mockApiGatewayClient.CreateTrace).toHaveBeenCalledTimes(1);
    });

    it('should create a trace with events', async () => {
      const mockRequest: apiGateway.CreateTraceRequest = {
        name: 'Payment Trace',
        attributes: {
          userId: '123',
          environment: 'production'
        },
        tags: ['payment', 'critical'],
        events: [
          {
            eventName: 'payment.initiated',
            details: JSON.stringify({ amount: 100, currency: 'USD' }),
            timestamp: new Date('2024-01-01T00:00:00Z')
          },
          {
            eventName: 'payment.processed',
            details: JSON.stringify({ status: 'success' }),
            timestamp: new Date('2024-01-01T00:00:05Z')
          }
        ],
        txHashHint: undefined,
      };

      const mockResponse: apiGateway.CreateTraceResponse = {
        status: {
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        },
        traceId: 'trace-456',
      };

      mockApiGatewayClient.CreateTrace.mockResolvedValue(mockResponse);

      const result = await parallaxClient.createTrace(mockRequest);

      expect(result).toEqual(mockResponse);
      expect(mockApiGatewayClient.CreateTrace).toHaveBeenCalledWith(mockRequest);
      expect(result.traceId).toBe('trace-456');
    });

    it('should create a trace with transaction hash hint', async () => {
      const mockRequest: apiGateway.CreateTraceRequest = {
        name: 'Bridge Transaction Trace',
        attributes: {
          'bridge.name': 'ethereum-polygon'
        },
        tags: ['bridge', 'blockchain'],
        events: [],
        txHashHint: {
          chainId: 'ethereum',
          txHash: '0x123abc456def',
          details: 'Bridge transaction from Ethereum to Polygon',
          timestamp: new Date('2024-01-01T00:00:00Z')
        }
      };

      const mockResponse: apiGateway.CreateTraceResponse = {
        status: {
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        },
        traceId: 'trace-789',
      };

      mockApiGatewayClient.CreateTrace.mockResolvedValue(mockResponse);

      const result = await parallaxClient.createTrace(mockRequest);

      expect(result).toEqual(mockResponse);
      expect(mockApiGatewayClient.CreateTrace).toHaveBeenCalledWith(mockRequest);
      expect(result.traceId).toBe('trace-789');
    });

    it('should handle errors when creating a trace', async () => {
      const mockRequest: apiGateway.CreateTraceRequest = {
        name: 'Test Trace',
        attributes: {},
        tags: [],
        events: [],
        txHashHint: undefined,
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

  describe('trace builder (ParallaxTrace)', () => {
    it('should create a trace builder instance', () => {
      const trace = parallaxClient.trace('test-trace');
      expect(trace).toBeInstanceOf(ParallaxTrace);
    });

    it('should build and submit a simple trace', async () => {
      const mockResponse: apiGateway.CreateTraceResponse = {
        status: {
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        },
        traceId: 'trace-builder-123',
      };

      mockApiGatewayClient.CreateTrace.mockResolvedValue(mockResponse);

      const result = await parallaxClient.trace('swap_execution')
        .addAttribute('user', '0xabc...')
        .addTag('dex')
        .submit();

      expect(result.traceId).toBe('trace-builder-123');
      expect(mockApiGatewayClient.CreateTrace).toHaveBeenCalledWith({
        name: 'swap_execution',
        attributes: { user: '0xabc...' },
        tags: ['dex'],
        events: [],
        txHashHint: undefined,
      });
    });

    it('should handle multiple attributes with different types', async () => {
      const mockResponse: apiGateway.CreateTraceResponse = {
        status: {
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        },
        traceId: 'trace-multi-attr',
      };

      mockApiGatewayClient.CreateTrace.mockResolvedValue(mockResponse);

      await parallaxClient.trace('test')
        .addAttribute('stringValue', 'hello')
        .addAttribute('numberValue', 42)
        .addAttribute('booleanValue', true)
        .submit();

      expect(mockApiGatewayClient.CreateTrace).toHaveBeenCalledWith({
        name: 'test',
        attributes: {
          stringValue: 'hello',
          numberValue: '42',
          booleanValue: 'true',
        },
        tags: [],
        events: [],
        txHashHint: undefined,
      });
    });

    it('should handle addAttributes with multiple key-value pairs', async () => {
      const mockResponse: apiGateway.CreateTraceResponse = {
        status: {
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        },
        traceId: 'trace-batch-attrs',
      };

      mockApiGatewayClient.CreateTrace.mockResolvedValue(mockResponse);

      await parallaxClient.trace('test')
        .addAttributes({
          user: '0xabc',
          slippage: 25,
          isPremium: true,
        })
        .submit();

      expect(mockApiGatewayClient.CreateTrace).toHaveBeenCalledWith({
        name: 'test',
        attributes: {
          user: '0xabc',
          slippage: '25',
          isPremium: 'true',
        },
        tags: [],
        events: [],
        txHashHint: undefined,
      });
    });

    it('should handle multiple tags', async () => {
      const mockResponse: apiGateway.CreateTraceResponse = {
        status: {
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        },
        traceId: 'trace-tags',
      };

      mockApiGatewayClient.CreateTrace.mockResolvedValue(mockResponse);

      await parallaxClient.trace('test')
        .addTag('tag1')
        .addTag('tag2')
        .addTags(['tag3', 'tag4'])
        .submit();

      expect(mockApiGatewayClient.CreateTrace).toHaveBeenCalledWith({
        name: 'test',
        attributes: {},
        tags: ['tag1', 'tag2', 'tag3', 'tag4'],
        events: [],
        txHashHint: undefined,
      });
    });

    it('should handle events with different detail types', async () => {
      const mockResponse: apiGateway.CreateTraceResponse = {
        status: {
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        },
        traceId: 'trace-events',
      };

      mockApiGatewayClient.CreateTrace.mockResolvedValue(mockResponse);

      const timestamp1 = new Date('2024-01-01T00:00:00Z');
      const timestamp2 = new Date('2024-01-01T00:00:05Z');

      await parallaxClient.trace('test')
        .addEvent('event1', 'string details', timestamp1)
        .addEvent('event2', { key: 'value', count: 42 }, timestamp2)
        .addEvent('event3') // no details, auto timestamp
        .submit();

      const calls = mockApiGatewayClient.CreateTrace.mock.calls[0][0];
      expect(calls.events).toHaveLength(3);
      expect(calls.events[0].eventName).toBe('event1');
      expect(calls.events[0].details).toBe('string details');
      expect(calls.events[0].timestamp).toEqual(timestamp1);
      expect(calls.events[1].eventName).toBe('event2');
      expect(calls.events[1].details).toBe(JSON.stringify({ key: 'value', count: 42 }));
      expect(calls.events[2].eventName).toBe('event3');
      expect(calls.events[2].details).toBeUndefined();
      expect(calls.events[2].timestamp).toBeInstanceOf(Date);
    });

    it('should set transaction hash hint via setTxHash', async () => {
      const mockResponse: apiGateway.CreateTraceResponse = {
        status: {
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        },
        traceId: 'trace-txhash',
      };

      mockApiGatewayClient.CreateTrace.mockResolvedValue(mockResponse);

      await parallaxClient.trace('swap')
        .setTxHash('0x123...', 'ethereum', 'Swap transaction')
        .submit();

      const calls = mockApiGatewayClient.CreateTrace.mock.calls[0][0];
      expect(calls.txHashHint).toBeDefined();
      expect(calls.txHashHint?.txHash).toBe('0x123...');
      expect(calls.txHashHint?.chainId).toBe('ethereum');
      expect(calls.txHashHint?.details).toBe('Swap transaction');
      expect(calls.txHashHint?.timestamp).toBeInstanceOf(Date);
    });

    it('should override setTxHash when providing txHash to submit', async () => {
      const mockResponse: apiGateway.CreateTraceResponse = {
        status: {
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        },
        traceId: 'trace-override',
      };

      mockApiGatewayClient.CreateTrace.mockResolvedValue(mockResponse);

      await parallaxClient.trace('swap')
        .setTxHash('0xold...', 'ethereum', 'Old transaction')
        .submit('0xnew...', 'polygon', 'New transaction');

      const calls = mockApiGatewayClient.CreateTrace.mock.calls[0][0];
      expect(calls.txHashHint?.txHash).toBe('0xnew...');
      expect(calls.txHashHint?.chainId).toBe('polygon');
      expect(calls.txHashHint?.details).toBe('New transaction');
    });

    it('should submit without txHash when not set', async () => {
      const mockResponse: apiGateway.CreateTraceResponse = {
        status: {
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        },
        traceId: 'trace-no-tx',
      };

      mockApiGatewayClient.CreateTrace.mockResolvedValue(mockResponse);

      await parallaxClient.trace('test')
        .addTag('no-tx')
        .submit();

      const calls = mockApiGatewayClient.CreateTrace.mock.calls[0][0];
      expect(calls.txHashHint).toBeUndefined();
    });

    it('should build a complex trace with all features', async () => {
      const mockResponse: apiGateway.CreateTraceResponse = {
        status: {
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        },
        traceId: 'trace-complex',
      };

      mockApiGatewayClient.CreateTrace.mockResolvedValue(mockResponse);

      const result = await parallaxClient.trace('swap_execution')
        .addAttribute('user', '0xabc...')
        .addAttribute('slippage_bps', 25)
        .addTag('dex')
        .addTag('swap')
        .addEvent('wallet_connected', 'MetaMask connected')
        .addEvent('quote_received', { amount: 100, token: 'USDC' })
        .addEvent('tx_signed')
        .submit('0x123...', 'ethereum');

      expect(result.traceId).toBe('trace-complex');

      const calls = mockApiGatewayClient.CreateTrace.mock.calls[0][0];
      expect(calls.name).toBe('swap_execution');
      expect(calls.attributes).toEqual({
        user: '0xabc...',
        slippage_bps: '25',
      });
      expect(calls.tags).toEqual(['dex', 'swap']);
      expect(calls.events).toHaveLength(3);
      expect(calls.txHashHint?.txHash).toBe('0x123...');
      expect(calls.txHashHint?.chainId).toBe('ethereum');
    });

    it('should handle errors when submitting trace builder', async () => {
      const mockError = new Error('Submit failed');
      mockApiGatewayClient.CreateTrace.mockRejectedValue(mockError);

      await expect(
        parallaxClient.trace('test')
          .addTag('error-test')
          .submit()
      ).rejects.toThrow('Submit failed');

      expect(mockConsoleError).toHaveBeenCalledWith(
        '[ParallaxClient][createTrace] Error:',
        expect.any(Error)
      );
    });
  });

  describe('multiple traces', () => {
    it('should create multiple independent trace builders', async () => {
      const mockResponse1: apiGateway.CreateTraceResponse = {
        status: {
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        },
        traceId: 'trace-1',
      };

      const mockResponse2: apiGateway.CreateTraceResponse = {
        status: {
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        },
        traceId: 'trace-2',
      };

      mockApiGatewayClient.CreateTrace
        .mockResolvedValueOnce(mockResponse1)
        .mockResolvedValueOnce(mockResponse2);

      const trace1 = parallaxClient.trace('trace-1')
        .addAttribute('id', '1')
        .addTag('first');

      const trace2 = parallaxClient.trace('trace-2')
        .addAttribute('id', '2')
        .addTag('second');

      const result1 = await trace1.submit();
      const result2 = await trace2.submit();

      expect(result1.traceId).toBe('trace-1');
      expect(result2.traceId).toBe('trace-2');
      expect(mockApiGatewayClient.CreateTrace).toHaveBeenCalledTimes(2);
    });
  });
});
