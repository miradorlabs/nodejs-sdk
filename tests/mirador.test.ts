// Mirador Client Unit Tests
import { Client, Trace, ChainName, captureStackTrace, chainIdToName, MiradorProvider } from '../src/ingest';
import type { StackTrace, EIP1193Provider } from '../src/ingest';
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

  describe('addTxHint with TxHintOptions', () => {
    it('should accept string details (backwards compatible)', async () => {
      const mockResponse: apiGateway.CreateTraceResponse = {
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
        traceId: 'trace-hint-string',
      };
      mockApiGatewayClient.CreateTrace.mockResolvedValue(mockResponse);

      await client.trace({ name: 'test', captureStackTrace: false })
        .addTxHint('0xabc', 'ethereum', 'simple string')
        .create();

      const calls = mockApiGatewayClient.CreateTrace.mock.calls[0][0];
      expect(calls.data?.txHashHints?.[0]?.details).toBe('simple string');
    });

    it('should accept TxHintOptions with input', async () => {
      const mockResponse: apiGateway.CreateTraceResponse = {
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
        traceId: 'trace-hint-options',
      };
      mockApiGatewayClient.CreateTrace.mockResolvedValue(mockResponse);

      await client.trace({ name: 'test', captureStackTrace: false })
        .addTxHint('0xabc', 'ethereum', { input: '0xa9059cbb...' })
        .create();

      const calls = mockApiGatewayClient.CreateTrace.mock.calls[0][0];
      const details = JSON.parse(calls.data?.txHashHints?.[0]?.details || '{}');
      expect(details.input).toBe('0xa9059cbb...');
    });

    it('should accept TxHintOptions with input and details', async () => {
      const mockResponse: apiGateway.CreateTraceResponse = {
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
        traceId: 'trace-hint-both',
      };
      mockApiGatewayClient.CreateTrace.mockResolvedValue(mockResponse);

      await client.trace({ name: 'test', captureStackTrace: false })
        .addTxHint('0xabc', 'ethereum', { input: '0xa9059cbb...', details: 'swap' })
        .create();

      const calls = mockApiGatewayClient.CreateTrace.mock.calls[0][0];
      const details = JSON.parse(calls.data?.txHashHints?.[0]?.details || '{}');
      expect(details.input).toBe('0xa9059cbb...');
      expect(details.details).toBe('swap');
    });
  });

  describe('addTx', () => {
    it('should extract hash and chain from TransactionLike', async () => {
      const mockResponse: apiGateway.CreateTraceResponse = {
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
        traceId: 'trace-addtx',
      };
      mockApiGatewayClient.CreateTrace.mockResolvedValue(mockResponse);

      await client.trace({ name: 'test', captureStackTrace: false })
        .addTx({ hash: '0xabc', chainId: 1 })
        .create();

      const calls = mockApiGatewayClient.CreateTrace.mock.calls[0][0];
      expect(calls.data?.txHashHints?.[0]?.txHash).toBe('0xabc');
      expect(calls.data?.txHashHints?.[0]?.chain).toBe(Chain.CHAIN_ETHEREUM);
    });

    it('should extract input data from tx.data', async () => {
      const mockResponse: apiGateway.CreateTraceResponse = {
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
        traceId: 'trace-addtx-data',
      };
      mockApiGatewayClient.CreateTrace.mockResolvedValue(mockResponse);

      await client.trace({ name: 'test', captureStackTrace: false })
        .addTx({ hash: '0xabc', chainId: 1, data: '0xa9059cbb...' })
        .create();

      const calls = mockApiGatewayClient.CreateTrace.mock.calls[0][0];
      const details = JSON.parse(calls.data?.txHashHints?.[0]?.details || '{}');
      expect(details.input).toBe('0xa9059cbb...');
    });

    it('should extract input data from tx.input', async () => {
      const mockResponse: apiGateway.CreateTraceResponse = {
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
        traceId: 'trace-addtx-input',
      };
      mockApiGatewayClient.CreateTrace.mockResolvedValue(mockResponse);

      await client.trace({ name: 'test', captureStackTrace: false })
        .addTx({ hash: '0xabc', chainId: 137, input: '0xdeadbeef' })
        .create();

      const calls = mockApiGatewayClient.CreateTrace.mock.calls[0][0];
      expect(calls.data?.txHashHints?.[0]?.chain).toBe(Chain.CHAIN_POLYGON);
      const details = JSON.parse(calls.data?.txHashHints?.[0]?.details || '{}');
      expect(details.input).toBe('0xdeadbeef');
    });

    it('should accept explicit chain parameter over chainId', async () => {
      const mockResponse: apiGateway.CreateTraceResponse = {
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
        traceId: 'trace-addtx-chain',
      };
      mockApiGatewayClient.CreateTrace.mockResolvedValue(mockResponse);

      await client.trace({ name: 'test', captureStackTrace: false })
        .addTx({ hash: '0xabc', chainId: 1 }, 'polygon')
        .create();

      const calls = mockApiGatewayClient.CreateTrace.mock.calls[0][0];
      expect(calls.data?.txHashHints?.[0]?.chain).toBe(Chain.CHAIN_POLYGON);
    });

    it('should return this for chaining', () => {
      const trace = client.trace({ name: 'test' });
      expect(trace.addTx({ hash: '0xabc', chainId: 1 })).toBe(trace);
    });
  });

  describe('setProvider and sendTransaction', () => {
    let mockProvider: EIP1193Provider;

    beforeEach(() => {
      mockProvider = {
        request: jest.fn().mockImplementation(async (args: { method: string }) => {
          if (args.method === 'eth_chainId') return '0x1';
          if (args.method === 'eth_sendTransaction') return '0xtxhash123';
          return null;
        }),
      };
    });

    it('setProvider should return this for chaining', () => {
      const trace = client.trace({ name: 'test' });
      expect(trace.setProvider(mockProvider)).toBe(trace);
    });

    it('setProvider should cache chain ID from provider', async () => {
      const trace = client.trace({ name: 'test' });
      trace.setProvider(mockProvider);
      await new Promise(r => setTimeout(r, 0));
      expect(trace.getProviderChain()).toBe('ethereum');
    });

    it('sendTransaction should send tx and return hash', async () => {
      const mockResponse: apiGateway.CreateTraceResponse = {
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
        traceId: 'trace-sendtx',
      };
      mockApiGatewayClient.CreateTrace.mockResolvedValue(mockResponse);

      const trace = client.trace({ name: 'test', captureStackTrace: false });
      trace.setProvider(mockProvider);
      await new Promise(r => setTimeout(r, 0));

      const txHash = await trace.sendTransaction({
        from: '0xsender',
        to: '0xreceiver',
        data: '0xa9059cbb0000',
        chainId: 1,
      });

      expect(txHash).toBe('0xtxhash123');
      expect(mockProvider.request).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'eth_sendTransaction' })
      );
    });

    it('sendTransaction should throw if no provider', async () => {
      const trace = client.trace({ name: 'test' });
      await expect(
        trace.sendTransaction({ from: '0x1' })
      ).rejects.toThrow('[MiradorTrace] No provider configured');
    });

    it('sendTransaction should capture error and re-throw', async () => {
      const errorProvider: EIP1193Provider = {
        request: jest.fn().mockImplementation(async (args: { method: string }) => {
          if (args.method === 'eth_chainId') return '0x1';
          if (args.method === 'eth_sendTransaction') throw new Error('User rejected');
          return null;
        }),
      };

      const trace = client.trace({ name: 'test', captureStackTrace: false });
      trace.setProvider(errorProvider);
      await new Promise(r => setTimeout(r, 0));

      await expect(
        trace.sendTransaction({ from: '0x1', chainId: 1 })
      ).rejects.toThrow('User rejected');
    });

    it('sendTransaction should accept provider as parameter', async () => {
      const trace = client.trace({ name: 'test', captureStackTrace: false });
      const txHash = await trace.sendTransaction(
        { from: '0xsender', chainId: 1 },
        mockProvider
      );
      expect(txHash).toBe('0xtxhash123');
    });
  });

  describe('resolveChain', () => {
    it('should prefer explicit chain parameter', () => {
      const trace = client.trace({ name: 'test' });
      expect(trace.resolveChain('polygon', 1)).toBe('polygon');
    });

    it('should fall back to chainId', () => {
      const trace = client.trace({ name: 'test' });
      expect(trace.resolveChain(undefined, 137)).toBe('polygon');
    });

    it('should fall back to provider chain', async () => {
      const mockProvider: EIP1193Provider = {
        request: jest.fn().mockResolvedValue('0x1'),
      };
      const trace = client.trace({ name: 'test' });
      trace.setProvider(mockProvider);
      await new Promise(r => setTimeout(r, 0));
      expect(trace.resolveChain()).toBe('ethereum');
    });

    it('should throw if chain cannot be determined', () => {
      const trace = client.trace({ name: 'test' });
      expect(() => trace.resolveChain()).toThrow('[MiradorTrace] Cannot determine chain');
    });
  });

  describe('backwards compatibility', () => {
    const mockResponse: apiGateway.CreateTraceResponse = {
      status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
      traceId: 'trace-compat',
    };

    beforeEach(() => {
      mockApiGatewayClient.CreateTrace.mockResolvedValue(mockResponse);
      (mockApiGatewayClient as jest.Mocked<apiGateway.IngestGatewayServiceClientImpl>).CloseTrace = jest.fn().mockResolvedValue({ accepted: true });
    });

    it('should construct Client with just an API key', () => {
      const c = new Client('my-key');
      expect(c.apiKey).toBe('my-key');
    });

    it('should construct Client with API key and options', () => {
      const c = new Client('my-key', { apiUrl: 'x' });
      expect(c.apiKey).toBe('my-key');
      expect(c.apiUrl).toBe('x');
    });

    it('should create trace without options', () => {
      const trace = client.trace();
      expect(trace).toBeInstanceOf(Trace);
    });

    it('should create trace with only legacy options', () => {
      const trace = client.trace({ name: 'x', captureStackTrace: false, maxRetries: 2, retryBackoff: 500 });
      expect(trace).toBeInstanceOf(Trace);
    });

    it('should support addTxHint with no options', async () => {
      await client.trace({ name: 'test', captureStackTrace: false })
        .addTxHint('0xhash', 'ethereum')
        .create();

      const calls = mockApiGatewayClient.CreateTrace.mock.calls[0][0];
      expect(calls.data?.txHashHints?.[0]?.txHash).toBe('0xhash');
      expect(calls.data?.txHashHints?.[0]?.chain).toBe(Chain.CHAIN_ETHEREUM);
      expect(calls.data?.txHashHints?.[0]?.details).toBeUndefined();
    });

    it('should support addTxHint with string details (raw string, not JSON)', async () => {
      await client.trace({ name: 'test', captureStackTrace: false })
        .addTxHint('0xhash', 'ethereum', 'swap tx')
        .create();

      const calls = mockApiGatewayClient.CreateTrace.mock.calls[0][0];
      expect(calls.data?.txHashHints?.[0]?.details).toBe('swap tx');
    });

    it('should support addTxHint with undefined options', async () => {
      await client.trace({ name: 'test', captureStackTrace: false })
        .addTxHint('0xhash', 'base', undefined)
        .create();

      const calls = mockApiGatewayClient.CreateTrace.mock.calls[0][0];
      expect(calls.data?.txHashHints?.[0]?.txHash).toBe('0xhash');
      expect(calls.data?.txHashHints?.[0]?.chain).toBe(Chain.CHAIN_BASE);
      expect(calls.data?.txHashHints?.[0]?.details).toBeUndefined();
    });

    it('should support addTxInputData', async () => {
      await client.trace({ name: 'test', captureStackTrace: false })
        .addTxInputData('0xabcd')
        .create();

      const calls = mockApiGatewayClient.CreateTrace.mock.calls[0][0];
      expect(calls.data?.events?.[0]?.name).toBe('Tx input data');
      expect(calls.data?.events?.[0]?.details).toBe('0xabcd');
    });

    it('should support full legacy workflow with all data present', async () => {
      await client.trace({ name: 'swap', captureStackTrace: false })
        .addAttribute('user', '0x1')
        .addTag('dex')
        .addEvent('started', 'details')
        .addTxHint('0xhash', 'ethereum', 'swap tx')
        .addTxInputData('0xdata')
        .create();

      expect(mockApiGatewayClient.CreateTrace).toHaveBeenCalledTimes(1);
      const calls = mockApiGatewayClient.CreateTrace.mock.calls[0][0];

      // Verify name
      expect(calls.name).toBe('swap');

      // Verify attributes
      expect(calls.data?.attributes?.[0]?.attributes).toEqual(
        expect.objectContaining({ user: '0x1' })
      );

      // Verify tags
      expect(calls.data?.tags?.[0]?.tags).toEqual(['dex']);

      // Verify events (started + Tx input data)
      const eventNames = calls.data?.events?.map((e: { name?: string; details?: string }) => e.name);
      expect(eventNames).toContain('started');
      expect(eventNames).toContain('Tx input data');

      const startedEvent = calls.data?.events?.find((e: { name?: string; details?: string }) => e.name === 'started');
      expect(startedEvent?.details).toBe('details');

      const inputDataEvent = calls.data?.events?.find((e: { name?: string; details?: string }) => e.name === 'Tx input data');
      expect(inputDataEvent?.details).toBe('0xdata');

      // Verify tx hints with raw string details
      expect(calls.data?.txHashHints?.[0]?.txHash).toBe('0xhash');
      expect(calls.data?.txHashHints?.[0]?.chain).toBe(Chain.CHAIN_ETHEREUM);
      expect(calls.data?.txHashHints?.[0]?.details).toBe('swap tx');
    });

    it('should ignore methods on closed trace without crashing', async () => {
      const trace = client.trace({ name: 'test', captureStackTrace: false });
      await trace.create();
      await trace.close();

      // These should be ignored (trace is closed)
      trace.addTx({ hash: '0xabc', chainId: 1 });

      // Verify warnings were logged for addTx
      expect(mockConsoleWarn).toHaveBeenCalledWith(
        '[MiradorTrace] Trace is closed, ignoring addTx'
      );

      // addAttribute, addTag, addEvent should also be silently ignored
      trace.addAttribute('key', 'value');
      expect(mockConsoleWarn).toHaveBeenCalledWith(
        '[MiradorTrace] Trace is closed, ignoring addAttribute'
      );

      trace.addTag('tag');
      expect(mockConsoleWarn).toHaveBeenCalledWith(
        '[MiradorTrace] Trace is closed, ignoring addTag'
      );

      trace.addEvent('event', 'details');
      expect(mockConsoleWarn).toHaveBeenCalledWith(
        '[MiradorTrace] Trace is closed, ignoring addEvent'
      );

      // create() on a closed trace returns undefined
      const result = await trace.create();
      expect(result).toBeUndefined();

      // sendTransaction without provider should still throw
      const traceNoProvider = client.trace({ name: 'test2', captureStackTrace: false });
      await traceNoProvider.create();
      await traceNoProvider.close();
      await expect(
        traceNoProvider.sendTransaction({ from: '0x1' })
      ).rejects.toThrow('[MiradorTrace] No provider configured');
    });
  });

  describe('provider configuration', () => {
    const mockResponse: apiGateway.CreateTraceResponse = {
      status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
      traceId: 'trace-provider-cfg',
    };

    let ethProvider: EIP1193Provider;
    let polygonProvider: EIP1193Provider;

    beforeEach(() => {
      mockApiGatewayClient.CreateTrace.mockResolvedValue(mockResponse);

      ethProvider = {
        request: jest.fn().mockImplementation(async (args: { method: string }) => {
          if (args.method === 'eth_chainId') return '0x1';
          if (args.method === 'eth_sendTransaction') return '0xethhash';
          return null;
        }),
      };

      polygonProvider = {
        request: jest.fn().mockImplementation(async (args: { method: string }) => {
          if (args.method === 'eth_chainId') return '0x89'; // 137
          if (args.method === 'eth_sendTransaction') return '0xpolyhash';
          return null;
        }),
      };
    });

    it('should flow provider from ClientOptions to trace', async () => {
      const c = new Client('key', { provider: ethProvider });

      // Re-mock after new Client construction
      jest
        .spyOn(apiGateway, 'IngestGatewayServiceClientImpl')
        .mockImplementation(() => mockApiGatewayClient);

      const trace = c.trace({ captureStackTrace: false });
      await new Promise(r => setTimeout(r, 0));
      expect(trace.getProviderChain()).toBe('ethereum');
    });

    it('should allow TraceOptions provider to override ClientOptions provider', async () => {
      const c = new Client('key', { provider: ethProvider });

      jest
        .spyOn(apiGateway, 'IngestGatewayServiceClientImpl')
        .mockImplementation(() => mockApiGatewayClient);

      const trace = c.trace({ captureStackTrace: false, provider: polygonProvider });
      await new Promise(r => setTimeout(r, 0));
      expect(trace.getProviderChain()).toBe('polygon');
    });

    it('should allow setProvider to override TraceOptions provider', async () => {
      const c = new Client('key');

      jest
        .spyOn(apiGateway, 'IngestGatewayServiceClientImpl')
        .mockImplementation(() => mockApiGatewayClient);

      const trace = c.trace({ captureStackTrace: false, provider: polygonProvider });
      await new Promise(r => setTimeout(r, 0));
      expect(trace.getProviderChain()).toBe('polygon');

      trace.setProvider(ethProvider);
      await new Promise(r => setTimeout(r, 0));
      expect(trace.getProviderChain()).toBe('ethereum');
    });

    it('should handle setProvider with failing eth_chainId', async () => {
      const failProvider: EIP1193Provider = {
        request: jest.fn().mockRejectedValue(new Error('RPC error')),
      };

      const trace = client.trace({ name: 'test', captureStackTrace: false });
      trace.setProvider(failProvider);
      await new Promise(r => setTimeout(r, 0));
      expect(trace.getProviderChain()).toBeNull();
    });

    it('should handle setProvider with unknown chain ID', async () => {
      const unknownChainProvider: EIP1193Provider = {
        request: jest.fn().mockResolvedValue('0xffffff'),
      };

      const trace = client.trace({ name: 'test', captureStackTrace: false });
      trace.setProvider(unknownChainProvider);
      await new Promise(r => setTimeout(r, 0));
      expect(trace.getProviderChain()).toBeNull();
    });

    it('should serialize bigint values correctly in sendTransaction', async () => {
      const trace = client.trace({ name: 'test', captureStackTrace: false });
      trace.setProvider(ethProvider);
      await new Promise(r => setTimeout(r, 0));

      await trace.sendTransaction({
        from: '0xsender',
        to: '0xreceiver',
        value: BigInt('1000000000000000000'),
        gas: BigInt(21000),
        chainId: 1,
      });

      const sendCall = (ethProvider.request as jest.Mock).mock.calls.find(
        (c: [{ method: string }]) => c[0].method === 'eth_sendTransaction'
      );
      expect(sendCall).toBeDefined();
      const params = sendCall[0].params[0];
      expect(params.value).toBe('0xde0b6b3a7640000');
      expect(params.gas).toBe('0x5208');
    });

    it('should capture tx:send event after sendTransaction', async () => {
      const trace = client.trace({ name: 'test', captureStackTrace: false });
      trace.setProvider(ethProvider);
      await new Promise(r => setTimeout(r, 0));

      await trace.sendTransaction({
        from: '0xsender',
        to: '0xreceiver',
        data: '0xa9059cbb0000',
        chainId: 1,
      });

      await trace.create();

      const calls = mockApiGatewayClient.CreateTrace.mock.calls[0][0];
      const eventNames = calls.data?.events?.map((e: { name?: string; details?: string }) => e.name);
      expect(eventNames).toContain('tx:send');
    });

    it('should capture tx:sent event with txHash after sendTransaction', async () => {
      const trace = client.trace({ name: 'test', captureStackTrace: false });
      trace.setProvider(ethProvider);
      await new Promise(r => setTimeout(r, 0));

      await trace.sendTransaction({
        from: '0xsender',
        to: '0xreceiver',
        chainId: 1,
      });

      await trace.create();

      const calls = mockApiGatewayClient.CreateTrace.mock.calls[0][0];
      const sentEvent = calls.data?.events?.find((e: { name?: string; details?: string }) => e.name === 'tx:sent');
      expect(sentEvent).toBeDefined();
      const sentDetails = JSON.parse(sentEvent.details);
      expect(sentDetails.txHash).toBe('0xethhash');
    });

    it('should capture tx:error event with code and data', async () => {
      const errorProvider: EIP1193Provider = {
        request: jest.fn().mockImplementation(async (args: { method: string }) => {
          if (args.method === 'eth_chainId') return '0x1';
          if (args.method === 'eth_sendTransaction') {
            const err = Object.assign(new Error('User rejected'), { code: 4001, data: '0xrevertdata' });
            throw err;
          }
          return null;
        }),
      };

      const trace = client.trace({ name: 'test', captureStackTrace: false });
      trace.setProvider(errorProvider);
      await new Promise(r => setTimeout(r, 0));

      await expect(
        trace.sendTransaction({ from: '0x1', chainId: 1 })
      ).rejects.toThrow('User rejected');

      await trace.create();

      const calls = mockApiGatewayClient.CreateTrace.mock.calls[0][0];
      const errorEvent = calls.data?.events?.find((e: { name?: string; details?: string }) => e.name === 'tx:error');
      expect(errorEvent).toBeDefined();
      const errorDetails = JSON.parse(errorEvent.details);
      expect(errorDetails.code).toBe(4001);
      expect(errorDetails.data).toBe('0xrevertdata');
      expect(errorDetails.message).toBe('User rejected');
    });

    it('should preserve original error from sendTransaction', async () => {
      const originalError = new Error('Original provider error');
      const errorProvider: EIP1193Provider = {
        request: jest.fn().mockImplementation(async (args: { method: string }) => {
          if (args.method === 'eth_chainId') return '0x1';
          if (args.method === 'eth_sendTransaction') throw originalError;
          return null;
        }),
      };

      const trace = client.trace({ name: 'test', captureStackTrace: false });
      trace.setProvider(errorProvider);
      await new Promise(r => setTimeout(r, 0));

      try {
        await trace.sendTransaction({ from: '0x1', chainId: 1 });
        fail('Expected error to be thrown');
      } catch (err) {
        expect(err).toBe(originalError);
      }
    });

    it('should handle multiple sendTransaction calls', async () => {
      const trace = client.trace({ name: 'test', captureStackTrace: false });
      trace.setProvider(ethProvider);
      await new Promise(r => setTimeout(r, 0));

      await trace.sendTransaction({ from: '0xsender', to: '0xa', chainId: 1 });
      await trace.sendTransaction({ from: '0xsender', to: '0xb', chainId: 1 });

      await trace.create();

      const calls = mockApiGatewayClient.CreateTrace.mock.calls[0][0];
      const sendEvents = calls.data?.events?.filter((e: { name?: string; details?: string }) => e.name === 'tx:send');
      const sentEvents = calls.data?.events?.filter((e: { name?: string; details?: string }) => e.name === 'tx:sent');
      expect(sendEvents).toHaveLength(2);
      expect(sentEvents).toHaveLength(2);
    });

    it('should truncate long data in tx:send event', async () => {
      const trace = client.trace({ name: 'test', captureStackTrace: false });
      trace.setProvider(ethProvider);
      await new Promise(r => setTimeout(r, 0));

      const longData = '0xa9059cbb' + '0'.repeat(200);
      await trace.sendTransaction({
        from: '0xsender',
        to: '0xreceiver',
        data: longData,
        chainId: 1,
      });

      await trace.create();

      const calls = mockApiGatewayClient.CreateTrace.mock.calls[0][0];
      const sendEvent = calls.data?.events?.find((e: { name?: string; details?: string }) => e.name === 'tx:send');
      const sendDetails = JSON.parse(sendEvent.details);
      expect(sendDetails.data).toBe(longData.slice(0, 10) + '...');
    });

    it('should handle sendTransaction with no data field', async () => {
      const trace = client.trace({ name: 'test', captureStackTrace: false });
      trace.setProvider(ethProvider);
      await new Promise(r => setTimeout(r, 0));

      await trace.sendTransaction({
        from: '0xsender',
        to: '0xreceiver',
        chainId: 1,
      });

      await trace.create();

      const calls = mockApiGatewayClient.CreateTrace.mock.calls[0][0];
      const sendEvent = calls.data?.events?.find((e: { name?: string; details?: string }) => e.name === 'tx:send');
      const sendDetails = JSON.parse(sendEvent.details);
      expect(sendDetails.data).toBeUndefined();
    });
  });
});

describe('chainIdToName', () => {
  it('should map known chain IDs', () => {
    expect(chainIdToName(1)).toBe('ethereum');
    expect(chainIdToName(137)).toBe('polygon');
    expect(chainIdToName(42161)).toBe('arbitrum');
    expect(chainIdToName(8453)).toBe('base');
    expect(chainIdToName(10)).toBe('optimism');
    expect(chainIdToName(56)).toBe('bsc');
  });

  it('should return undefined for unknown chain IDs', () => {
    expect(chainIdToName(999999)).toBeUndefined();
  });

  it('should handle bigint input', () => {
    expect(chainIdToName(BigInt(1))).toBe('ethereum');
  });

  it('should handle string input', () => {
    expect(chainIdToName('137')).toBe('polygon');
  });

  it('should handle hex string input', () => {
    expect(chainIdToName('0x1')).toBe('ethereum');
  });
});

describe('MiradorProvider', () => {
  let mockClient: Client;
  let mockApiGatewayClient: jest.Mocked<apiGateway.IngestGatewayServiceClientImpl>;
  let mockUnderlying: EIP1193Provider;

  beforeEach(() => {
    jest.clearAllMocks();

    mockClient = new Client('test-api-key');

    mockApiGatewayClient = {
      CreateTrace: jest.fn().mockResolvedValue({
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
        traceId: 'trace-provider-123',
      }),
    } as unknown as jest.Mocked<apiGateway.IngestGatewayServiceClientImpl>;

    jest
      .spyOn(apiGateway, 'IngestGatewayServiceClientImpl')
      .mockImplementation(() => mockApiGatewayClient);

    mockUnderlying = {
      request: jest.fn().mockImplementation(async (args: { method: string }) => {
        if (args.method === 'eth_chainId') return '0x1';
        if (args.method === 'eth_sendTransaction') return '0xtxhash456';
        if (args.method === 'eth_sendRawTransaction') return '0xtxhash456';
        if (args.method === 'eth_blockNumber') return '0x100';
        return null;
      }),
    };
  });

  it('should pass through non-tx methods', async () => {
    const provider = new MiradorProvider(mockUnderlying, mockClient);
    const result = await provider.request({ method: 'eth_blockNumber' });
    expect(result).toBe('0x100');
    expect(mockUnderlying.request).toHaveBeenCalledWith({ method: 'eth_blockNumber' });
  });

  it('should intercept eth_sendTransaction', async () => {
    const provider = new MiradorProvider(mockUnderlying, mockClient);
    const result = await provider.request({
      method: 'eth_sendTransaction',
      params: [{ from: '0xsender', to: '0xreceiver', data: '0xdeadbeef', chainId: '0x1' }],
    });
    expect(result).toBe('0xtxhash456');
  });

  it('should intercept eth_sendRawTransaction', async () => {
    const provider = new MiradorProvider(mockUnderlying, mockClient);
    const result = await provider.request({
      method: 'eth_sendRawTransaction',
      params: ['0xrawdata'],
    });
    expect(result).toBe('0xtxhash456');
  });

  it('should re-throw errors from underlying provider', async () => {
    const errorUnderlying: EIP1193Provider = {
      request: jest.fn().mockImplementation(async (args: { method: string }) => {
        if (args.method === 'eth_chainId') return '0x1';
        if (args.method === 'eth_sendTransaction') throw new Error('Tx reverted');
        return null;
      }),
    };

    const provider = new MiradorProvider(errorUnderlying, mockClient);
    await expect(
      provider.request({
        method: 'eth_sendTransaction',
        params: [{ from: '0xsender', chainId: '0x1' }],
      })
    ).rejects.toThrow('Tx reverted');
  });

  it('should use bound trace when provided', async () => {
    const boundTrace = mockClient.trace({ name: 'BoundTrace' });
    const provider = new MiradorProvider(mockUnderlying, mockClient, { trace: boundTrace });

    await provider.request({
      method: 'eth_sendTransaction',
      params: [{ from: '0xsender', chainId: '0x1' }],
    });
    // Verify it doesn't throw
  });

  it('should NOT intercept eth_call', async () => {
    const provider = new MiradorProvider(mockUnderlying, mockClient);
    const result = await provider.request({ method: 'eth_call', params: [{ to: '0xcontract', data: '0xdeadbeef' }] });
    expect(result).toBeNull();
    expect(mockUnderlying.request).toHaveBeenCalledWith({ method: 'eth_call', params: [{ to: '0xcontract', data: '0xdeadbeef' }] });
    // Should not trigger CreateTrace since it's a pass-through
    expect(mockApiGatewayClient.CreateTrace).not.toHaveBeenCalled();
  });

  it('should NOT intercept eth_getBalance', async () => {
    const provider = new MiradorProvider(mockUnderlying, mockClient);
    const result = await provider.request({ method: 'eth_getBalance', params: ['0xaddr', 'latest'] });
    expect(result).toBeNull();
    expect(mockUnderlying.request).toHaveBeenCalledWith({ method: 'eth_getBalance', params: ['0xaddr', 'latest'] });
    expect(mockApiGatewayClient.CreateTrace).not.toHaveBeenCalled();
  });

  it('should NOT intercept eth_estimateGas', async () => {
    const provider = new MiradorProvider(mockUnderlying, mockClient);
    const result = await provider.request({ method: 'eth_estimateGas', params: [{ from: '0x1', to: '0x2' }] });
    expect(result).toBeNull();
    expect(mockUnderlying.request).toHaveBeenCalledWith({ method: 'eth_estimateGas', params: [{ from: '0x1', to: '0x2' }] });
    expect(mockApiGatewayClient.CreateTrace).not.toHaveBeenCalled();
  });

  it('should reuse bound trace across multiple sends', async () => {
    const boundTrace = mockClient.trace({ name: 'BoundReuse', captureStackTrace: false });
    const addEventSpy = jest.spyOn(boundTrace, 'addEvent');
    const provider = new MiradorProvider(mockUnderlying, mockClient, { trace: boundTrace });

    await provider.request({
      method: 'eth_sendTransaction',
      params: [{ from: '0xsender', chainId: '0x1' }],
    });

    await provider.request({
      method: 'eth_sendTransaction',
      params: [{ from: '0xsender2', chainId: '0x1' }],
    });

    // Both sends should use the same bound trace
    const sentCalls = addEventSpy.mock.calls.filter((c: unknown[]) => c[0] === 'tx:sent');
    expect(sentCalls).toHaveLength(2);
  });

  it('should create new trace per tx when no bound trace', async () => {
    const traceSpy = jest.spyOn(mockClient, 'trace');
    const provider = new MiradorProvider(mockUnderlying, mockClient);

    await provider.request({
      method: 'eth_sendTransaction',
      params: [{ from: '0xsender', chainId: '0x1' }],
    });

    await provider.request({
      method: 'eth_sendTransaction',
      params: [{ from: '0xsender2', chainId: '0x1' }],
    });

    // Each send should create a new trace
    expect(traceSpy).toHaveBeenCalledTimes(2);
  });

  it('should pass traceOptions through when creating new traces', async () => {
    const traceSpy = jest.spyOn(mockClient, 'trace');
    const provider = new MiradorProvider(mockUnderlying, mockClient, {
      traceOptions: { name: 'auto-tx' },
    });

    await provider.request({
      method: 'eth_sendTransaction',
      params: [{ from: '0xsender', chainId: '0x1' }],
    });

    expect(traceSpy).toHaveBeenCalledWith({ name: 'auto-tx' });
  });

  it('should re-throw errors from underlying for eth_sendRawTransaction', async () => {
    const errorUnderlying: EIP1193Provider = {
      request: jest.fn().mockImplementation(async (args: { method: string }) => {
        if (args.method === 'eth_chainId') return '0x1';
        if (args.method === 'eth_sendRawTransaction') throw new Error('Raw tx failed');
        return null;
      }),
    };

    const provider = new MiradorProvider(errorUnderlying, mockClient);
    await expect(
      provider.request({
        method: 'eth_sendRawTransaction',
        params: ['0xrawdata'],
      })
    ).rejects.toThrow('Raw tx failed');
  });

  it('should handle eth_sendTransaction with no params gracefully', async () => {
    const provider = new MiradorProvider(mockUnderlying, mockClient);
    // params undefined - should not crash
    const result = await provider.request({
      method: 'eth_sendTransaction',
    });
    expect(result).toBe('0xtxhash456');
  });

  it('should pass unmodified args to underlying provider', async () => {
    const provider = new MiradorProvider(mockUnderlying, mockClient);
    const args = {
      method: 'eth_sendTransaction' as const,
      params: [{ from: '0xsender', to: '0xreceiver', data: '0xdeadbeef', chainId: '0x1' }],
    };

    await provider.request(args);

    // Verify underlying received the exact same args object
    expect(mockUnderlying.request).toHaveBeenCalledWith(args);
  });
});
