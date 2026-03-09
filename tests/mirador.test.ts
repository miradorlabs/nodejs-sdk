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

    // Create mock for IngestGatewayServiceClientImpl with defaults
    // FlushTrace, CloseTrace, KeepAlive are needed because auto-flush (via scheduleFlush)
    // can trigger FlushTrace asynchronously during tests.
    mockApiGatewayClient = {
      FlushTrace: jest.fn().mockResolvedValue({
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
        traceId: 'trace-xxx',
        created: true,
      }),
      CloseTrace: jest.fn().mockResolvedValue({ accepted: true }),
      KeepAlive: jest.fn().mockResolvedValue({ accepted: true }),
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
      expect(NodeGrpcRpc).toHaveBeenCalledWith('ingest.mirador.org:443', apiKey, true);
    });

    it('should use custom API URL if provided', () => {
      const apiKey = 'test-key';
      const customUrl = 'custom-gateway.example.com:50053';
      new Client(apiKey, { apiUrl: customUrl });
      expect(NodeGrpcRpc).toHaveBeenCalledWith(customUrl, apiKey, true);
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
      const mockResponse: apiGateway.FlushTraceResponse = {
        status: {
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        },
        traceId: 'trace-builder-123',
        created: true,
      };

      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockResponse);

      const trace = client.trace({ name: 'swap_execution', captureStackTrace: false })
        .addAttribute('user', '0xabc...')
        .addTag('dex');
      const traceId = await trace.create();

      // Trace ID is auto-generated upfront, so create() returns the trace's own ID
      expect(traceId).toBe(trace.getTraceId());
      expect(typeof traceId).toBe('string');

      const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      expect(calls.name).toBe('swap_execution');
      expect(calls.data?.attributes?.[0]?.attributes).toEqual({ user: '0xabc...' });
      expect(calls.data?.tags?.[0]?.tags).toEqual(['dex']);
      expect(calls.data?.events).toEqual([]);
      expect(calls.data?.txHashHints).toEqual([]);
    });

    it('should handle multiple attributes with different types', async () => {
      const mockResponse: apiGateway.FlushTraceResponse = {
        status: {
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        },
        traceId: 'trace-multi-attr',
        created: true,
      };

      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockResponse);

      await client.trace({ name: 'test', captureStackTrace: false })
        .addAttribute('stringValue', 'hello')
        .addAttribute('numberValue', 42)
        .addAttribute('booleanValue', true)
        .create();

      const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      expect(calls.name).toBe('test');
      expect(calls.data?.attributes?.[0]?.attributes).toEqual({
        stringValue: 'hello',
        numberValue: '42',
        booleanValue: 'true',
      });
    });

    it('should stringify object attribute values', async () => {
      const mockResponse: apiGateway.FlushTraceResponse = {
        status: {
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        },
        traceId: 'trace-object-attr',
        created: true,
      };

      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockResponse);

      await client.trace({ name: 'test', captureStackTrace: false })
        .addAttribute('metadata', { key: 'value', count: 42 })
        .addAttribute('nested', { a: { b: 'c' } })
        .create();

      const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      expect(calls.data?.attributes?.[0]?.attributes).toEqual({
        metadata: '{"key":"value","count":42}',
        nested: '{"a":{"b":"c"}}',
      });
    });

    it('should handle addAttributes with multiple key-value pairs including objects', async () => {
      const mockResponse: apiGateway.FlushTraceResponse = {
        status: {
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        },
        traceId: 'trace-batch-attrs',
        created: true,
      };

      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockResponse);

      await client.trace({ name: 'test', captureStackTrace: false })
        .addAttributes({
          user: '0xabc',
          slippage: 25,
          isPremium: true,
          config: { setting: 'value' },
        })
        .create();

      const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      expect(calls.data?.attributes?.[0]?.attributes).toEqual({
        user: '0xabc',
        slippage: '25',
        isPremium: 'true',
        config: '{"setting":"value"}',
      });
    });

    it('should handle multiple tags', async () => {
      const mockResponse: apiGateway.FlushTraceResponse = {
        status: {
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        },
        traceId: 'trace-tags',
        created: true,
      };

      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockResponse);

      await client.trace({ name: 'test' })
        .addTag('tag1')
        .addTag('tag2')
        .addTags(['tag3', 'tag4'])
        .create();

      const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      expect(calls.data?.tags?.[0]?.tags).toEqual(['tag1', 'tag2', 'tag3', 'tag4']);
    });

    it('should handle events with different detail types', async () => {
      const mockResponse: apiGateway.FlushTraceResponse = {
        status: {
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        },
        traceId: 'trace-events',
        created: true,
      };

      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockResponse);

      const timestamp1 = new Date('2024-01-01T00:00:00Z');
      const timestamp2 = new Date('2024-01-01T00:00:05Z');

      await client.trace({ name: 'test' })
        .addEvent('event1', 'string details', timestamp1)
        .addEvent('event2', { key: 'value', count: 42 }, timestamp2)
        .addEvent('event3') // no details, auto timestamp
        .create();

      const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
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
      const mockResponse: apiGateway.FlushTraceResponse = {
        status: {
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        },
        traceId: 'trace-txhint',
        created: true,
      };

      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockResponse);

      await client.trace({ name: 'swap' })
        .addTxHint('0x123...', 'ethereum', 'Swap transaction')
        .create();

      const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      const txHashHints = calls.data?.txHashHints;
      expect(txHashHints).toHaveLength(1);
      expect(txHashHints?.[0]?.txHash).toBe('0x123...');
      expect(txHashHints?.[0]?.chain).toBe(Chain.CHAIN_ETHEREUM);
      expect(txHashHints?.[0]?.details).toBe('Swap transaction');
      expect(txHashHints?.[0]?.timestamp).toBeInstanceOf(Date);
    });

    it('should handle different chain names', async () => {
      const mockResponse: apiGateway.FlushTraceResponse = {
        status: {
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        },
        traceId: 'trace-chains',
        created: true,
      };

      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockResponse);

      // Test polygon
      await client.trace({ name: 'test' })
        .addTxHint('0xpolygon...', 'polygon')
        .create();

      let calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      expect(calls.data?.txHashHints?.[0]?.chain).toBe(Chain.CHAIN_POLYGON);

      // Test arbitrum
      mockApiGatewayClient.FlushTrace.mockClear();
      await client.trace({ name: 'test' })
        .addTxHint('0xarbitrum...', 'arbitrum')
        .create();

      calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      expect(calls.data?.txHashHints?.[0]?.chain).toBe(Chain.CHAIN_ARBITRUM);

      // Test base
      mockApiGatewayClient.FlushTrace.mockClear();
      await client.trace({ name: 'test' })
        .addTxHint('0xbase...', 'base')
        .create();

      calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      expect(calls.data?.txHashHints?.[0]?.chain).toBe(Chain.CHAIN_BASE);

      // Test optimism
      mockApiGatewayClient.FlushTrace.mockClear();
      await client.trace({ name: 'test' })
        .addTxHint('0xoptimism...', 'optimism')
        .create();

      calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      expect(calls.data?.txHashHints?.[0]?.chain).toBe(Chain.CHAIN_OPTIMISM);

      // Test bsc
      mockApiGatewayClient.FlushTrace.mockClear();
      await client.trace({ name: 'test' })
        .addTxHint('0xbsc...', 'bsc')
        .create();

      calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      expect(calls.data?.txHashHints?.[0]?.chain).toBe(Chain.CHAIN_BSC);
    });

    it('should create without txHashHint when not set', async () => {
      const mockResponse: apiGateway.FlushTraceResponse = {
        status: {
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        },
        traceId: 'trace-no-tx',
        created: true,
      };

      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockResponse);

      await client.trace({ name: 'test' })
        .addTag('no-tx')
        .create();

      const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      expect(calls.data?.txHashHints).toEqual([]);
    });

    it('should build a complex trace with all features', async () => {
      const mockResponse: apiGateway.FlushTraceResponse = {
        status: {
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        },
        traceId: 'trace-complex',
        created: true,
      };

      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockResponse);

      const trace = client.trace({ name: 'swap_execution', captureStackTrace: false })
        .addAttribute('user', '0xabc...')
        .addAttribute('slippage_bps', 25)
        .addAttribute('metadata', { version: '1.0' })
        .addTag('dex')
        .addTag('swap')
        .addEvent('wallet_connected', 'MetaMask connected')
        .addEvent('quote_received', { amount: 100, token: 'USDC' })
        .addEvent('tx_signed')
        .addTxHint('0x123...', 'ethereum');
      const traceId = await trace.create();

      expect(traceId).toBe(trace.getTraceId());

      const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
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
      const mockResponse: apiGateway.FlushTraceResponse = {
        status: {
          code: ResponseStatus_StatusCode.STATUS_CODE_INTERNAL_ERROR,
          errorMessage: 'Something went wrong'
        },
        traceId: '',
        created: true,
      };

      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockResponse);

      const traceId = await client.trace({ name: 'test' })
        .addTag('error-test')
        .create();

      expect(traceId).toBeUndefined();
      expect(mockConsoleError).toHaveBeenCalledWith(
        '[MiradorTrace] FlushTrace failed:',
        'Something went wrong'
      );
    });

    it('should return undefined and log error when exception is thrown', async () => {
      const mockError = new Error('Network error');
      mockApiGatewayClient.FlushTrace.mockRejectedValue(mockError);

      const traceId = await client.trace({ name: 'test' })
        .addTag('exception-test')
        .create();

      expect(traceId).toBeUndefined();
      expect(mockConsoleError).toHaveBeenCalledWith(
        '[MiradorTrace] FlushTrace error after retries:',
        mockError
      );
    });
  });

  describe('multiple traces', () => {
    it('should create multiple independent trace builders', async () => {
      const mockResponse1: apiGateway.FlushTraceResponse = {
        status: {
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        },
        traceId: 'trace-1',
        created: true,
      };

      const mockResponse2: apiGateway.FlushTraceResponse = {
        status: {
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        },
        traceId: 'trace-2',
        created: true,
      };

      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockResponse1);

      const trace1 = client.trace({ name: 'trace-1', captureStackTrace: false });
      const result1 = await trace1
        .addAttribute('id', '1')
        .addTag('first')
        .create();

      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockResponse2);

      const trace2 = client.trace({ name: 'trace-2', captureStackTrace: false });
      const result2 = await trace2
        .addAttribute('id', '2')
        .addTag('second')
        .create();

      // create() returns the auto-generated traceId from the trace instance
      expect(result1).toBe(trace1.getTraceId());
      expect(result2).toBe(trace2.getTraceId());
      expect(result1).not.toBe(result2); // Each trace gets a unique ID
      expect(mockApiGatewayClient.FlushTrace).toHaveBeenCalledTimes(2);
    });
  });

  describe('CHAIN_MAP coverage', () => {
    it('should map all ChainName values to valid Chain enum values', async () => {
      const mockResponse: apiGateway.FlushTraceResponse = {
        status: {
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        },
        traceId: 'trace-chain-map',
        created: true,
      };
      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockResponse);

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
        mockApiGatewayClient.FlushTrace.mockClear();

        await client.trace({ name: 'test' })
          .addTxHint('0x123', chainName)
          .create();

        const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
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
      const mockResponse: apiGateway.FlushTraceResponse = {
        status: {
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        },
        traceId: 'trace-tx-input',
        created: true,
      };

      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockResponse);

      const inputData = '0xa9059cbb0000000000000000000000001234567890abcdef';

      await client.trace({ name: 'test', captureStackTrace: false })
        .addTxInputData(inputData)
        .create();

      const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
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
      const mockResponse: apiGateway.FlushTraceResponse = {
        status: {
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        },
        traceId: 'trace-closed-input',
        created: true,
      };

      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockResponse);
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
      const mockResponse: apiGateway.FlushTraceResponse = {
        status: {
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        },
        traceId: 'trace-combined',
        created: true,
      };

      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockResponse);

      await client.trace({ name: 'swap', captureStackTrace: false })
        .addAttribute('user', '0xabc')
        .addTxHint('0x123', 'ethereum')
        .addTxInputData('0xa9059cbb00000000')
        .addTag('bridge')
        .create();

      const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
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
      const mockResponse: apiGateway.FlushTraceResponse = {
        status: {
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        },
        traceId: 'trace-with-stack',
        created: true,
      };

      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockResponse);

      const trace = client.trace({ name: 'test', captureStackTrace: true });
      const traceId = await trace.create();

      expect(traceId).toBe(trace.getTraceId());

      const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
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
      const mockResponse: apiGateway.FlushTraceResponse = {
        status: {
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        },
        traceId: 'trace-no-stack',
        created: true,
      };

      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockResponse);

      await client.trace({ name: 'test', captureStackTrace: false })
        .create();

      const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      const attrs = calls.data?.attributes?.[0]?.attributes;

      // Should not have stack trace attributes
      expect(attrs?.['source.stack_trace']).toBeUndefined();
    });

    it('should add event with captureStackTrace option', async () => {
      const mockResponse: apiGateway.FlushTraceResponse = {
        status: {
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        },
        traceId: 'trace-event-stack',
        created: true,
      };

      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockResponse);

      await client.trace({ name: 'test' })
        .addEvent('error_occurred', { code: 500 }, { captureStackTrace: true })
        .create();

      const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      expect(calls.data?.events).toHaveLength(1);

      const eventDetails = JSON.parse(calls.data?.events?.[0]?.details || '{}');
      expect(eventDetails.code).toBe(500);
      expect(eventDetails.stackTrace).toBeDefined();
      expect(eventDetails.stackTrace.frames).toBeInstanceOf(Array);
    });

    it('should add event with string details and captureStackTrace', async () => {
      const mockResponse: apiGateway.FlushTraceResponse = {
        status: {
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        },
        traceId: 'trace-string-stack',
        created: true,
      };

      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockResponse);

      await client.trace({ name: 'test' })
        .addEvent('message', 'Something happened', { captureStackTrace: true })
        .create();

      const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      const eventDetails = JSON.parse(calls.data?.events?.[0]?.details || '{}');

      expect(eventDetails.message).toBe('Something happened');
      expect(eventDetails.stackTrace).toBeDefined();
    });

    it('should support legacy timestamp parameter for addEvent', async () => {
      const mockResponse: apiGateway.FlushTraceResponse = {
        status: {
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        },
        traceId: 'trace-legacy-timestamp',
        created: true,
      };

      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockResponse);

      const customTimestamp = new Date('2024-01-15T10:00:00Z');

      await client.trace({ name: 'test' })
        .addEvent('legacy_event', 'details', customTimestamp)
        .create();

      const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      expect(calls.data?.events?.[0]?.timestamp).toEqual(customTimestamp);
      expect(calls.data?.events?.[0]?.details).toBe('details');
    });

    it('should add stack trace via addStackTrace method', async () => {
      const mockResponse: apiGateway.FlushTraceResponse = {
        status: {
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        },
        traceId: 'trace-add-stack',
        created: true,
      };

      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockResponse);

      await client.trace({ name: 'test' })
        .addStackTrace('checkpoint', { stage: 'validation' })
        .create();

      const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      expect(calls.data?.events).toHaveLength(1);
      expect(calls.data?.events?.[0]?.name).toBe('checkpoint');

      const details = JSON.parse(calls.data?.events?.[0]?.details || '{}');
      expect(details.stage).toBe('validation');
      expect(details.stackTrace).toBeDefined();
      expect(details.stackTrace.frames).toBeInstanceOf(Array);
    });

    it('should use default event name for addStackTrace', async () => {
      const mockResponse: apiGateway.FlushTraceResponse = {
        status: {
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        },
        traceId: 'trace-default-stack',
        created: true,
      };

      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockResponse);

      await client.trace({ name: 'test' })
        .addStackTrace()
        .create();

      const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      expect(calls.data?.events?.[0]?.name).toBe('stack_trace');
    });

    it('should add existing stack trace via addExistingStackTrace', async () => {
      const mockResponse: apiGateway.FlushTraceResponse = {
        status: {
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        },
        traceId: 'trace-existing-stack',
        created: true,
      };

      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockResponse);

      // Capture a stack trace
      const capturedStack = captureStackTrace();

      await client.trace({ name: 'test' })
        .addExistingStackTrace(capturedStack, 'deferred_trace', { reason: 'async' })
        .create();

      const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      expect(calls.data?.events).toHaveLength(1);
      expect(calls.data?.events?.[0]?.name).toBe('deferred_trace');

      const details = JSON.parse(calls.data?.events?.[0]?.details || '{}');
      expect(details.reason).toBe('async');
      expect(details.stackTrace.frames).toEqual(capturedStack.frames);
      expect(details.stackTrace.raw).toBe(capturedStack.raw);
    });

    it('should ignore stack trace methods on closed trace', async () => {
      const mockResponse: apiGateway.FlushTraceResponse = {
        status: {
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        },
        traceId: 'trace-closed-stack',
        created: true,
      };

      // Mock both FlushTrace and CloseTrace
      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockResponse);
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
      const mockResponse: apiGateway.FlushTraceResponse = {
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
        traceId: 'trace-hint-string',
        created: true,
      };
      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockResponse);

      await client.trace({ name: 'test', captureStackTrace: false })
        .addTxHint('0xabc', 'ethereum', 'simple string')
        .create();

      const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      expect(calls.data?.txHashHints?.[0]?.details).toBe('simple string');
    });

    it('should accept TxHintOptions with input', async () => {
      const mockResponse: apiGateway.FlushTraceResponse = {
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
        traceId: 'trace-hint-options',
        created: true,
      };
      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockResponse);

      await client.trace({ name: 'test', captureStackTrace: false })
        .addTxHint('0xabc', 'ethereum', { input: '0xa9059cbb...' })
        .create();

      const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      const inputEvent = calls.data?.events?.find((e: { name?: string }) => e.name === 'Tx input data');
      expect(inputEvent).toBeDefined();
      expect(inputEvent?.details).toBe('0xa9059cbb...');
    });

    it('should accept TxHintOptions with input and details', async () => {
      const mockResponse: apiGateway.FlushTraceResponse = {
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
        traceId: 'trace-hint-both',
        created: true,
      };
      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockResponse);

      await client.trace({ name: 'test', captureStackTrace: false })
        .addTxHint('0xabc', 'ethereum', { input: '0xa9059cbb...', details: 'swap' })
        .create();

      const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      const inputEvent = calls.data?.events?.find((e: { name?: string }) => e.name === 'Tx input data');
      expect(inputEvent).toBeDefined();
      expect(inputEvent?.details).toBe('0xa9059cbb...');
      expect(calls.data?.txHashHints?.[0]?.details).toBe('swap');
    });
  });

  describe('addSafeMsgHint', () => {
    it('should add a safe message hint with chain and message hash', async () => {
      const mockResponse: apiGateway.FlushTraceResponse = {
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
        traceId: 'trace-safemsg',
        created: true,
      };
      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockResponse);

      await client.trace({ name: 'test', captureStackTrace: false })
        .addSafeMsgHint('0xmsgHash123', 'ethereum')
        .create();

      const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      const safeMsgHints = calls.data?.safeMsgHints;
      expect(safeMsgHints).toHaveLength(1);
      expect(safeMsgHints?.[0]?.messageHash).toBe('0xmsgHash123');
      expect(safeMsgHints?.[0]?.chain).toBe(Chain.CHAIN_ETHEREUM);
      expect(safeMsgHints?.[0]?.timestamp).toBeInstanceOf(Date);
    });

    it('should add a safe message hint with details', async () => {
      const mockResponse: apiGateway.FlushTraceResponse = {
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
        traceId: 'trace-safemsg-details',
        created: true,
      };
      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockResponse);

      await client.trace({ name: 'test', captureStackTrace: false })
        .addSafeMsgHint('0xmsgHash456', 'polygon', 'multisig approval')
        .create();

      const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      const safeMsgHints = calls.data?.safeMsgHints;
      expect(safeMsgHints?.[0]?.messageHash).toBe('0xmsgHash456');
      expect(safeMsgHints?.[0]?.chain).toBe(Chain.CHAIN_POLYGON);
      expect(safeMsgHints?.[0]?.details).toBe('multisig approval');
    });

    it('should support multiple safe message hints', async () => {
      const mockResponse: apiGateway.FlushTraceResponse = {
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
        traceId: 'trace-safemsg-multi',
        created: true,
      };
      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockResponse);

      await client.trace({ name: 'test', captureStackTrace: false })
        .addSafeMsgHint('0xmsg1', 'ethereum')
        .addSafeMsgHint('0xmsg2', 'base', 'second hint')
        .create();

      const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      const safeMsgHints = calls.data?.safeMsgHints;
      expect(safeMsgHints).toHaveLength(2);
      expect(safeMsgHints?.[0]?.messageHash).toBe('0xmsg1');
      expect(safeMsgHints?.[0]?.chain).toBe(Chain.CHAIN_ETHEREUM);
      expect(safeMsgHints?.[1]?.messageHash).toBe('0xmsg2');
      expect(safeMsgHints?.[1]?.chain).toBe(Chain.CHAIN_BASE);
      expect(safeMsgHints?.[1]?.details).toBe('second hint');
    });

    it('should handle different chain names', async () => {
      const mockResponse: apiGateway.FlushTraceResponse = {
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
        traceId: 'trace-safemsg-chains',
        created: true,
      };
      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockResponse);

      const chainTests: Array<{ chain: ChainName; expected: Chain }> = [
        { chain: 'ethereum', expected: Chain.CHAIN_ETHEREUM },
        { chain: 'polygon', expected: Chain.CHAIN_POLYGON },
        { chain: 'arbitrum', expected: Chain.CHAIN_ARBITRUM },
        { chain: 'base', expected: Chain.CHAIN_BASE },
        { chain: 'optimism', expected: Chain.CHAIN_OPTIMISM },
        { chain: 'bsc', expected: Chain.CHAIN_BSC },
      ];

      for (const { chain, expected } of chainTests) {
        mockApiGatewayClient.FlushTrace.mockClear();
        mockApiGatewayClient.FlushTrace.mockResolvedValue(mockResponse);

        await client.trace({ name: 'test', captureStackTrace: false })
          .addSafeMsgHint('0xmsg', chain)
          .create();

        const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
        expect(calls.data?.safeMsgHints?.[0]?.chain).toBe(expected);
      }
    });

    it('should be ignored when trace is closed', async () => {
      const mockResponse: apiGateway.FlushTraceResponse = {
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
        traceId: 'trace-safemsg-closed',
        created: true,
      };
      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockResponse);

      const trace = client.trace({ name: 'test', captureStackTrace: false });
      await trace.create();
      await trace.close();

      trace.addSafeMsgHint('0xmsg', 'ethereum');
      expect(console.warn).toHaveBeenCalledWith('[MiradorTrace] Trace is closed, ignoring addSafeMsgHint');
    });

    it('should return this for chaining', () => {
      const trace = client.trace({ name: 'test', captureStackTrace: false });
      const result = trace.addSafeMsgHint('0xmsg', 'ethereum');
      expect(result).toBe(trace);
    });

    it('should work alongside txHashHints and other builder methods', async () => {
      const mockResponse: apiGateway.FlushTraceResponse = {
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
        traceId: 'trace-safemsg-combined',
        created: true,
      };
      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockResponse);

      await client.trace({ name: 'multisig-op', captureStackTrace: false })
        .addAttribute('safe_address', '0x1234')
        .addTag('multisig')
        .addEvent('proposed', 'token transfer')
        .addTxHint('0xtx123', 'ethereum')
        .addSafeMsgHint('0xmsg123', 'ethereum', 'approval')
        .create();

      const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      expect(calls.data?.txHashHints).toHaveLength(1);
      expect(calls.data?.safeMsgHints).toHaveLength(1);
      expect(calls.data?.safeMsgHints?.[0]?.messageHash).toBe('0xmsg123');
      expect(calls.data?.safeMsgHints?.[0]?.details).toBe('approval');
    });
  });

  describe('addTx', () => {
    it('should extract hash and chain from TransactionLike', async () => {
      const mockResponse: apiGateway.FlushTraceResponse = {
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
        traceId: 'trace-addtx',
        created: true,
      };
      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockResponse);

      await client.trace({ name: 'test', captureStackTrace: false })
        .addTx({ hash: '0xabc', chainId: 1 })
        .create();

      const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      expect(calls.data?.txHashHints?.[0]?.txHash).toBe('0xabc');
      expect(calls.data?.txHashHints?.[0]?.chain).toBe(Chain.CHAIN_ETHEREUM);
    });

    it('should extract input data from tx.data', async () => {
      const mockResponse: apiGateway.FlushTraceResponse = {
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
        traceId: 'trace-addtx-data',
        created: true,
      };
      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockResponse);

      await client.trace({ name: 'test', captureStackTrace: false })
        .addTx({ hash: '0xabc', chainId: 1, data: '0xa9059cbb...' })
        .create();

      const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      const inputEvent = calls.data?.events?.find((e: { name?: string }) => e.name === 'Tx input data');
      expect(inputEvent).toBeDefined();
      expect(inputEvent?.details).toBe('0xa9059cbb...');
    });

    it('should extract input data from tx.input', async () => {
      const mockResponse: apiGateway.FlushTraceResponse = {
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
        traceId: 'trace-addtx-input',
        created: true,
      };
      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockResponse);

      await client.trace({ name: 'test', captureStackTrace: false })
        .addTx({ hash: '0xabc', chainId: 137, input: '0xdeadbeef' })
        .create();

      const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      expect(calls.data?.txHashHints?.[0]?.chain).toBe(Chain.CHAIN_POLYGON);
      const inputEvent = calls.data?.events?.find((e: { name?: string }) => e.name === 'Tx input data');
      expect(inputEvent).toBeDefined();
      expect(inputEvent?.details).toBe('0xdeadbeef');
    });

    it('should accept explicit chain parameter over chainId', async () => {
      const mockResponse: apiGateway.FlushTraceResponse = {
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
        traceId: 'trace-addtx-chain',
        created: true,
      };
      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockResponse);

      await client.trace({ name: 'test', captureStackTrace: false })
        .addTx({ hash: '0xabc', chainId: 1 }, 'polygon')
        .create();

      const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
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
      const mockResponse: apiGateway.FlushTraceResponse = {
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
        traceId: 'trace-sendtx',
        created: true,
      };
      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockResponse);

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
    const mockResponse: apiGateway.FlushTraceResponse = {
      status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
      traceId: 'trace-compat',
      created: true,
    };

    beforeEach(() => {
      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockResponse);
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

      const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      expect(calls.data?.txHashHints?.[0]?.txHash).toBe('0xhash');
      expect(calls.data?.txHashHints?.[0]?.chain).toBe(Chain.CHAIN_ETHEREUM);
      expect(calls.data?.txHashHints?.[0]?.details).toBeUndefined();
    });

    it('should support addTxHint with string details (raw string, not JSON)', async () => {
      await client.trace({ name: 'test', captureStackTrace: false })
        .addTxHint('0xhash', 'ethereum', 'swap tx')
        .create();

      const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      expect(calls.data?.txHashHints?.[0]?.details).toBe('swap tx');
    });

    it('should support addTxHint with undefined options', async () => {
      await client.trace({ name: 'test', captureStackTrace: false })
        .addTxHint('0xhash', 'base', undefined)
        .create();

      const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      expect(calls.data?.txHashHints?.[0]?.txHash).toBe('0xhash');
      expect(calls.data?.txHashHints?.[0]?.chain).toBe(Chain.CHAIN_BASE);
      expect(calls.data?.txHashHints?.[0]?.details).toBeUndefined();
    });

    it('should support addTxInputData', async () => {
      await client.trace({ name: 'test', captureStackTrace: false })
        .addTxInputData('0xabcd')
        .create();

      const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
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

      expect(mockApiGatewayClient.FlushTrace).toHaveBeenCalledTimes(1);
      const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];

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
    const mockResponse: apiGateway.FlushTraceResponse = {
      status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
      traceId: 'trace-provider-cfg',
      created: true,
    };

    let ethProvider: EIP1193Provider;
    let polygonProvider: EIP1193Provider;

    beforeEach(() => {
      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockResponse);
      // FlushTrace is already mocked in beforeEach above. No separate UpdateTrace needed.
      (mockApiGatewayClient as jest.Mocked<apiGateway.IngestGatewayServiceClientImpl>).CloseTrace =
        jest.fn().mockResolvedValue({ accepted: true });

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

      const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
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

      // With auto-flush, events may be split across multiple FlushTrace calls
      const allEvents = [
        ...(mockApiGatewayClient.FlushTrace.mock.calls.flatMap((call: any) => call[0].data?.events ?? [])),
      ];
      const sentEvent = allEvents.find((e) => e.name === 'tx:sent');
      expect(sentEvent).toBeDefined();
      const sentDetails = JSON.parse(sentEvent!.details!);
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

      // With auto-flush, events may be split across multiple FlushTrace calls
      const allEvents = [
        ...(mockApiGatewayClient.FlushTrace.mock.calls.flatMap((call: any) => call[0].data?.events ?? [])),
      ];
      const errorEvent = allEvents.find((e) => e.name === 'tx:error');
      expect(errorEvent).toBeDefined();
      const errorDetails = JSON.parse(errorEvent!.details!);
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

      // With auto-flush, events may be split across multiple FlushTrace calls
      const allEvents = [
        ...(mockApiGatewayClient.FlushTrace.mock.calls.flatMap((call: any) => call[0].data?.events ?? [])),
      ];
      const sendEvents = allEvents.filter((e) => e.name === 'tx:send');
      const sentEvents = allEvents.filter((e) => e.name === 'tx:sent');
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

      const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      const sendEvent = calls.data?.events?.find((e: { name?: string; details?: string }) => e.name === 'tx:send');
      const sendDetails = JSON.parse(sendEvent!.details!);
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

      const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      const sendEvent = calls.data?.events?.find((e: { name?: string; details?: string }) => e.name === 'tx:send');
      const sendDetails = JSON.parse(sendEvent!.details!);
      expect(sendDetails.data).toBeUndefined();
    });
  });

  describe('resumed trace (traceId option)', () => {
    const mockFlushResponse: apiGateway.FlushTraceResponse = {
      status: {
        code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
        errorMessage: undefined,
      },
      traceId: 'trace-xxx',
      created: false,
    };

    const mockKeepAliveResponse: apiGateway.KeepAliveResponse = {
      accepted: true,
    };

    const mockCloseResponse: apiGateway.CloseTraceResponse = {
      accepted: true,
    };

    beforeEach(() => {
      mockApiGatewayClient.FlushTrace =
        jest.fn().mockResolvedValue(mockFlushResponse);
      (mockApiGatewayClient as jest.Mocked<apiGateway.IngestGatewayServiceClientImpl>).KeepAlive =
        jest.fn().mockResolvedValue(mockKeepAliveResponse);
      (mockApiGatewayClient as jest.Mocked<apiGateway.IngestGatewayServiceClientImpl>).CloseTrace =
        jest.fn().mockResolvedValue(mockCloseResponse);
    });

    it('should send FlushTrace when traceId is provided via options', async () => {
      const traceId = await client.trace({ traceId: 'frontend-trace-abc', captureStackTrace: false })
        .addAttribute('endpoint', '/api/swap')
        .addTag('backend')
        .create();

      expect(traceId).toBe('frontend-trace-abc');
      expect(mockApiGatewayClient.FlushTrace).toHaveBeenCalledTimes(1);
    });

    it('should include attributes in the FlushTrace request', async () => {
      await client.trace({ traceId: 'trace-attrs', captureStackTrace: false })
        .addAttribute('user', '0xabc')
        .addAttribute('slippage', 25)
        .addAttributes({ env: 'production', region: 'us-east' })
        .create();

      const flushCall = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      expect(flushCall.traceId).toBe('trace-attrs');
      expect(flushCall.data?.attributes?.[0]?.attributes).toEqual({
        user: '0xabc',
        slippage: '25',
        env: 'production',
        region: 'us-east',
      });
    });

    it('should include tags in the FlushTrace request', async () => {
      await client.trace({ traceId: 'trace-tags', captureStackTrace: false })
        .addTag('backend')
        .addTags(['api', 'swap'])
        .create();

      const flushCall = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      expect(flushCall.data?.tags?.[0]?.tags).toEqual(['backend', 'api', 'swap']);
    });

    it('should include events in the FlushTrace request', async () => {
      await client.trace({ traceId: 'trace-events', captureStackTrace: false })
        .addEvent('backend:received', 'request received')
        .addEvent('backend:processed', { duration: 150 })
        .create();

      const flushCall = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      expect(flushCall.data?.events).toHaveLength(2);
      expect(flushCall.data?.events?.[0]?.name).toBe('backend:received');
      expect(flushCall.data?.events?.[0]?.details).toBe('request received');
      expect(flushCall.data?.events?.[1]?.name).toBe('backend:processed');
      expect(JSON.parse(flushCall.data?.events?.[1]?.details!)).toEqual({ duration: 150 });
    });

    it('should include txHashHints in the FlushTrace request', async () => {
      await client.trace({ traceId: 'trace-tx', captureStackTrace: false })
        .addTxHint('0xhash123', 'ethereum', 'swap tx')
        .create();

      const flushCall = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      expect(flushCall.data?.txHashHints).toHaveLength(1);
      expect(flushCall.data?.txHashHints?.[0]?.txHash).toBe('0xhash123');
      expect(flushCall.data?.txHashHints?.[0]?.chain).toBe(Chain.CHAIN_ETHEREUM);
      expect(flushCall.data?.txHashHints?.[0]?.details).toBe('swap tx');
    });

    it('should include all data types in a complex resumed trace', async () => {
      await client.trace({ traceId: 'trace-complex', captureStackTrace: false })
        .addAttribute('user', '0xabc')
        .addTag('dex')
        .addEvent('started', 'swap initiated')
        .addTxHint('0xhash', 'polygon')
        .addTxInputData('0xa9059cbb')
        .create();

      expect(mockApiGatewayClient.FlushTrace).toHaveBeenCalledTimes(1);
      const flushCall = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      expect(flushCall.traceId).toBe('trace-complex');
      expect(flushCall.data?.attributes?.[0]?.attributes).toEqual({ user: '0xabc' });
      expect(flushCall.data?.tags?.[0]?.tags).toEqual(['dex']);
      expect(flushCall.data?.events?.map((e: { name?: string }) => e.name)).toContain('started');
      expect(flushCall.data?.events?.map((e: { name?: string }) => e.name)).toContain('Tx input data');
      expect(flushCall.data?.txHashHints?.[0]?.chain).toBe(Chain.CHAIN_POLYGON);
    });

    it('should start keep-alive after successful resumed create()', async () => {
      const trace = client.trace({ traceId: 'trace-keepalive', captureStackTrace: false });
      await trace.create();

      // Wait for keep-alive interval to fire
      jest.useFakeTimers();
      // Re-create with fake timers active
      jest.useRealTimers();

      // Verify trace is not closed and has the right ID
      expect(trace.getTraceId()).toBe('trace-keepalive');
      expect(trace.isClosed()).toBe(false);

      // Clean up
      await trace.close();
    });

    it('should return the pre-set traceId from getTraceId() before create()', () => {
      const trace = client.trace({ traceId: 'pre-set-id', captureStackTrace: false });
      expect(trace.getTraceId()).toBe('pre-set-id');
    });

    it('should always return a string from getTraceId() immediately', () => {
      const trace = client.trace({ captureStackTrace: false });
      const traceId = trace.getTraceId();
      expect(typeof traceId).toBe('string');
      expect(traceId.length).toBe(32); // W3C trace ID is 32 hex chars
    });

    it('should return undefined when FlushTrace fails', async () => {
      mockApiGatewayClient.FlushTrace =
        jest.fn().mockRejectedValue(new Error('Network error'));

      const traceId = await client.trace({
        traceId: 'fail-trace',
        captureStackTrace: false,
        maxRetries: 0,
      }).create();

      expect(traceId).toBeUndefined();
      expect(mockConsoleError).toHaveBeenCalledWith(
        '[MiradorTrace] FlushTrace error after retries:',
        expect.any(Error)
      );
    });

    it('should retry FlushTrace on failure for resumed traces', async () => {
      const flushMock = jest.fn()
        .mockRejectedValueOnce(new Error('Transient error'))
        .mockResolvedValueOnce(mockFlushResponse);

      mockApiGatewayClient.FlushTrace = flushMock;

      const traceId = await client.trace({
        traceId: 'retry-trace',
        captureStackTrace: false,
        maxRetries: 1,
        retryBackoff: 1, // 1ms for fast tests
      }).create();

      expect(traceId).toBe('retry-trace');
      expect(flushMock).toHaveBeenCalledTimes(2);
    });

    it('should close a resumed trace correctly', async () => {
      const trace = client.trace({ traceId: 'close-test', captureStackTrace: false });
      await trace.create();
      await trace.close('done');

      expect(trace.isClosed()).toBe(true);
      expect((mockApiGatewayClient as jest.Mocked<apiGateway.IngestGatewayServiceClientImpl>).CloseTrace).toHaveBeenCalledWith(
        expect.objectContaining({ traceId: 'close-test', text: 'done' })
      );
    });

    it('should return undefined when create() is called on a closed resumed trace', async () => {
      const trace = client.trace({ traceId: 'closed-resumed', captureStackTrace: false });
      await trace.close();

      const result = await trace.create();
      expect(result).toBeUndefined();
      expect(mockConsoleWarn).toHaveBeenCalledWith('[MiradorTrace] Trace is closed, cannot create');
    });

    it('should send empty data arrays when no data is added to resumed trace', async () => {
      await client.trace({ traceId: 'empty-data', captureStackTrace: false }).create();

      const flushCall = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      expect(flushCall.traceId).toBe('empty-data');
      expect(flushCall.data?.attributes).toEqual([]);
      expect(flushCall.data?.tags).toEqual([]);
      expect(flushCall.data?.events).toEqual([]);
      expect(flushCall.data?.txHashHints).toEqual([]);
    });

    it('should include sendClientTimestamp in the FlushTrace request', async () => {
      const before = new Date();
      await client.trace({ traceId: 'timestamp-test', captureStackTrace: false }).create();
      const after = new Date();

      const flushCall = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      expect(flushCall.sendClientTimestamp).toBeDefined();
      expect(flushCall.sendClientTimestamp!.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(flushCall.sendClientTimestamp!.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('standard trace (auto-generated traceId)', () => {
    const mockFlushResponse: apiGateway.FlushTraceResponse = {
      status: {
        code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
        errorMessage: undefined,
      },
      traceId: 'trace-xxx',
      created: true,
    };

    const mockKeepAliveResponse: apiGateway.KeepAliveResponse = {
      accepted: true,
    };

    const mockCloseResponse: apiGateway.CloseTraceResponse = {
      accepted: true,
    };

    beforeEach(() => {
      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockFlushResponse);
      (mockApiGatewayClient as jest.Mocked<apiGateway.IngestGatewayServiceClientImpl>).KeepAlive =
        jest.fn().mockResolvedValue(mockKeepAliveResponse);
      (mockApiGatewayClient as jest.Mocked<apiGateway.IngestGatewayServiceClientImpl>).CloseTrace =
        jest.fn().mockResolvedValue(mockCloseResponse);
    });

    it('should send FlushTrace when no traceId is provided', async () => {
      const trace = client.trace({ name: 'standard', captureStackTrace: false })
        .addAttribute('key', 'value');
      const traceId = await trace.create();

      // Trace ID is auto-generated upfront, so it should be the one the trace already has
      expect(traceId).toBe(trace.getTraceId());
      expect(mockApiGatewayClient.FlushTrace).toHaveBeenCalledTimes(1);
    });

    it('should send FlushTrace when traceId option is undefined', async () => {
      const trace = client.trace({ name: 'explicit-undefined', traceId: undefined, captureStackTrace: false });
      const traceId = await trace.create();

      // Auto-generated trace ID
      expect(typeof traceId).toBe('string');
      expect(traceId!.length).toBe(32); // W3C trace ID is 32 hex chars
      expect(mockApiGatewayClient.FlushTrace).toHaveBeenCalledTimes(1);
    });

    it('should have auto-generated traceId immediately (never null)', () => {
      const trace = client.trace({ captureStackTrace: false });
      const traceId = trace.getTraceId();
      expect(typeof traceId).toBe('string');
      expect(traceId.length).toBe(32);
    });

    it('should include name in FlushTrace request', async () => {
      await client.trace({ name: 'my-trace', captureStackTrace: false }).create();

      const flushCall = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      expect(flushCall.name).toBe('my-trace');
    });

    it('should include all data in FlushTrace request', async () => {
      await client.trace({ name: 'full-trace', captureStackTrace: false })
        .addAttribute('user', '0xabc')
        .addTag('dex')
        .addEvent('started', 'details')
        .addTxHint('0xhash', 'ethereum')
        .create();

      const flushCall = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      expect(flushCall.data?.attributes?.[0]?.attributes).toEqual({ user: '0xabc' });
      expect(flushCall.data?.tags?.[0]?.tags).toEqual(['dex']);
      expect(flushCall.data?.events?.[0]?.name).toBe('started');
      expect(flushCall.data?.txHashHints?.[0]?.txHash).toBe('0xhash');
    });

    it('should close a standard trace correctly', async () => {
      const trace = client.trace({ captureStackTrace: false });
      const traceId = trace.getTraceId();
      await trace.create();
      await trace.close('finished');

      expect(trace.isClosed()).toBe(true);
      expect((mockApiGatewayClient as jest.Mocked<apiGateway.IngestGatewayServiceClientImpl>).CloseTrace).toHaveBeenCalledWith(
        expect.objectContaining({ traceId, text: 'finished' })
      );
    });
  });

  describe('zombie keepalive scenario (customer-reported)', () => {
    /**
     * Customer scenario: Frontend creates a trace and owns it. Backend grabs
     * the frontend's traceId (e.g., via HTTP header) just to tag an event.
     * Previously, the backend's flush() would start a keepalive timer that
     * could never be stopped without calling close() — but close() is wrong
     * because the frontend owns the trace. This caused "zombie keepalive"
     * timers that ran indefinitely.
     *
     * The fix: when resuming a trace via traceId, keepalive defaults to false.
     */

    beforeEach(() => jest.useFakeTimers());
    afterEach(() => {
      jest.clearAllTimers();
      jest.useRealTimers();
    });

    it('backend fire-and-forget update sends data but does not start keepalive', async () => {
      // Simulate backend grabbing a frontend traceId to tag a single event
      const backendTrace = client.trace({
        traceId: 'frontend-trace-abc',
        captureStackTrace: false,
      });

      backendTrace.addEvent('risk:check', 'score=0.3');
      backendTrace.flush();
      await jest.advanceTimersByTimeAsync(0);

      // Verify the update was sent
      expect(mockApiGatewayClient.FlushTrace).toHaveBeenCalledTimes(1);
      const request = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      expect(request.traceId).toBe('frontend-trace-abc');

      // Let 60 seconds pass — no zombie keepalive should fire
      mockApiGatewayClient.KeepAlive.mockClear();
      await jest.advanceTimersByTimeAsync(60000);
      expect(mockApiGatewayClient.KeepAlive).not.toHaveBeenCalled();

      // The trace can be garbage collected — no close() needed
      // (no timers holding a reference)
      expect(backendTrace.isClosed()).toBe(false);
    });

    it('backend fire-and-forget does not require close() to avoid zombie timers', async () => {
      // The core customer complaint: after flush(), there was no way to clean
      // up without close(), but close() was wrong because they didn't own the trace.
      const backendTrace = client.trace({
        traceId: 'frontend-trace-xyz',
        captureStackTrace: false,
      });

      // Multiple fire-and-forget updates (e.g., enriching from different services)
      backendTrace.addAttribute('risk.score', '0.3');
      backendTrace.flush();
      await jest.advanceTimersByTimeAsync(0);

      backendTrace.addEvent('compliance:checked');
      backendTrace.flush();
      await jest.advanceTimersByTimeAsync(0);

      backendTrace.addTag('enriched');
      backendTrace.flush();
      await jest.advanceTimersByTimeAsync(0);

      // Three updates sent, zero keepalives
      expect(mockApiGatewayClient.FlushTrace).toHaveBeenCalledTimes(3);
      expect(mockApiGatewayClient.KeepAlive).not.toHaveBeenCalled();

      // Wait a long time — still no keepalive
      await jest.advanceTimersByTimeAsync(120000);
      expect(mockApiGatewayClient.KeepAlive).not.toHaveBeenCalled();

      // close() was never called — trace is not closed
      expect(backendTrace.isClosed()).toBe(false);
    });

    it('owner trace keeps keepalive running while non-owner does not', async () => {
      // Owner creates the trace (auto-generated ID)
      const ownerTrace = client.trace({ name: 'UserSwap', captureStackTrace: false });
      const ownerTraceId = ownerTrace.getTraceId();
      ownerTrace.addAttribute('wallet', '0xabc');
      ownerTrace.flush();
      await jest.advanceTimersByTimeAsync(15000);

      // Owner should have keepalive running
      expect(mockApiGatewayClient.KeepAlive).toHaveBeenCalled();

      // Non-owner resumes the same trace using the owner's traceId
      const nonOwnerTrace = client.trace({
        traceId: ownerTraceId,
        captureStackTrace: false,
      });
      nonOwnerTrace.addEvent('backend:enriched');
      nonOwnerTrace.flush();

      // Advance time — only the owner's keepalive should fire more
      mockApiGatewayClient.KeepAlive.mockClear();
      await jest.advanceTimersByTimeAsync(30000);

      // All keepalive calls should be from the owner (traceId matches)
      for (const call of mockApiGatewayClient.KeepAlive.mock.calls) {
        expect(call[0].traceId).toBe(ownerTraceId);
      }
      // Owner keepalive is still ticking
      expect(mockApiGatewayClient.KeepAlive.mock.calls.length).toBeGreaterThan(0);
    });

    it('backend can opt into keepalive with autoKeepAlive: true if it takes ownership', async () => {
      const backendTrace = client.trace({
        traceId: 'frontend-trace-abc',
        autoKeepAlive: true,
        captureStackTrace: false,
      });

      backendTrace.addEvent('ownership:transferred');
      backendTrace.flush();
      await jest.advanceTimersByTimeAsync(15000);

      expect(mockApiGatewayClient.KeepAlive).toHaveBeenCalled();

      // Backend can cleanly close when done
      await backendTrace.close('backend done');
      mockApiGatewayClient.KeepAlive.mockClear();
      await jest.advanceTimersByTimeAsync(15000);
      expect(mockApiGatewayClient.KeepAlive).not.toHaveBeenCalled();
    });
  });

  describe('autoKeepAlive option', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => {
      jest.clearAllTimers();
      jest.useRealTimers();
    });

    it('should NOT start keep-alive when traceId is provided (default behavior)', async () => {
      const trace = client.trace({ traceId: 'external-id', captureStackTrace: false });
      trace.addAttribute('key', 'value');
      trace.flush();

      await jest.advanceTimersByTimeAsync(15000);

      expect(mockApiGatewayClient.KeepAlive).not.toHaveBeenCalled();
    });

    it('should start keep-alive for new traces (default behavior)', async () => {
      mockApiGatewayClient.FlushTrace.mockResolvedValue({
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
        traceId: 'new-trace-id',
        created: true,
      });

      const trace = client.trace({ captureStackTrace: false });
      trace.addAttribute('key', 'value');
      trace.flush();

      await jest.advanceTimersByTimeAsync(15000);

      expect(mockApiGatewayClient.KeepAlive).toHaveBeenCalled();
    });

    it('should start keep-alive when autoKeepAlive: true overrides traceId default', async () => {
      const trace = client.trace({ traceId: 'external-id', autoKeepAlive: true, captureStackTrace: false });
      trace.addAttribute('key', 'value');
      trace.flush();

      await jest.advanceTimersByTimeAsync(15000);

      expect(mockApiGatewayClient.KeepAlive).toHaveBeenCalled();
    });

    it('should NOT start keep-alive when autoKeepAlive: false suppresses it for new trace', async () => {
      mockApiGatewayClient.FlushTrace.mockResolvedValue({
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
        traceId: 'new-trace-id',
        created: true,
      });

      const trace = client.trace({ autoKeepAlive: false, captureStackTrace: false });
      trace.addAttribute('key', 'value');
      trace.flush();

      await jest.advanceTimersByTimeAsync(15000);

      expect(mockApiGatewayClient.KeepAlive).not.toHaveBeenCalled();
    });

    it('should allow manual startKeepAlive() on a resumed trace', async () => {
      const trace = client.trace({ traceId: 'external-id', captureStackTrace: false });
      trace.addAttribute('key', 'value');
      trace.flush();
      await jest.advanceTimersByTimeAsync(0);

      expect(mockApiGatewayClient.KeepAlive).not.toHaveBeenCalled();

      trace.startKeepAlive();
      await jest.advanceTimersByTimeAsync(15000);

      expect(mockApiGatewayClient.KeepAlive).toHaveBeenCalled();
    });

    it('should allow manual stopKeepAlive() on a new trace', async () => {
      mockApiGatewayClient.FlushTrace.mockResolvedValue({
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
        traceId: 'new-trace-id',
        created: true,
      });

      const trace = client.trace({ captureStackTrace: false });
      trace.addAttribute('key', 'value');
      trace.flush();
      await jest.advanceTimersByTimeAsync(0);

      trace.stopKeepAlive();
      mockApiGatewayClient.KeepAlive.mockClear();

      await jest.advanceTimersByTimeAsync(15000);

      expect(mockApiGatewayClient.KeepAlive).not.toHaveBeenCalled();
    });
  });

  describe('flush()', () => {
    const flushMicrotasks = () => new Promise<void>(resolve => queueMicrotask(resolve));
    const flushPromises = () => new Promise<void>(resolve => setTimeout(resolve, 0));

    it('should auto-flush via microtask when builder methods are called', async () => {
      const mockResponse: apiGateway.FlushTraceResponse = {
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
        traceId: 'auto-flush-id',
        created: true,
      };
      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockResponse);

      client.trace({ name: 'auto-flush', captureStackTrace: false })
        .addAttribute('key', 'value');

      // Not flushed yet (microtask hasn't run)
      expect(mockApiGatewayClient.FlushTrace).not.toHaveBeenCalled();

      // Flush the microtask + promise queues
      await flushMicrotasks();
      await flushPromises();

      expect(mockApiGatewayClient.FlushTrace).toHaveBeenCalledTimes(1);
      const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      expect(calls.data?.attributes?.[0]?.attributes).toEqual({ key: 'value' });
    });

    it('should batch multiple builder calls in the same tick into a single flush', async () => {
      const mockResponse: apiGateway.FlushTraceResponse = {
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
        traceId: 'batch-flush-id',
        created: true,
      };
      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockResponse);

      client.trace({ name: 'batch', captureStackTrace: false })
        .addAttribute('a', '1')
        .addAttribute('b', '2')
        .addTag('tag1')
        .addEvent('evt1');

      await flushMicrotasks();
      await flushPromises();

      // All data should be in a single FlushTrace call
      expect(mockApiGatewayClient.FlushTrace).toHaveBeenCalledTimes(1);
      const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      expect(calls.data?.attributes?.[0]?.attributes).toEqual({ a: '1', b: '2' });
      expect(calls.data?.tags?.[0]?.tags).toEqual(['tag1']);
      expect(calls.data?.events).toHaveLength(1);
    });

    it('should send FlushTrace on subsequent flushes after trace is first flushed', async () => {
      const mockFlushResponse: apiGateway.FlushTraceResponse = {
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
        traceId: 'update-flush-id',
        created: true,
      };
      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockFlushResponse);

      const trace = client.trace({ name: 'update-test', captureStackTrace: false });
      trace.addAttribute('initial', 'data');

      // First flush
      await flushMicrotasks();
      await flushPromises();
      expect(mockApiGatewayClient.FlushTrace).toHaveBeenCalledTimes(1);

      // Add more data → should trigger another FlushTrace
      trace.addEvent('step2');
      await flushMicrotasks();
      await flushPromises();

      expect(mockApiGatewayClient.FlushTrace).toHaveBeenCalledTimes(2);
      const secondCall = mockApiGatewayClient.FlushTrace.mock.calls[1][0];
      expect(secondCall.data?.events).toHaveLength(1);
      expect(secondCall.data?.events?.[0]?.name).toBe('step2');
    });

    it('should clear pending data after flush so subsequent flushes do not re-send', async () => {
      const mockFlushResponse: apiGateway.FlushTraceResponse = {
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
        traceId: 'clear-pending-id',
        created: true,
      };
      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockFlushResponse);

      const trace = client.trace({ name: 'clear-test', captureStackTrace: false });
      trace.addAttribute('first', 'value');

      await flushMicrotasks();
      await flushPromises();

      // Second flush with new data only
      trace.addAttribute('second', 'value');
      await flushMicrotasks();
      await flushPromises();

      expect(mockApiGatewayClient.FlushTrace).toHaveBeenCalledTimes(2);
      const secondCall = mockApiGatewayClient.FlushTrace.mock.calls[1][0];
      // Should only have 'second', not 'first'
      expect(secondCall.data?.attributes?.[0]?.attributes).toEqual({ second: 'value' });
    });

    it('should ignore flush on a closed trace', async () => {
      const mockCreateResponse: apiGateway.FlushTraceResponse = {
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
        traceId: 'closed-flush-id',
        created: true,
      };
      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockCreateResponse);
      (mockApiGatewayClient as jest.Mocked<apiGateway.IngestGatewayServiceClientImpl>).CloseTrace = jest.fn().mockResolvedValue({ accepted: true });

      const trace = client.trace({ name: 'close-test', captureStackTrace: false });
      await trace.create();
      await trace.close();

      mockApiGatewayClient.FlushTrace.mockClear();
      trace.flush();

      await flushMicrotasks();
      await flushPromises();

      expect(mockApiGatewayClient.FlushTrace).not.toHaveBeenCalled();
      expect(mockConsoleWarn).toHaveBeenCalledWith('[MiradorTrace] Trace is closed. Ignoring flush call.');
    });

    it('should return void from flush (fire-and-forget)', () => {
      const trace = client.trace({ name: 'void-flush', captureStackTrace: false });
      trace.addAttribute('key', 'value');
      const result = trace.flush();
      expect(result).toBeUndefined();
    });

    it('create() should remain backward compatible by calling flush and awaiting', async () => {
      const mockResponse: apiGateway.FlushTraceResponse = {
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
        traceId: 'create-compat-id',
        created: true,
      };
      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockResponse);

      const trace = client.trace({ name: 'compat', captureStackTrace: false })
        .addAttribute('user', 'alice');
      const traceId = await trace.create();

      expect(traceId).toBe(trace.getTraceId());
      expect(mockApiGatewayClient.FlushTrace).toHaveBeenCalledTimes(1);
    });

    it('close() should drain flush queue before sending CloseTrace', async () => {
      const mockFlushResponse: apiGateway.FlushTraceResponse = {
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
        traceId: 'drain-close-id',
        created: true,
      };
      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockFlushResponse);
      (mockApiGatewayClient as jest.Mocked<apiGateway.IngestGatewayServiceClientImpl>).CloseTrace = jest.fn().mockResolvedValue({ accepted: true });

      const trace = client.trace({ name: 'drain-test', captureStackTrace: false });
      trace.addAttribute('key', 'value');
      // flush is auto-scheduled but not yet executed

      // close() should await the pending flush before sending CloseTrace
      await trace.close('done');

      // FlushTrace should have been called (flush drained)
      expect(mockApiGatewayClient.FlushTrace).toHaveBeenCalledTimes(1);
      // CloseTrace should have been called after, using the trace's auto-generated ID
      expect((mockApiGatewayClient as jest.Mocked<apiGateway.IngestGatewayServiceClientImpl>).CloseTrace).toHaveBeenCalledWith(
        expect.objectContaining({ traceId: trace.getTraceId(), text: 'done' })
      );
    });

    it('should include stack trace attributes only on first flush', async () => {
      const mockFlushResponse: apiGateway.FlushTraceResponse = {
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
        traceId: 'stack-first-flush-id',
        created: true,
      };
      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockFlushResponse);

      const trace = client.trace({ name: 'stack-test', captureStackTrace: true });
      trace.addTag('first');

      await flushMicrotasks();
      await flushPromises();

      // First flush should have source.* attributes
      const firstCall = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      const attrs = firstCall.data?.attributes?.[0]?.attributes;
      expect(attrs?.['source.stack_trace']).toBeDefined();

      // Second flush should NOT have source.* attributes
      trace.addTag('second');
      await flushMicrotasks();
      await flushPromises();

      expect(mockApiGatewayClient.FlushTrace).toHaveBeenCalledTimes(2);
      const secondCall = mockApiGatewayClient.FlushTrace.mock.calls[1][0];
      expect(secondCall.data?.attributes).toEqual([]);
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
      FlushTrace: jest.fn().mockResolvedValue({
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
        traceId: 'trace-provider-123',
        created: true,
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
    // Should not trigger FlushTrace since it's a pass-through
    expect(mockApiGatewayClient.FlushTrace).not.toHaveBeenCalled();
  });

  it('should NOT intercept eth_getBalance', async () => {
    const provider = new MiradorProvider(mockUnderlying, mockClient);
    const result = await provider.request({ method: 'eth_getBalance', params: ['0xaddr', 'latest'] });
    expect(result).toBeNull();
    expect(mockUnderlying.request).toHaveBeenCalledWith({ method: 'eth_getBalance', params: ['0xaddr', 'latest'] });
    expect(mockApiGatewayClient.FlushTrace).not.toHaveBeenCalled();
  });

  it('should NOT intercept eth_estimateGas', async () => {
    const provider = new MiradorProvider(mockUnderlying, mockClient);
    const result = await provider.request({ method: 'eth_estimateGas', params: [{ from: '0x1', to: '0x2' }] });
    expect(result).toBeNull();
    expect(mockUnderlying.request).toHaveBeenCalledWith({ method: 'eth_estimateGas', params: [{ from: '0x1', to: '0x2' }] });
    expect(mockApiGatewayClient.FlushTrace).not.toHaveBeenCalled();
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
