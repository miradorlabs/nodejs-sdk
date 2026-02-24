// Mirador Client Unit Tests
import { Client, Trace, ChainName, captureStackTrace } from '../src/ingest';
import type { StackTrace } from '../src/ingest';
import { NodeGrpcRpc } from '../src/grpc';
import * as apiGateway from "mirador-gateway-ingest/proto/gateway/ingest/v1/ingest_gateway";
import { Chain } from "mirador-gateway-ingest/proto/gateway/ingest/v1/ingest_gateway";
import { ResponseStatus_StatusCode } from "mirador-gateway-ingest/proto/gateway/common/v1/status";

// Mock the NodeGrpcRpc class
jest.mock('../src/grpc');

// Mock console methods to avoid cluttering test output
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
const mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation();
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation();

describe('Client', () => {
  let client: Client;
  let mockApiGatewayClient: jest.Mocked<apiGateway.IngestGatewayServiceClientImpl>;

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Create a new Client instance
    client = new Client("test-api-key");

    // Create mock for IngestGatewayServiceClientImpl
    mockApiGatewayClient = {
      CreateTrace: jest.fn(),
    } as unknown as jest.Mocked<apiGateway.IngestGatewayServiceClientImpl>;

    // Mock the IngestGatewayServiceClientImpl constructor
    jest
      .spyOn(apiGateway, "IngestGatewayServiceClientImpl")
      .mockImplementation(() => mockApiGatewayClient);
  });

  afterEach(() => {
    mockConsoleLog.mockClear();
    mockConsoleWarn.mockClear();
    mockConsoleError.mockClear();
  });

  afterAll(() => {
    mockConsoleLog.mockRestore();
    mockConsoleWarn.mockRestore();
    mockConsoleError.mockRestore();
  });

  describe('constructor', () => {
    it('should create a Client instance with API key', () => {
      const c = new Client('my-api-key');
      expect(c).toBeInstanceOf(Client);
      expect(c.apiKey).toBe('my-api-key');
    });

    it('should create a Client instance without API key', () => {
      const c = new Client();
      expect(c).toBeInstanceOf(Client);
      expect(c.apiKey).toBeUndefined();
    });

    it('should initialize NodeGrpcRpc with the correct URL and API key', () => {
      const apiKey = 'test-key';
      new Client(apiKey);
      expect(NodeGrpcRpc).toHaveBeenCalledWith('ingest.mirador.org:443', apiKey);
    });

    it('should use custom API URL if provided', () => {
      const apiKey = 'test-key';
      const customUrl = 'custom-gateway.example.com:50053';
      new Client(apiKey, { apiUrl: customUrl });
      expect(NodeGrpcRpc).toHaveBeenCalledWith(customUrl, apiKey);
    });
  });

  describe('trace builder (Trace)', () => {
    it('should create a trace builder instance', () => {
      const trace = client.trace({ name: 'test-trace' });
      expect(trace).toBeInstanceOf(Trace);
    });

    it('should create a trace builder with empty name by default', () => {
      const trace = client.trace();
      expect(trace).toBeInstanceOf(Trace);
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

      const traceId = await client.trace({ name: 'swap_execution', captureStackTrace: false })
        .addAttribute('user', '0xabc...')
        .addTag('dex')
        .create();

      expect(traceId).toBe('trace-builder-123');

      const calls = mockApiGatewayClient.CreateTrace.mock.calls[0][0];
      expect(calls.name).toBe('swap_execution');
      expect(calls.data?.attributes?.[0]?.attributes).toEqual({ user: '0xabc...' });
      expect(calls.data?.tags?.[0]?.tags).toEqual(['dex']);
      expect(calls.data?.events).toEqual([]);
      expect(calls.data?.txHashHints).toEqual([]);
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

      await client.trace({ name: 'test', captureStackTrace: false })
        .addAttribute('stringValue', 'hello')
        .addAttribute('numberValue', 42)
        .addAttribute('booleanValue', true)
        .create();

      const calls = mockApiGatewayClient.CreateTrace.mock.calls[0][0];
      expect(calls.name).toBe('test');
      expect(calls.data?.attributes?.[0]?.attributes).toEqual({
        stringValue: 'hello',
        numberValue: '42',
        booleanValue: 'true',
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

      await client.trace({ name: 'test', captureStackTrace: false })
        .addAttribute('metadata', { key: 'value', count: 42 })
        .addAttribute('nested', { a: { b: 'c' } })
        .create();

      const calls = mockApiGatewayClient.CreateTrace.mock.calls[0][0];
      expect(calls.data?.attributes?.[0]?.attributes).toEqual({
        metadata: '{"key":"value","count":42}',
        nested: '{"a":{"b":"c"}}',
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

      await client.trace({ name: 'test', captureStackTrace: false })
        .addAttributes({
          user: '0xabc',
          slippage: 25,
          isPremium: true,
          config: { setting: 'value' },
        })
        .create();

      const calls = mockApiGatewayClient.CreateTrace.mock.calls[0][0];
      expect(calls.data?.attributes?.[0]?.attributes).toEqual({
        user: '0xabc',
        slippage: '25',
        isPremium: 'true',
        config: '{"setting":"value"}',
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

      await client.trace({ name: 'test' })
        .addTag('tag1')
        .addTag('tag2')
        .addTags(['tag3', 'tag4'])
        .create();

      const calls = mockApiGatewayClient.CreateTrace.mock.calls[0][0];
      expect(calls.data?.tags?.[0]?.tags).toEqual(['tag1', 'tag2', 'tag3', 'tag4']);
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

      await client.trace({ name: 'test' })
        .addEvent('event1', 'string details', timestamp1)
        .addEvent('event2', { key: 'value', count: 42 }, timestamp2)
        .addEvent('event3') // no details, auto timestamp
        .create();

      const calls = mockApiGatewayClient.CreateTrace.mock.calls[0][0];
      const events = calls.data?.events;
      expect(events).toHaveLength(3);
      expect(events?.[0].name).toBe('event1');
      expect(events?.[0].details).toBe('string details');
      expect(events?.[0].timestamp).toEqual(timestamp1);
      expect(events?.[1].name).toBe('event2');
      expect(events?.[1].details).toBe(JSON.stringify({ key: 'value', count: 42 }));
      expect(events?.[2].name).toBe('event3');
      expect(events?.[2].details).toBeUndefined();
      expect(events?.[2].timestamp).toBeInstanceOf(Date);
    });

    it('should set transaction hash hint via addTxHint with ChainName', async () => {
      const mockResponse: apiGateway.CreateTraceResponse = {
        status: {
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        },
        traceId: 'trace-txhint',
      };

      mockApiGatewayClient.CreateTrace.mockResolvedValue(mockResponse);

      await client.trace({ name: 'swap' })
        .addTxHint('0x123...', 'ethereum', 'Swap transaction')
        .create();

      const calls = mockApiGatewayClient.CreateTrace.mock.calls[0][0];
      const txHashHints = calls.data?.txHashHints;
      expect(txHashHints).toHaveLength(1);
      expect(txHashHints?.[0]?.txHash).toBe('0x123...');
      expect(txHashHints?.[0]?.chain).toBe(Chain.CHAIN_ETHEREUM);
      expect(txHashHints?.[0]?.details).toBe('Swap transaction');
      expect(txHashHints?.[0]?.timestamp).toBeInstanceOf(Date);
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
      await client.trace({ name: 'test' })
        .addTxHint('0xpolygon...', 'polygon')
        .create();

      let calls = mockApiGatewayClient.CreateTrace.mock.calls[0][0];
      expect(calls.data?.txHashHints?.[0]?.chain).toBe(Chain.CHAIN_POLYGON);

      // Test arbitrum
      mockApiGatewayClient.CreateTrace.mockClear();
      await client.trace({ name: 'test' })
        .addTxHint('0xarbitrum...', 'arbitrum')
        .create();

      calls = mockApiGatewayClient.CreateTrace.mock.calls[0][0];
      expect(calls.data?.txHashHints?.[0]?.chain).toBe(Chain.CHAIN_ARBITRUM);

      // Test base
      mockApiGatewayClient.CreateTrace.mockClear();
      await client.trace({ name: 'test' })
        .addTxHint('0xbase...', 'base')
        .create();

      calls = mockApiGatewayClient.CreateTrace.mock.calls[0][0];
      expect(calls.data?.txHashHints?.[0]?.chain).toBe(Chain.CHAIN_BASE);

      // Test optimism
      mockApiGatewayClient.CreateTrace.mockClear();
      await client.trace({ name: 'test' })
        .addTxHint('0xoptimism...', 'optimism')
        .create();

      calls = mockApiGatewayClient.CreateTrace.mock.calls[0][0];
      expect(calls.data?.txHashHints?.[0]?.chain).toBe(Chain.CHAIN_OPTIMISM);

      // Test bsc
      mockApiGatewayClient.CreateTrace.mockClear();
      await client.trace({ name: 'test' })
        .addTxHint('0xbsc...', 'bsc')
        .create();

      calls = mockApiGatewayClient.CreateTrace.mock.calls[0][0];
      expect(calls.data?.txHashHints?.[0]?.chain).toBe(Chain.CHAIN_BSC);
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

      await client.trace({ name: 'test' })
        .addTag('no-tx')
        .create();

      const calls = mockApiGatewayClient.CreateTrace.mock.calls[0][0];
      expect(calls.data?.txHashHints).toEqual([]);
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

      const traceId = await client.trace({ name: 'swap_execution', captureStackTrace: false })
        .addAttribute('user', '0xabc...')
        .addAttribute('slippage_bps', 25)
        .addAttribute('metadata', { version: '1.0' })
        .addTag('dex')
        .addTag('swap')
        .addEvent('wallet_connected', 'MetaMask connected')
        .addEvent('quote_received', { amount: 100, token: 'USDC' })
        .addEvent('tx_signed')
        .addTxHint('0x123...', 'ethereum')
        .create();

      expect(traceId).toBe('trace-complex');

      const calls = mockApiGatewayClient.CreateTrace.mock.calls[0][0];
      expect(calls.name).toBe('swap_execution');
      expect(calls.data?.attributes?.[0]?.attributes).toEqual({
        user: '0xabc...',
        slippage_bps: '25',
        metadata: '{"version":"1.0"}',
      });
      expect(calls.data?.tags?.[0]?.tags).toEqual(['dex', 'swap']);
      expect(calls.data?.events).toHaveLength(3);
      expect(calls.data?.txHashHints?.[0]?.txHash).toBe('0x123...');
      expect(calls.data?.txHashHints?.[0]?.chain).toBe(Chain.CHAIN_ETHEREUM);
    });

    it('should return undefined when trace creation fails with error status', async () => {
      const mockResponse: apiGateway.CreateTraceResponse = {
        status: {
          code: ResponseStatus_StatusCode.STATUS_CODE_INTERNAL_ERROR,
          errorMessage: 'Something went wrong'
        },
        traceId: '',
      };

      mockApiGatewayClient.CreateTrace.mockResolvedValue(mockResponse);

      const traceId = await client.trace({ name: 'test' })
        .addTag('error-test')
        .create();

      expect(traceId).toBeUndefined();
      expect(mockConsoleError).toHaveBeenCalledWith(
        '[MiradorTrace] CreateTrace failed:',
        'Something went wrong'
      );
    });

    it('should return undefined and log error when exception is thrown', async () => {
      const mockError = new Error('Network error');
      mockApiGatewayClient.CreateTrace.mockRejectedValue(mockError);

      const traceId = await client.trace({ name: 'test' })
        .addTag('exception-test')
        .create();

      expect(traceId).toBeUndefined();
      expect(mockConsoleError).toHaveBeenCalledWith(
        '[MiradorTrace] CreateTrace error after retries:',
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

      const trace1 = client.trace({ name: 'trace-1' })
        .addAttribute('id', '1')
        .addTag('first');

      const trace2 = client.trace({ name: 'trace-2' })
        .addAttribute('id', '2')
        .addTag('second');

      const result1 = await trace1.create();
      const result2 = await trace2.create();

      expect(result1).toBe('trace-1');
      expect(result2).toBe('trace-2');
      expect(mockApiGatewayClient.CreateTrace).toHaveBeenCalledTimes(2);
    });
  });

  describe('CHAIN_MAP coverage', () => {
    it('should map all ChainName values to valid Chain enum values', async () => {
      const mockResponse: apiGateway.CreateTraceResponse = {
        status: {
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        },
        traceId: 'trace-chain-map',
      };
      mockApiGatewayClient.CreateTrace.mockResolvedValue(mockResponse);

      // All supported chain names
      const chainNames: ChainName[] = ['ethereum', 'polygon', 'arbitrum', 'base', 'optimism', 'bsc'];

      // Expected Chain enum values for each chain name
      const expectedChainEnums: Record<ChainName, Chain> = {
        ethereum: Chain.CHAIN_ETHEREUM,
        polygon: Chain.CHAIN_POLYGON,
        arbitrum: Chain.CHAIN_ARBITRUM,
        base: Chain.CHAIN_BASE,
        optimism: Chain.CHAIN_OPTIMISM,
        bsc: Chain.CHAIN_BSC,
      };

      for (const chainName of chainNames) {
        mockApiGatewayClient.CreateTrace.mockClear();

        await client.trace({ name: 'test' })
          .addTxHint('0x123', chainName)
          .create();

        const calls = mockApiGatewayClient.CreateTrace.mock.calls[0][0];
        expect(calls.data?.txHashHints?.[0]?.chain).toBe(expectedChainEnums[chainName]);
      }
    });

    it('should have CHAIN_MAP entries for all ChainName values', () => {
      // This test ensures ChainName type and CHAIN_MAP stay in sync
      const allChainNames: ChainName[] = ['ethereum', 'polygon', 'arbitrum', 'base', 'optimism', 'bsc'];

      // Verify we can create a trace with each chain name without throwing
      for (const chainName of allChainNames) {
        const trace = client.trace({ name: 'test' }).addTxHint('0x123', chainName);
        expect(trace).toBeInstanceOf(Trace);
      }
    });
  });

  describe('addTxInputData', () => {
    it('should add an event with the correct name and input data', async () => {
      const mockResponse: apiGateway.CreateTraceResponse = {
        status: {
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        },
        traceId: 'trace-tx-input',
      };

      mockApiGatewayClient.CreateTrace.mockResolvedValue(mockResponse);

      const inputData = '0xa9059cbb0000000000000000000000001234567890abcdef';

      await client.trace({ name: 'test', captureStackTrace: false })
        .addTxInputData(inputData)
        .create();

      const calls = mockApiGatewayClient.CreateTrace.mock.calls[0][0];
      const events = calls.data?.events;
      expect(events).toHaveLength(1);
      expect(events?.[0].name).toBe('Tx input data');
      expect(events?.[0].details).toBe(inputData);
      expect(events?.[0].timestamp).toBeInstanceOf(Date);
    });

    it('should return this for chaining', () => {
      const trace = client.trace({ name: 'test' });
      expect(trace.addTxInputData('0x1234')).toBe(trace);
    });

    it('should be ignored on a closed trace', async () => {
      const mockResponse: apiGateway.CreateTraceResponse = {
        status: {
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        },
        traceId: 'trace-closed-input',
      };

      mockApiGatewayClient.CreateTrace.mockResolvedValue(mockResponse);
      (mockApiGatewayClient as jest.Mocked<apiGateway.IngestGatewayServiceClientImpl>).CloseTrace = jest.fn().mockResolvedValue({ accepted: true });

      const trace = client.trace({ name: 'test' });
      await trace.create();
      await trace.close();

      trace.addTxInputData('0xdead');
      expect(mockConsoleWarn).toHaveBeenCalledWith(
        '[MiradorTrace] Trace is closed, ignoring addEvent'
      );
    });

    it('should work alongside other builder methods', async () => {
      const mockResponse: apiGateway.CreateTraceResponse = {
        status: {
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        },
        traceId: 'trace-combined',
      };

      mockApiGatewayClient.CreateTrace.mockResolvedValue(mockResponse);

      await client.trace({ name: 'swap', captureStackTrace: false })
        .addAttribute('user', '0xabc')
        .addTxHint('0x123', 'ethereum')
        .addTxInputData('0xa9059cbb00000000')
        .addTag('bridge')
        .create();

      const calls = mockApiGatewayClient.CreateTrace.mock.calls[0][0];
      expect(calls.data?.attributes?.[0]?.attributes).toEqual({ user: '0xabc' });
      expect(calls.data?.txHashHints).toHaveLength(1);
      expect(calls.data?.events).toHaveLength(1);
      expect(calls.data?.events?.[0].name).toBe('Tx input data');
      expect(calls.data?.events?.[0].details).toBe('0xa9059cbb00000000');
      expect(calls.data?.tags?.[0]?.tags).toEqual(['bridge']);
    });
  });

  describe('stack trace features', () => {
    it('should create trace with captureStackTrace option', async () => {
      const mockResponse: apiGateway.CreateTraceResponse = {
        status: {
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        },
        traceId: 'trace-with-stack',
      };

      mockApiGatewayClient.CreateTrace.mockResolvedValue(mockResponse);

      const traceId = await client.trace({ name: 'test', captureStackTrace: true })
        .create();

      expect(traceId).toBe('trace-with-stack');

      const calls = mockApiGatewayClient.CreateTrace.mock.calls[0][0];
      expect(calls.data?.attributes).toBeDefined();
      expect(calls.data?.attributes?.length).toBeGreaterThan(0);

      const attrs = calls.data?.attributes?.[0]?.attributes;
      expect(attrs?.['source.stack_trace']).toBeDefined();
      expect(attrs?.['source.file']).toBeDefined();
      expect(attrs?.['source.line']).toBeDefined();
      expect(attrs?.['source.function']).toBeDefined();

      // Verify stack trace is valid JSON
      const stackTrace = JSON.parse(attrs?.['source.stack_trace'] || '{}');
      expect(stackTrace.frames).toBeInstanceOf(Array);
      expect(stackTrace.raw).toBeDefined();
    });

    it('should create trace without stack trace when option is false', async () => {
      const mockResponse: apiGateway.CreateTraceResponse = {
        status: {
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        },
        traceId: 'trace-no-stack',
      };

      mockApiGatewayClient.CreateTrace.mockResolvedValue(mockResponse);

      await client.trace({ name: 'test', captureStackTrace: false })
        .create();

      const calls = mockApiGatewayClient.CreateTrace.mock.calls[0][0];
      const attrs = calls.data?.attributes?.[0]?.attributes;

      // Should not have stack trace attributes
      expect(attrs?.['source.stack_trace']).toBeUndefined();
    });

    it('should add event with captureStackTrace option', async () => {
      const mockResponse: apiGateway.CreateTraceResponse = {
        status: {
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        },
        traceId: 'trace-event-stack',
      };

      mockApiGatewayClient.CreateTrace.mockResolvedValue(mockResponse);

      await client.trace({ name: 'test' })
        .addEvent('error_occurred', { code: 500 }, { captureStackTrace: true })
        .create();

      const calls = mockApiGatewayClient.CreateTrace.mock.calls[0][0];
      expect(calls.data?.events).toHaveLength(1);

      const eventDetails = JSON.parse(calls.data?.events?.[0]?.details || '{}');
      expect(eventDetails.code).toBe(500);
      expect(eventDetails.stackTrace).toBeDefined();
      expect(eventDetails.stackTrace.frames).toBeInstanceOf(Array);
    });

    it('should add event with string details and captureStackTrace', async () => {
      const mockResponse: apiGateway.CreateTraceResponse = {
        status: {
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        },
        traceId: 'trace-string-stack',
      };

      mockApiGatewayClient.CreateTrace.mockResolvedValue(mockResponse);

      await client.trace({ name: 'test' })
        .addEvent('message', 'Something happened', { captureStackTrace: true })
        .create();

      const calls = mockApiGatewayClient.CreateTrace.mock.calls[0][0];
      const eventDetails = JSON.parse(calls.data?.events?.[0]?.details || '{}');

      expect(eventDetails.message).toBe('Something happened');
      expect(eventDetails.stackTrace).toBeDefined();
    });

    it('should support legacy timestamp parameter for addEvent', async () => {
      const mockResponse: apiGateway.CreateTraceResponse = {
        status: {
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        },
        traceId: 'trace-legacy-timestamp',
      };

      mockApiGatewayClient.CreateTrace.mockResolvedValue(mockResponse);

      const customTimestamp = new Date('2024-01-15T10:00:00Z');

      await client.trace({ name: 'test' })
        .addEvent('legacy_event', 'details', customTimestamp)
        .create();

      const calls = mockApiGatewayClient.CreateTrace.mock.calls[0][0];
      expect(calls.data?.events?.[0]?.timestamp).toEqual(customTimestamp);
      expect(calls.data?.events?.[0]?.details).toBe('details');
    });

    it('should add stack trace via addStackTrace method', async () => {
      const mockResponse: apiGateway.CreateTraceResponse = {
        status: {
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        },
        traceId: 'trace-add-stack',
      };

      mockApiGatewayClient.CreateTrace.mockResolvedValue(mockResponse);

      await client.trace({ name: 'test' })
        .addStackTrace('checkpoint', { stage: 'validation' })
        .create();

      const calls = mockApiGatewayClient.CreateTrace.mock.calls[0][0];
      expect(calls.data?.events).toHaveLength(1);
      expect(calls.data?.events?.[0]?.name).toBe('checkpoint');

      const details = JSON.parse(calls.data?.events?.[0]?.details || '{}');
      expect(details.stage).toBe('validation');
      expect(details.stackTrace).toBeDefined();
      expect(details.stackTrace.frames).toBeInstanceOf(Array);
    });

    it('should use default event name for addStackTrace', async () => {
      const mockResponse: apiGateway.CreateTraceResponse = {
        status: {
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        },
        traceId: 'trace-default-stack',
      };

      mockApiGatewayClient.CreateTrace.mockResolvedValue(mockResponse);

      await client.trace({ name: 'test' })
        .addStackTrace()
        .create();

      const calls = mockApiGatewayClient.CreateTrace.mock.calls[0][0];
      expect(calls.data?.events?.[0]?.name).toBe('stack_trace');
    });

    it('should add existing stack trace via addExistingStackTrace', async () => {
      const mockResponse: apiGateway.CreateTraceResponse = {
        status: {
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        },
        traceId: 'trace-existing-stack',
      };

      mockApiGatewayClient.CreateTrace.mockResolvedValue(mockResponse);

      // Capture a stack trace
      const capturedStack = captureStackTrace();

      await client.trace({ name: 'test' })
        .addExistingStackTrace(capturedStack, 'deferred_trace', { reason: 'async' })
        .create();

      const calls = mockApiGatewayClient.CreateTrace.mock.calls[0][0];
      expect(calls.data?.events).toHaveLength(1);
      expect(calls.data?.events?.[0]?.name).toBe('deferred_trace');

      const details = JSON.parse(calls.data?.events?.[0]?.details || '{}');
      expect(details.reason).toBe('async');
      expect(details.stackTrace.frames).toEqual(capturedStack.frames);
      expect(details.stackTrace.raw).toBe(capturedStack.raw);
    });

    it('should ignore stack trace methods on closed trace', async () => {
      const mockResponse: apiGateway.CreateTraceResponse = {
        status: {
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        },
        traceId: 'trace-closed-stack',
      };

      // Mock both CreateTrace and CloseTrace
      mockApiGatewayClient.CreateTrace.mockResolvedValue(mockResponse);
      (mockApiGatewayClient as jest.Mocked<apiGateway.IngestGatewayServiceClientImpl>).CloseTrace = jest.fn().mockResolvedValue({ accepted: true });

      const trace = client.trace({ name: 'test' });
      await trace.create();
      await trace.close();

      // These should be ignored (trace is closed)
      const mockStack: StackTrace = {
        frames: [{ functionName: 'test', fileName: 'test.ts', lineNumber: 1, columnNumber: 1 }],
        raw: 'test stack',
      };

      trace.addStackTrace('should_be_ignored');
      trace.addExistingStackTrace(mockStack, 'also_ignored');

      // Verify warnings were logged (uses console.warn)
      expect(mockConsoleWarn).toHaveBeenCalledWith(
        '[MiradorTrace] Trace is closed. Ignoring addStackTrace call.'
      );
      expect(mockConsoleWarn).toHaveBeenCalledWith(
        '[MiradorTrace] Trace is closed. Ignoring addExistingStackTrace call.'
      );
    });
  });

});
