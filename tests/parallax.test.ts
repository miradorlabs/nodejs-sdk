// ParallaxClient Unit Tests
import { ParallaxClient, ParallaxTrace, CHAIN_MAP } from '../src/parallax';
import { NodeGrpcRpc } from '../src/grpc';
import * as apiGateway from "mirador-gateway-parallax/proto/gateway/parallax/v1/parallax_gateway";
import { ResponseStatus_StatusCode } from "mirador-gateway-parallax/proto/common/v1/status";

// Mock the NodeGrpcRpc class
jest.mock('../src/grpc');

// Mock console.log to avoid cluttering test output
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();

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
    mockConsoleLog.mockClear();
  });

  afterAll(() => {
    mockConsoleLog.mockRestore();
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
      expect(NodeGrpcRpc).toHaveBeenCalledWith('parallax-gateway.dev.mirador.org:443', apiKey);
    });

    it('should use custom API URL if provided', () => {
      const apiKey = 'test-key';
      const customUrl = 'custom-gateway.example.com:50053';
      new ParallaxClient(apiKey, customUrl);
      expect(NodeGrpcRpc).toHaveBeenCalledWith(customUrl, apiKey);
    });
  });

  describe('trace builder (ParallaxTrace)', () => {
    it('should create a trace builder instance', () => {
      const trace = parallaxClient.trace('test-trace');
      expect(trace).toBeInstanceOf(ParallaxTrace);
    });

    it('should create a trace builder with empty name by default', () => {
      const trace = parallaxClient.trace();
      expect(trace).toBeInstanceOf(ParallaxTrace);
    });

    it('should build and create a simple trace', async () => {
      const mockResponse: apiGateway.CreateTraceResponse = {
        status: {
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        },
        traceId: 'trace-builder-123',
      };

      mockApiGatewayClient.CreateTrace.mockResolvedValue(mockResponse);

      const traceId = await parallaxClient.trace('swap_execution')
        .addAttribute('user', '0xabc...')
        .addTag('dex')
        .create();

      expect(traceId).toBe('trace-builder-123');
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
        .create();

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

    it('should stringify object attribute values', async () => {
      const mockResponse: apiGateway.CreateTraceResponse = {
        status: {
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        },
        traceId: 'trace-object-attr',
      };

      mockApiGatewayClient.CreateTrace.mockResolvedValue(mockResponse);

      await parallaxClient.trace('test')
        .addAttribute('metadata', { key: 'value', count: 42 })
        .addAttribute('nested', { a: { b: 'c' } })
        .create();

      expect(mockApiGatewayClient.CreateTrace).toHaveBeenCalledWith({
        name: 'test',
        attributes: {
          metadata: '{"key":"value","count":42}',
          nested: '{"a":{"b":"c"}}',
        },
        tags: [],
        events: [],
        txHashHint: undefined,
      });
    });

    it('should handle addAttributes with multiple key-value pairs including objects', async () => {
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
          config: { setting: 'value' },
        })
        .create();

      expect(mockApiGatewayClient.CreateTrace).toHaveBeenCalledWith({
        name: 'test',
        attributes: {
          user: '0xabc',
          slippage: '25',
          isPremium: 'true',
          config: '{"setting":"value"}',
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
        .create();

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
        .create();

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

    it('should set transaction hash hint via setTxHint with ChainName', async () => {
      const mockResponse: apiGateway.CreateTraceResponse = {
        status: {
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        },
        traceId: 'trace-txhint',
      };

      mockApiGatewayClient.CreateTrace.mockResolvedValue(mockResponse);

      await parallaxClient.trace('swap')
        .setTxHint('0x123...', 'ethereum', 'Swap transaction')
        .create();

      const calls = mockApiGatewayClient.CreateTrace.mock.calls[0][0];
      expect(calls.txHashHint).toBeDefined();
      expect(calls.txHashHint?.txHash).toBe('0x123...');
      expect(calls.txHashHint?.chainId).toBe('ethereum'); // Should be 1
      expect(calls.txHashHint?.details).toBe('Swap transaction');
      expect(calls.txHashHint?.timestamp).toBeInstanceOf(Date);
    });

    it('should handle different chain names', async () => {
      const mockResponse: apiGateway.CreateTraceResponse = {
        status: {
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        },
        traceId: 'trace-chains',
      };

      mockApiGatewayClient.CreateTrace.mockResolvedValue(mockResponse);

      // Test polygon
      await parallaxClient.trace('test')
        .setTxHint('0xpolygon...', 'polygon')
        .create();

      let calls = mockApiGatewayClient.CreateTrace.mock.calls[0][0];
      expect(calls.txHashHint?.chainId).toBe('polygon'); // 2

      // Test arbitrum
      mockApiGatewayClient.CreateTrace.mockClear();
      await parallaxClient.trace('test')
        .setTxHint('0xarbitrum...', 'arbitrum')
        .create();

      calls = mockApiGatewayClient.CreateTrace.mock.calls[0][0];
      expect(calls.txHashHint?.chainId).toBe('arbitrum'); // 3

      // Test base
      mockApiGatewayClient.CreateTrace.mockClear();
      await parallaxClient.trace('test')
        .setTxHint('0xbase...', 'base')
        .create();

      calls = mockApiGatewayClient.CreateTrace.mock.calls[0][0];
      expect(calls.txHashHint?.chainId).toBe('base'); // 4

      // Test optimism
      mockApiGatewayClient.CreateTrace.mockClear();
      await parallaxClient.trace('test')
        .setTxHint('0xoptimism...', 'optimism')
        .create();

      calls = mockApiGatewayClient.CreateTrace.mock.calls[0][0];
      expect(calls.txHashHint?.chainId).toBe('optimism'); // 5

      // Test bsc
      mockApiGatewayClient.CreateTrace.mockClear();
      await parallaxClient.trace('test')
        .setTxHint('0xbsc...', 'bsc')
        .create();

      calls = mockApiGatewayClient.CreateTrace.mock.calls[0][0];
      expect(calls.txHashHint?.chainId).toBe('bsc'); // 6
    });

    it('should create without txHashHint when not set', async () => {
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
        .create();

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

      const traceId = await parallaxClient.trace('swap_execution')
        .addAttribute('user', '0xabc...')
        .addAttribute('slippage_bps', 25)
        .addAttribute('metadata', { version: '1.0' })
        .addTag('dex')
        .addTag('swap')
        .addEvent('wallet_connected', 'MetaMask connected')
        .addEvent('quote_received', { amount: 100, token: 'USDC' })
        .addEvent('tx_signed')
        .setTxHint('0x123...', 'ethereum')
        .create();

      expect(traceId).toBe('trace-complex');

      const calls = mockApiGatewayClient.CreateTrace.mock.calls[0][0];
      expect(calls.name).toBe('swap_execution');
      expect(calls.attributes).toEqual({
        user: '0xabc...',
        slippage_bps: '25',
        metadata: '{"version":"1.0"}',
      });
      expect(calls.tags).toEqual(['dex', 'swap']);
      expect(calls.events).toHaveLength(3);
      expect(calls.txHashHint?.txHash).toBe('0x123...');
      expect(calls.txHashHint?.chainId).toBe('ethereum');
    });

    it('should return undefined when trace creation fails with error status', async () => {
      const mockResponse: apiGateway.CreateTraceResponse = {
        status: {
          code: ResponseStatus_StatusCode.STATUS_CODE_ERROR,
          errorMessage: 'Something went wrong'
        },
        traceId: '',
      };

      mockApiGatewayClient.CreateTrace.mockResolvedValue(mockResponse);

      const traceId = await parallaxClient.trace('test')
        .addTag('error-test')
        .create();

      expect(traceId).toBeUndefined();
      expect(mockConsoleLog).toHaveBeenCalledWith(
        '[ParallaxTrace] Error:',
        'Something went wrong'
      );
    });

    it('should return undefined and log error when exception is thrown', async () => {
      const mockError = new Error('Network error');
      mockApiGatewayClient.CreateTrace.mockRejectedValue(mockError);

      const traceId = await parallaxClient.trace('test')
        .addTag('exception-test')
        .create();

      expect(traceId).toBeUndefined();
      expect(mockConsoleLog).toHaveBeenCalledWith(
        '[ParallaxTrace] Error creating trace:',
        mockError
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

      const result1 = await trace1.create();
      const result2 = await trace2.create();

      expect(result1).toBe('trace-1');
      expect(result2).toBe('trace-2');
      expect(mockApiGatewayClient.CreateTrace).toHaveBeenCalledTimes(2);
    });
  });

  describe('CHAIN_MAP', () => {
    it('should have correct enum values for all chains', () => {
      expect(CHAIN_MAP['ethereum']).toBe(1);
      expect(CHAIN_MAP['polygon']).toBe(2);
      expect(CHAIN_MAP['arbitrum']).toBe(3);
      expect(CHAIN_MAP['base']).toBe(4);
      expect(CHAIN_MAP['optimism']).toBe(5);
      expect(CHAIN_MAP['bsc']).toBe(6);
    });
  });
});
