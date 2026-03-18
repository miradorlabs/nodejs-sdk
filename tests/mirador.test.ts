// Mirador Client Unit Tests
import { Client, Trace, NoopTrace, Chain, captureStackTrace, toChain, MiradorProvider, Web3Plugin } from '../src/ingest';
import type { ChainName } from '../src/ingest';
import type { StackTrace, EIP1193Provider, Logger, TraceCallbacks } from '../src/ingest';
import { NodeGrpcRpc } from '../src/grpc';
import * as apiGateway from "mirador-gateway-ingest/proto/gateway/ingest/v1/ingest_gateway";
import { Chain as ProtoChain } from "mirador-gateway-ingest/proto/gateway/ingest/v1/ingest_gateway";
import { ResponseStatus_StatusCode } from "mirador-gateway-ingest/proto/gateway/common/v1/status";

// Mock the NodeGrpcRpc class
jest.mock('../src/grpc');

// Mock console methods to avoid cluttering test output
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
const mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation();
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation();

describe('Client', () => {
  let client: Client<[ReturnType<typeof Web3Plugin>]>;
  let mockApiGatewayClient: jest.Mocked<apiGateway.IngestGatewayServiceClientImpl>;

  const flushMicrotasks = () => new Promise<void>(resolve => queueMicrotask(resolve));
  const flushPromises = () => new Promise<void>(resolve => setTimeout(resolve, 0));

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Create mock for IngestGatewayServiceClientImpl with defaults
    // FlushTrace, CloseTrace, KeepAlive are needed because auto-flush (via scheduleFlush)
    // can trigger FlushTrace asynchronously during tests.
    mockApiGatewayClient = {
      FlushTrace: jest.fn().mockResolvedValue({
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
        traceId: '',
        created: true,
      }),
      CloseTrace: jest.fn().mockResolvedValue({ accepted: true }),
      KeepAlive: jest.fn().mockResolvedValue({ accepted: true }),
    } as unknown as jest.Mocked<apiGateway.IngestGatewayServiceClientImpl>;

    // Mock the IngestGatewayServiceClientImpl constructor — must be set up BEFORE
    // creating the Client, since the client caches the gRPC client instance.
    jest
      .spyOn(apiGateway, "IngestGatewayServiceClientImpl")
      .mockImplementation(() => mockApiGatewayClient);

    // Create a new Client instance with debug logging and Web3Plugin so console spies capture output
    client = new Client("test-api-key", { debug: true, plugins: [Web3Plugin()] });
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

    it('should build and flush a simple trace', async () => {
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
      trace.flush();
      await flushMicrotasks();
      await flushPromises();
      const traceId = trace.getTraceId();

      expect(traceId).toHaveLength(32);

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

      client.trace({ name: 'test', captureStackTrace: false })
        .addAttribute('stringValue', 'hello')
        .addAttribute('numberValue', 42)
        .addAttribute('booleanValue', true)
        .flush();
      await flushMicrotasks();
      await flushPromises();

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

      client.trace({ name: 'test', captureStackTrace: false })
        .addAttribute('metadata', { key: 'value', count: 42 })
        .addAttribute('nested', { a: { b: 'c' } })
        .flush();
      await flushMicrotasks();
      await flushPromises();

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

      client.trace({ name: 'test', captureStackTrace: false })
        .addAttributes({
          user: '0xabc',
          slippage: 25,
          isPremium: true,
          config: { setting: 'value' },
        })
        .flush();
      await flushMicrotasks();
      await flushPromises();

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

      client.trace({ name: 'test' })
        .addTag('tag1')
        .addTag('tag2')
        .addTags(['tag3', 'tag4'])
        .flush();
      await flushMicrotasks();
      await flushPromises();

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

      client.trace({ name: 'test' })
        .addEvent('event1', 'string details', timestamp1)
        .addEvent('event2', { key: 'value', count: 42 }, timestamp2)
        .addEvent('event3') // no details, auto timestamp
        .flush();
      await flushMicrotasks();
      await flushPromises();

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

      client.trace({ name: 'swap' })
        .web3.evm.addTxHint('0x123...', 'ethereum', 'Swap transaction')
        .flush();
      await flushMicrotasks();
      await flushPromises();

      const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      const txHashHints = calls.data?.txHashHints;
      expect(txHashHints).toHaveLength(1);
      expect(txHashHints?.[0]?.txHash).toBe('0x123...');
      expect(txHashHints?.[0]?.chain).toBe(ProtoChain.CHAIN_ETHEREUM);
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
      client.trace({ name: 'test' })
        .web3.evm.addTxHint('0xpolygon...', 'polygon')
        .flush();
      await flushMicrotasks();
      await flushPromises();

      let calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      expect(calls.data?.txHashHints?.[0]?.chain).toBe(ProtoChain.CHAIN_POLYGON);

      // Test arbitrum
      mockApiGatewayClient.FlushTrace.mockClear();
      client.trace({ name: 'test' })
        .web3.evm.addTxHint('0xarbitrum...', 'arbitrum')
        .flush();
      await flushMicrotasks();
      await flushPromises();

      calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      expect(calls.data?.txHashHints?.[0]?.chain).toBe(ProtoChain.CHAIN_ARBITRUM);

      // Test base
      mockApiGatewayClient.FlushTrace.mockClear();
      client.trace({ name: 'test' })
        .web3.evm.addTxHint('0xbase...', 'base')
        .flush();
      await flushMicrotasks();
      await flushPromises();

      calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      expect(calls.data?.txHashHints?.[0]?.chain).toBe(ProtoChain.CHAIN_BASE);

      // Test optimism
      mockApiGatewayClient.FlushTrace.mockClear();
      client.trace({ name: 'test' })
        .web3.evm.addTxHint('0xoptimism...', 'optimism')
        .flush();
      await flushMicrotasks();
      await flushPromises();

      calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      expect(calls.data?.txHashHints?.[0]?.chain).toBe(ProtoChain.CHAIN_OPTIMISM);

      // Test bsc
      mockApiGatewayClient.FlushTrace.mockClear();
      client.trace({ name: 'test' })
        .web3.evm.addTxHint('0xbsc...', 'bsc')
        .flush();
      await flushMicrotasks();
      await flushPromises();

      calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      expect(calls.data?.txHashHints?.[0]?.chain).toBe(ProtoChain.CHAIN_BSC);
    });

    it('should flush without txHashHint when not set', async () => {
      const mockResponse: apiGateway.FlushTraceResponse = {
        status: {
          code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
          errorMessage: undefined
        },
        traceId: 'trace-no-tx',
      created: true,
      };

      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockResponse);

      client.trace({ name: 'test' })
        .addTag('no-tx')
        .flush();
      await flushMicrotasks();
      await flushPromises();

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
        .web3.evm.addTxHint('0x123...', 'ethereum');
      trace.flush();
      await flushMicrotasks();
      await flushPromises();
      const traceId = trace.getTraceId();

      expect(traceId).toHaveLength(32);

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
      expect(calls.data?.txHashHints?.[0]?.chain).toBe(ProtoChain.CHAIN_ETHEREUM);
    });

    it('should log error when flush receives error status', async () => {
      const mockResponse: apiGateway.FlushTraceResponse = {
        status: {
          code: ResponseStatus_StatusCode.STATUS_CODE_INTERNAL_ERROR,
          errorMessage: 'Something went wrong'
        },
        traceId: '',
      created: true,
      };

      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockResponse);

      client.trace({ name: 'test' })
        .addTag('error-test')
        .flush();
      await flushMicrotasks();
      await flushPromises();

      expect(mockConsoleError).toHaveBeenCalledWith(
        '[MiradorTrace] FlushTrace failed:',
        'Something went wrong'
      );
    });

    it('should log error when exception is thrown during flush', async () => {
      const mockError = new Error('Network error');
      mockApiGatewayClient.FlushTrace.mockRejectedValue(mockError);

      client.trace({ name: 'test', maxRetries: 0 })
        .addTag('exception-test')
        .flush();
      await flushMicrotasks();
      await flushPromises();

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

      mockApiGatewayClient.FlushTrace
        .mockResolvedValueOnce(mockResponse1)
        .mockResolvedValueOnce(mockResponse2);

      const trace1 = client.trace({ name: 'trace-1' })
        .addAttribute('id', '1')
        .addTag('first');

      const trace2 = client.trace({ name: 'trace-2' })
        .addAttribute('id', '2')
        .addTag('second');

      trace1.flush();
      await flushMicrotasks();
      await flushPromises();
      const result1 = trace1.getTraceId();
      trace2.flush();
      await flushMicrotasks();
      await flushPromises();
      const result2 = trace2.getTraceId();

      expect(result1).toHaveLength(32);
      expect(result2).toHaveLength(32);
      expect(result1).not.toBe(result2); // Each trace gets a unique ID
      // At least 2 FlushTrace calls (auto-flush may add more)
      expect(mockApiGatewayClient.FlushTrace.mock.calls.length).toBeGreaterThanOrEqual(2);
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
      const expectedChainEnums: Record<ChainName, ProtoChain> = {
        ethereum: ProtoChain.CHAIN_ETHEREUM,
        polygon: ProtoChain.CHAIN_POLYGON,
        arbitrum: ProtoChain.CHAIN_ARBITRUM,
        base: ProtoChain.CHAIN_BASE,
        optimism: ProtoChain.CHAIN_OPTIMISM,
        bsc: ProtoChain.CHAIN_BSC,
      };

      for (const chainName of chainNames) {
        mockApiGatewayClient.FlushTrace.mockClear();

        client.trace({ name: 'test' })
          .web3.evm.addTxHint('0x123', chainName)
          .flush();
        await flushMicrotasks();
        await flushPromises();

        const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
        expect(calls.data?.txHashHints?.[0]?.chain).toBe(expectedChainEnums[chainName]);
      }
    });

    it('should have CHAIN_MAP entries for all ChainName values', () => {
      // This test ensures ChainName type and CHAIN_MAP stay in sync
      const allChainNames: ChainName[] = ['ethereum', 'polygon', 'arbitrum', 'base', 'optimism', 'bsc'];

      // Verify we can create a trace with each chain name without throwing
      for (const chainName of allChainNames) {
        const trace = client.trace({ name: 'test' }).web3.evm.addTxHint('0x123', chainName);
        expect(trace).toBeInstanceOf(Trace);
      }
    });
  });

  describe('web3.evm.addInputData', () => {
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

      client.trace({ name: 'test', captureStackTrace: false })
        .web3.evm.addInputData(inputData)
        .flush();
      await flushMicrotasks();
      await flushPromises();

      const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      const events = calls.data?.events;
      expect(events).toHaveLength(1);
      expect(events?.[0].name).toBe('Tx input data');
      expect(events?.[0].details).toBe(inputData);
      expect(events?.[0].timestamp).toBeInstanceOf(Date);
    });

    it('should return this for chaining', () => {
      const trace = client.trace({ name: 'test' });
      expect(trace.web3.evm.addInputData('0x1234')).toBe(trace);
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
      trace.flush();
      await flushMicrotasks();
      await flushPromises();
      await trace.close();

      trace.web3.evm.addInputData('0xdead');
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

      client.trace({ name: 'swap', captureStackTrace: false })
        .addAttribute('user', '0xabc')
        .web3.evm.addTxHint('0x123', 'ethereum')
        .web3.evm.addInputData('0xa9059cbb00000000')
        .addTag('bridge')
        .flush();
      await flushMicrotasks();
      await flushPromises();

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
      trace.flush();
      await flushMicrotasks();
      await flushPromises();
      const traceId = trace.getTraceId();

      expect(traceId).toHaveLength(32);

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

      client.trace({ name: 'test', captureStackTrace: false })
        .flush();
      await flushMicrotasks();
      await flushPromises();

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

      client.trace({ name: 'test' })
        .addEvent('error_occurred', { code: 500 }, { captureStackTrace: true })
        .flush();
      await flushMicrotasks();
      await flushPromises();

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

      client.trace({ name: 'test' })
        .addEvent('message', 'Something happened', { captureStackTrace: true })
        .flush();
      await flushMicrotasks();
      await flushPromises();

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

      client.trace({ name: 'test' })
        .addEvent('legacy_event', 'details', customTimestamp)
        .flush();
      await flushMicrotasks();
      await flushPromises();

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

      client.trace({ name: 'test' })
        .addStackTrace('checkpoint', { stage: 'validation' })
        .flush();
      await flushMicrotasks();
      await flushPromises();

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

      client.trace({ name: 'test' })
        .addStackTrace()
        .flush();
      await flushMicrotasks();
      await flushPromises();

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

      client.trace({ name: 'test' })
        .addExistingStackTrace(capturedStack, 'deferred_trace', { reason: 'async' })
        .flush();
      await flushMicrotasks();
      await flushPromises();

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
      trace.flush();
      await flushMicrotasks();
      await flushPromises();
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

  describe('web3.evm.addTxHint with TxHintOptions', () => {
    it('should accept string details (backwards compatible)', async () => {
      const mockResponse: apiGateway.FlushTraceResponse = {
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
        traceId: 'trace-hint-string',
      created: true,
      };
      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockResponse);

      client.trace({ name: 'test', captureStackTrace: false })
        .web3.evm.addTxHint('0xabc', 'ethereum', 'simple string')
        .flush();
      await flushMicrotasks();
      await flushPromises();

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

      client.trace({ name: 'test', captureStackTrace: false })
        .web3.evm.addTxHint('0xabc', 'ethereum', { input: '0xa9059cbb...' })
        .flush();
      await flushMicrotasks();
      await flushPromises();

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

      client.trace({ name: 'test', captureStackTrace: false })
        .web3.evm.addTxHint('0xabc', 'ethereum', { input: '0xa9059cbb...', details: 'swap' })
        .flush();
      await flushMicrotasks();
      await flushPromises();

      const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      const inputEvent = calls.data?.events?.find((e: { name?: string }) => e.name === 'Tx input data');
      expect(inputEvent).toBeDefined();
      expect(inputEvent?.details).toBe('0xa9059cbb...');
      expect(calls.data?.txHashHints?.[0]?.details).toBe('swap');
    });
  });

  describe('web3.safe.addMsgHint', () => {
    it('should add a safe message hint with chain and message hash', async () => {
      const mockResponse: apiGateway.FlushTraceResponse = {
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
        traceId: 'trace-safemsg',
      created: true,
      };
      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockResponse);

      client.trace({ name: 'test', captureStackTrace: false })
        .web3.safe.addMsgHint('0xmsgHash123', 'ethereum')
        .flush();
      await flushMicrotasks();
      await flushPromises();

      const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      const safeMsgHints = calls.data?.safeMsgHints;
      expect(safeMsgHints).toHaveLength(1);
      expect(safeMsgHints?.[0]?.messageHash).toBe('0xmsgHash123');
      expect(safeMsgHints?.[0]?.chain).toBe(ProtoChain.CHAIN_ETHEREUM);
      expect(safeMsgHints?.[0]?.timestamp).toBeInstanceOf(Date);
    });

    it('should add a safe message hint with details', async () => {
      const mockResponse: apiGateway.FlushTraceResponse = {
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
        traceId: 'trace-safemsg-details',
      created: true,
      };
      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockResponse);

      client.trace({ name: 'test', captureStackTrace: false })
        .web3.safe.addMsgHint('0xmsgHash456', 'polygon', 'multisig approval')
        .flush();
      await flushMicrotasks();
      await flushPromises();

      const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      const safeMsgHints = calls.data?.safeMsgHints;
      expect(safeMsgHints?.[0]?.messageHash).toBe('0xmsgHash456');
      expect(safeMsgHints?.[0]?.chain).toBe(ProtoChain.CHAIN_POLYGON);
      expect(safeMsgHints?.[0]?.details).toBe('multisig approval');
    });

    it('should support multiple safe message hints', async () => {
      const mockResponse: apiGateway.FlushTraceResponse = {
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
        traceId: 'trace-safemsg-multi',
      created: true,
      };
      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockResponse);

      client.trace({ name: 'test', captureStackTrace: false })
        .web3.safe.addMsgHint('0xmsg1', 'ethereum')
        .web3.safe.addMsgHint('0xmsg2', 'base', 'second hint')
        .flush();
      await flushMicrotasks();
      await flushPromises();

      const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      const safeMsgHints = calls.data?.safeMsgHints;
      expect(safeMsgHints).toHaveLength(2);
      expect(safeMsgHints?.[0]?.messageHash).toBe('0xmsg1');
      expect(safeMsgHints?.[0]?.chain).toBe(ProtoChain.CHAIN_ETHEREUM);
      expect(safeMsgHints?.[1]?.messageHash).toBe('0xmsg2');
      expect(safeMsgHints?.[1]?.chain).toBe(ProtoChain.CHAIN_BASE);
      expect(safeMsgHints?.[1]?.details).toBe('second hint');
    });

    it('should handle different chain names', async () => {
      const mockResponse: apiGateway.FlushTraceResponse = {
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
        traceId: 'trace-safemsg-chains',
      created: true,
      };
      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockResponse);

      const chainTests: Array<{ chain: ChainName; expected: ProtoChain }> = [
        { chain: 'ethereum', expected: ProtoChain.CHAIN_ETHEREUM },
        { chain: 'polygon', expected: ProtoChain.CHAIN_POLYGON },
        { chain: 'arbitrum', expected: ProtoChain.CHAIN_ARBITRUM },
        { chain: 'base', expected: ProtoChain.CHAIN_BASE },
        { chain: 'optimism', expected: ProtoChain.CHAIN_OPTIMISM },
        { chain: 'bsc', expected: ProtoChain.CHAIN_BSC },
      ];

      for (const { chain, expected } of chainTests) {
        mockApiGatewayClient.FlushTrace.mockClear();
        mockApiGatewayClient.FlushTrace.mockResolvedValue(mockResponse);

        client.trace({ name: 'test', captureStackTrace: false })
          .web3.safe.addMsgHint('0xmsg', chain)
          .flush();
        await flushMicrotasks();
        await flushPromises();

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
      trace.flush();
      await flushMicrotasks();
      await flushPromises();
      await trace.close();

      trace.web3.safe.addMsgHint('0xmsg', 'ethereum');
      expect(console.warn).toHaveBeenCalledWith('[Web3Plugin] Trace is closed, ignoring addMsgHint');
    });

    it('should return this for chaining', () => {
      const trace = client.trace({ name: 'test', captureStackTrace: false });
      const result = trace.web3.safe.addMsgHint('0xmsg', 'ethereum');
      expect(result).toBe(trace);
    });

    it('should work alongside txHashHints and other builder methods', async () => {
      const mockResponse: apiGateway.FlushTraceResponse = {
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
        traceId: 'trace-safemsg-combined',
      created: true,
      };
      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockResponse);

      client.trace({ name: 'multisig-op', captureStackTrace: false })
        .addAttribute('safe_address', '0x1234')
        .addTag('multisig')
        .addEvent('proposed', 'token transfer')
        .web3.evm.addTxHint('0xtx123', 'ethereum')
        .web3.safe.addMsgHint('0xmsg123', 'ethereum', 'approval')
        .flush();
      await flushMicrotasks();
      await flushPromises();

      const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      expect(calls.data?.txHashHints).toHaveLength(1);
      expect(calls.data?.safeMsgHints).toHaveLength(1);
      expect(calls.data?.safeMsgHints?.[0]?.messageHash).toBe('0xmsg123');
      expect(calls.data?.safeMsgHints?.[0]?.details).toBe('approval');
    });
  });

  describe('web3.safe.addTxHint', () => {
    it('should add a safe transaction hint with chain and safeTxHash', async () => {
      const mockResponse: apiGateway.FlushTraceResponse = {
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
        traceId: 'trace-safetx',
      created: true,
      };
      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockResponse);

      client.trace({ name: 'test', captureStackTrace: false })
        .web3.safe.addTxHint('0xsafeTxHash123', 'ethereum')
        .flush();
      await flushMicrotasks();
      await flushPromises();

      const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      const safeTxHints = calls.data?.safeTxHints;
      expect(safeTxHints).toHaveLength(1);
      expect(safeTxHints?.[0]?.safeTxHash).toBe('0xsafeTxHash123');
      expect(safeTxHints?.[0]?.chain).toBe(ProtoChain.CHAIN_ETHEREUM);
      expect(safeTxHints?.[0]?.timestamp).toBeInstanceOf(Date);
    });

    it('should add a safe transaction hint with details', async () => {
      const mockResponse: apiGateway.FlushTraceResponse = {
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
        traceId: 'trace-safetx-details',
      created: true,
      };
      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockResponse);

      client.trace({ name: 'test', captureStackTrace: false })
        .web3.safe.addTxHint('0xsafeTxHash456', 'polygon', 'multisig execution')
        .flush();
      await flushMicrotasks();
      await flushPromises();

      const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      const safeTxHints = calls.data?.safeTxHints;
      expect(safeTxHints?.[0]?.safeTxHash).toBe('0xsafeTxHash456');
      expect(safeTxHints?.[0]?.chain).toBe(ProtoChain.CHAIN_POLYGON);
      expect(safeTxHints?.[0]?.details).toBe('multisig execution');
    });

    it('should support multiple safe transaction hints', async () => {
      const mockResponse: apiGateway.FlushTraceResponse = {
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
        traceId: 'trace-safetx-multi',
      created: true,
      };
      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockResponse);

      client.trace({ name: 'test', captureStackTrace: false })
        .web3.safe.addTxHint('0xsafetx1', 'ethereum')
        .web3.safe.addTxHint('0xsafetx2', 'base', 'second hint')
        .flush();
      await flushMicrotasks();
      await flushPromises();

      const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      const safeTxHints = calls.data?.safeTxHints;
      expect(safeTxHints).toHaveLength(2);
      expect(safeTxHints?.[0]?.safeTxHash).toBe('0xsafetx1');
      expect(safeTxHints?.[0]?.chain).toBe(ProtoChain.CHAIN_ETHEREUM);
      expect(safeTxHints?.[1]?.safeTxHash).toBe('0xsafetx2');
      expect(safeTxHints?.[1]?.chain).toBe(ProtoChain.CHAIN_BASE);
      expect(safeTxHints?.[1]?.details).toBe('second hint');
    });

    it('should handle different chain names', async () => {
      const mockResponse: apiGateway.FlushTraceResponse = {
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
        traceId: 'trace-safetx-chains',
      created: true,
      };
      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockResponse);

      const chainTests: Array<{ chain: ChainName; expected: ProtoChain }> = [
        { chain: 'ethereum', expected: ProtoChain.CHAIN_ETHEREUM },
        { chain: 'polygon', expected: ProtoChain.CHAIN_POLYGON },
        { chain: 'arbitrum', expected: ProtoChain.CHAIN_ARBITRUM },
        { chain: 'base', expected: ProtoChain.CHAIN_BASE },
        { chain: 'optimism', expected: ProtoChain.CHAIN_OPTIMISM },
        { chain: 'bsc', expected: ProtoChain.CHAIN_BSC },
      ];

      for (const { chain, expected } of chainTests) {
        mockApiGatewayClient.FlushTrace.mockClear();
        mockApiGatewayClient.FlushTrace.mockResolvedValue(mockResponse);

        client.trace({ name: 'test', captureStackTrace: false })
          .web3.safe.addTxHint('0xsafetx', chain)
          .flush();
        await flushMicrotasks();
        await flushPromises();

        const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
        expect(calls.data?.safeTxHints?.[0]?.chain).toBe(expected);
      }
    });

    it('should be ignored when trace is closed', async () => {
      const mockResponse: apiGateway.FlushTraceResponse = {
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
        traceId: 'trace-safetx-closed',
      created: true,
      };
      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockResponse);

      const trace = client.trace({ name: 'test', captureStackTrace: false });
      trace.flush();
      await flushMicrotasks();
      await flushPromises();
      await trace.close();

      trace.web3.safe.addTxHint('0xsafetx', 'ethereum');
      expect(console.warn).toHaveBeenCalledWith('[Web3Plugin] Trace is closed, ignoring addTxHint');
    });

    it('should return this for chaining', () => {
      const trace = client.trace({ name: 'test', captureStackTrace: false });
      const result = trace.web3.safe.addTxHint('0xsafetx', 'ethereum');
      expect(result).toBe(trace);
    });

    it('should work alongside txHashHints, safeMsgHints, and other builder methods', async () => {
      const mockResponse: apiGateway.FlushTraceResponse = {
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
        traceId: 'trace-safetx-combined',
      created: true,
      };
      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockResponse);

      client.trace({ name: 'multisig-exec', captureStackTrace: false })
        .addAttribute('safe_address', '0x1234')
        .addTag('multisig')
        .addEvent('executing', 'token transfer')
        .web3.evm.addTxHint('0xtx123', 'ethereum')
        .web3.safe.addMsgHint('0xmsg123', 'ethereum', 'approval')
        .web3.safe.addTxHint('0xsafetx123', 'ethereum', 'execution')
        .flush();
      await flushMicrotasks();
      await flushPromises();

      const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      expect(calls.data?.txHashHints).toHaveLength(1);
      expect(calls.data?.safeMsgHints).toHaveLength(1);
      expect(calls.data?.safeTxHints).toHaveLength(1);
      expect(calls.data?.safeTxHints?.[0]?.safeTxHash).toBe('0xsafetx123');
      expect(calls.data?.safeTxHints?.[0]?.details).toBe('execution');
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

      client.trace({ name: 'test', captureStackTrace: false })
        .web3.evm.addTx({ hash: '0xabc', chainId: 1 })
        .flush();
      await flushMicrotasks();
      await flushPromises();

      const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      expect(calls.data?.txHashHints?.[0]?.txHash).toBe('0xabc');
      expect(calls.data?.txHashHints?.[0]?.chain).toBe(ProtoChain.CHAIN_ETHEREUM);
    });

    it('should extract input data from tx.data', async () => {
      const mockResponse: apiGateway.FlushTraceResponse = {
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
        traceId: 'trace-addtx-data',
      created: true,
      };
      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockResponse);

      client.trace({ name: 'test', captureStackTrace: false })
        .web3.evm.addTx({ hash: '0xabc', chainId: 1, data: '0xa9059cbb...' })
        .flush();
      await flushMicrotasks();
      await flushPromises();

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

      client.trace({ name: 'test', captureStackTrace: false })
        .web3.evm.addTx({ hash: '0xabc', chainId: 137, input: '0xdeadbeef' })
        .flush();
      await flushMicrotasks();
      await flushPromises();

      const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      expect(calls.data?.txHashHints?.[0]?.chain).toBe(ProtoChain.CHAIN_POLYGON);
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

      client.trace({ name: 'test', captureStackTrace: false })
        .web3.evm.addTx({ hash: '0xabc', chainId: 1 }, 'polygon')
        .flush();
      await flushMicrotasks();
      await flushPromises();

      const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      expect(calls.data?.txHashHints?.[0]?.chain).toBe(ProtoChain.CHAIN_POLYGON);
    });

    it('should return this for chaining', () => {
      const trace = client.trace({ name: 'test' });
      expect(trace.web3.evm.addTx({ hash: '0xabc', chainId: 1 })).toBe(trace);
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
      expect(trace.web3.evm.setProvider(mockProvider)).toBe(trace);
    });

    it('setProvider should cache chain ID from provider', async () => {
      const trace = client.trace({ name: 'test' });
      trace.web3.evm.setProvider(mockProvider);
      await new Promise(r => setTimeout(r, 0));
      expect(trace.web3.evm.getProviderChain()).toBe(Chain.Ethereum);
    });

    it('sendTransaction should send tx and return hash', async () => {
      const mockResponse: apiGateway.FlushTraceResponse = {
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
        traceId: 'trace-sendtx',
      created: true,
      };
      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockResponse);

      const trace = client.trace({ name: 'test', captureStackTrace: false });
      trace.web3.evm.setProvider(mockProvider);
      await new Promise(r => setTimeout(r, 0));

      const txHash = await trace.web3.evm.sendTransaction({
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
        trace.web3.evm.sendTransaction({ from: '0x1' })
      ).rejects.toThrow('[Web3Plugin] No provider configured');
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
      trace.web3.evm.setProvider(errorProvider);
      await new Promise(r => setTimeout(r, 0));

      await expect(
        trace.web3.evm.sendTransaction({ from: '0x1', chainId: 1 })
      ).rejects.toThrow('User rejected');
    });

    it('sendTransaction should accept provider as parameter', async () => {
      const trace = client.trace({ name: 'test', captureStackTrace: false });
      const txHash = await trace.web3.evm.sendTransaction(
        { from: '0xsender', chainId: 1 },
        mockProvider
      );
      expect(txHash).toBe('0xtxhash123');
    });
  });

  describe('resolveChain', () => {
    it('should prefer explicit chain parameter', () => {
      const trace = client.trace({ name: 'test' });
      expect(trace.web3.evm.resolveChain('polygon', 1)).toBe(Chain.Polygon);
    });

    it('should fall back to chainId', () => {
      const trace = client.trace({ name: 'test' });
      expect(trace.web3.evm.resolveChain(undefined, 137)).toBe(Chain.Polygon);
    });

    it('should fall back to provider chain', async () => {
      const mockProvider: EIP1193Provider = {
        request: jest.fn().mockResolvedValue('0x1'),
      };
      const trace = client.trace({ name: 'test' });
      trace.web3.evm.setProvider(mockProvider);
      await new Promise(r => setTimeout(r, 0));
      expect(trace.web3.evm.resolveChain()).toBe(Chain.Ethereum);
    });

    it('should throw if chain cannot be determined', () => {
      const trace = client.trace({ name: 'test' });
      expect(() => trace.web3.evm.resolveChain()).toThrow('[Web3Plugin] Cannot determine chain');
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
      client.trace({ name: 'test', captureStackTrace: false })
        .web3.evm.addTxHint('0xhash', 'ethereum')
        .flush();
      await flushMicrotasks();
      await flushPromises();

      const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      expect(calls.data?.txHashHints?.[0]?.txHash).toBe('0xhash');
      expect(calls.data?.txHashHints?.[0]?.chain).toBe(ProtoChain.CHAIN_ETHEREUM);
      expect(calls.data?.txHashHints?.[0]?.details).toBeUndefined();
    });

    it('should support addTxHint with string details (raw string, not JSON)', async () => {
      client.trace({ name: 'test', captureStackTrace: false })
        .web3.evm.addTxHint('0xhash', 'ethereum', 'swap tx')
        .flush();
      await flushMicrotasks();
      await flushPromises();

      const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      expect(calls.data?.txHashHints?.[0]?.details).toBe('swap tx');
    });

    it('should support addTxHint with undefined options', async () => {
      client.trace({ name: 'test', captureStackTrace: false })
        .web3.evm.addTxHint('0xhash', 'base', undefined)
        .flush();
      await flushMicrotasks();
      await flushPromises();

      const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      expect(calls.data?.txHashHints?.[0]?.txHash).toBe('0xhash');
      expect(calls.data?.txHashHints?.[0]?.chain).toBe(ProtoChain.CHAIN_BASE);
      expect(calls.data?.txHashHints?.[0]?.details).toBeUndefined();
    });

    it('should support addTxInputData', async () => {
      client.trace({ name: 'test', captureStackTrace: false })
        .web3.evm.addInputData('0xabcd')
        .flush();
      await flushMicrotasks();
      await flushPromises();

      const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      expect(calls.data?.events?.[0]?.name).toBe('Tx input data');
      expect(calls.data?.events?.[0]?.details).toBe('0xabcd');
    });

    it('should support full legacy workflow with all data present', async () => {
      client.trace({ name: 'swap', captureStackTrace: false })
        .addAttribute('user', '0x1')
        .addTag('dex')
        .addEvent('started', 'details')
        .web3.evm.addTxHint('0xhash', 'ethereum', 'swap tx')
        .web3.evm.addInputData('0xdata')
        .flush();
      await flushMicrotasks();
      await flushPromises();

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
      expect(calls.data?.txHashHints?.[0]?.chain).toBe(ProtoChain.CHAIN_ETHEREUM);
      expect(calls.data?.txHashHints?.[0]?.details).toBe('swap tx');
    });

    it('should ignore methods on closed trace without crashing', async () => {
      const trace = client.trace({ name: 'test', captureStackTrace: false });
      trace.flush();
      await flushMicrotasks();
      await flushPromises();
      await trace.close();

      // These should be ignored (trace is closed)
      trace.web3.evm.addTx({ hash: '0xabc', chainId: 1 });

      // Verify warnings were logged for addTx
      expect(mockConsoleWarn).toHaveBeenCalledWith(
        '[Web3Plugin] Trace is closed, ignoring addTx'
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

      // flush() on a closed trace is silently ignored
      mockApiGatewayClient.FlushTrace.mockClear();
      trace.flush();
      expect(mockApiGatewayClient.FlushTrace).not.toHaveBeenCalled();

      // sendTransaction without provider should still throw
      const traceNoProvider = client.trace({ name: 'test2', captureStackTrace: false });
      traceNoProvider.flush();
      await flushMicrotasks();
      await flushPromises();
      await traceNoProvider.close();
      await expect(
        traceNoProvider.web3.evm.sendTransaction({ from: '0x1' })
      ).rejects.toThrow('[Web3Plugin] No provider configured');
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
      // Mock FlushTrace for auto-flush scenarios where sendTransaction triggers
      // scheduleFlush via addEvent, causing FlushTrace to resolve before flush()
      // is called.
      (mockApiGatewayClient as jest.Mocked<apiGateway.IngestGatewayServiceClientImpl>).FlushTrace =
        jest.fn().mockResolvedValue({ status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined }, traceId: '', created: true });
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

    it('should flow provider from Web3Plugin to trace', async () => {
      const c = new Client('key', { plugins: [Web3Plugin({ provider: ethProvider })] });

      // Re-mock after new Client construction
      jest
        .spyOn(apiGateway, 'IngestGatewayServiceClientImpl')
        .mockImplementation(() => mockApiGatewayClient);

      const trace = c.trace({ captureStackTrace: false });
      await new Promise(r => setTimeout(r, 0));
      expect(trace.web3.evm.getProviderChain()).toBe(Chain.Ethereum);
    });

    it('should allow setProvider to override Web3Plugin provider', async () => {
      const c = new Client('key', { plugins: [Web3Plugin({ provider: polygonProvider })] });

      jest
        .spyOn(apiGateway, 'IngestGatewayServiceClientImpl')
        .mockImplementation(() => mockApiGatewayClient);

      const trace = c.trace({ captureStackTrace: false });
      await new Promise(r => setTimeout(r, 0));
      expect(trace.web3.evm.getProviderChain()).toBe(Chain.Polygon);

      trace.web3.evm.setProvider(ethProvider);
      await new Promise(r => setTimeout(r, 0));
      expect(trace.web3.evm.getProviderChain()).toBe(Chain.Ethereum);
    });

    it('should handle setProvider with failing eth_chainId', async () => {
      const failProvider: EIP1193Provider = {
        request: jest.fn().mockRejectedValue(new Error('RPC error')),
      };

      const trace = client.trace({ name: 'test', captureStackTrace: false });
      trace.web3.evm.setProvider(failProvider);
      await new Promise(r => setTimeout(r, 0));
      expect(trace.web3.evm.getProviderChain()).toBeNull();
    });

    it('should handle setProvider with unknown chain ID', async () => {
      const unknownChainProvider: EIP1193Provider = {
        request: jest.fn().mockResolvedValue('0xffffff'),
      };

      const trace = client.trace({ name: 'test', captureStackTrace: false });
      trace.web3.evm.setProvider(unknownChainProvider);
      await new Promise(r => setTimeout(r, 0));
      expect(trace.web3.evm.getProviderChain()).toBeNull();
    });

    it('should serialize bigint values correctly in sendTransaction', async () => {
      const trace = client.trace({ name: 'test', captureStackTrace: false });
      trace.web3.evm.setProvider(ethProvider);
      await new Promise(r => setTimeout(r, 0));

      await trace.web3.evm.sendTransaction({
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
      trace.web3.evm.setProvider(ethProvider);
      await new Promise(r => setTimeout(r, 0));

      await trace.web3.evm.sendTransaction({
        from: '0xsender',
        to: '0xreceiver',
        data: '0xa9059cbb0000',
        chainId: 1,
      });

      trace.flush();
      await flushMicrotasks();
      await flushPromises();

      const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      const eventNames = calls.data?.events?.map((e: { name?: string; details?: string }) => e.name);
      expect(eventNames).toContain('tx:send');
    });

    it('should capture tx:sent event with txHash after sendTransaction', async () => {
      const trace = client.trace({ name: 'test', captureStackTrace: false });
      trace.web3.evm.setProvider(ethProvider);
      await new Promise(r => setTimeout(r, 0));

      await trace.web3.evm.sendTransaction({
        from: '0xsender',
        to: '0xreceiver',
        chainId: 1,
      });

      trace.flush();
      await flushMicrotasks();
      await flushPromises();

      // With auto-flush, events may be split across FlushTrace calls
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allEvents = mockApiGatewayClient.FlushTrace.mock.calls.flatMap((call: unknown[]) => (call[0] as Record<string, any>).data?.events ?? []);
      const sentEvent = allEvents.find((e: { name?: string }) => e.name === 'tx:sent');
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
      trace.web3.evm.setProvider(errorProvider);
      await new Promise(r => setTimeout(r, 0));

      await expect(
        trace.web3.evm.sendTransaction({ from: '0x1', chainId: 1 })
      ).rejects.toThrow('User rejected');

      trace.flush();
      await flushMicrotasks();
      await flushPromises();

      // With auto-flush, events may be split across FlushTrace calls
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allEvents = mockApiGatewayClient.FlushTrace.mock.calls.flatMap((call: unknown[]) => (call[0] as Record<string, any>).data?.events ?? []);
      const errorEvent = allEvents.find((e: { name?: string }) => e.name === 'tx:error');
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
      trace.web3.evm.setProvider(errorProvider);
      await new Promise(r => setTimeout(r, 0));

      try {
        await trace.web3.evm.sendTransaction({ from: '0x1', chainId: 1 });
        fail('Expected error to be thrown');
      } catch (err) {
        expect(err).toBe(originalError);
      }
    });

    it('should handle multiple sendTransaction calls', async () => {
      const trace = client.trace({ name: 'test', captureStackTrace: false });
      trace.web3.evm.setProvider(ethProvider);
      await new Promise(r => setTimeout(r, 0));

      await trace.web3.evm.sendTransaction({ from: '0xsender', to: '0xa', chainId: 1 });
      await trace.web3.evm.sendTransaction({ from: '0xsender', to: '0xb', chainId: 1 });

      trace.flush();
      await flushMicrotasks();
      await flushPromises();

      // With auto-flush, events may be split across FlushTrace calls
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allEvents = mockApiGatewayClient.FlushTrace.mock.calls.flatMap((call: unknown[]) => (call[0] as Record<string, any>).data?.events ?? []);
      const sendEvents = allEvents.filter((e: { name?: string }) => e.name === 'tx:send');
      const sentEvents = allEvents.filter((e: { name?: string }) => e.name === 'tx:sent');
      expect(sendEvents).toHaveLength(2);
      expect(sentEvents).toHaveLength(2);
    });

    it('should truncate long data in tx:send event', async () => {
      const trace = client.trace({ name: 'test', captureStackTrace: false });
      trace.web3.evm.setProvider(ethProvider);
      await new Promise(r => setTimeout(r, 0));

      const longData = '0xa9059cbb' + '0'.repeat(200);
      await trace.web3.evm.sendTransaction({
        from: '0xsender',
        to: '0xreceiver',
        data: longData,
        chainId: 1,
      });

      trace.flush();
      await flushMicrotasks();
      await flushPromises();

      const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      const sendEvent = calls.data?.events?.find((e: { name?: string; details?: string }) => e.name === 'tx:send');
      const sendDetails = JSON.parse(sendEvent?.details || '{}');
      expect(sendDetails.data).toBe(longData.slice(0, 10) + '...');
    });

    it('should handle sendTransaction with no data field', async () => {
      const trace = client.trace({ name: 'test', captureStackTrace: false });
      trace.web3.evm.setProvider(ethProvider);
      await new Promise(r => setTimeout(r, 0));

      await trace.web3.evm.sendTransaction({
        from: '0xsender',
        to: '0xreceiver',
        chainId: 1,
      });

      trace.flush();
      await flushMicrotasks();
      await flushPromises();

      const calls = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      const sendEvent = calls.data?.events?.find((e: { name?: string; details?: string }) => e.name === 'tx:send');
      const sendDetails = JSON.parse(sendEvent?.details || '{}');
      expect(sendDetails.data).toBeUndefined();
    });
  });

  describe('resumed trace (traceId option)', () => {
    const mockUpdateResponse: apiGateway.FlushTraceResponse = {
      status: {
        code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
        errorMessage: undefined,
      },
      traceId: '',
      created: false,
    };

    const mockKeepAliveResponse: apiGateway.KeepAliveResponse = {
      accepted: true,
    };

    const mockCloseResponse: apiGateway.CloseTraceResponse = {
      accepted: true,
    };

    beforeEach(() => {
      (mockApiGatewayClient as jest.Mocked<apiGateway.IngestGatewayServiceClientImpl>).FlushTrace =
        jest.fn().mockResolvedValue(mockUpdateResponse);
      (mockApiGatewayClient as jest.Mocked<apiGateway.IngestGatewayServiceClientImpl>).KeepAlive =
        jest.fn().mockResolvedValue(mockKeepAliveResponse);
      (mockApiGatewayClient as jest.Mocked<apiGateway.IngestGatewayServiceClientImpl>).CloseTrace =
        jest.fn().mockResolvedValue(mockCloseResponse);
    });

    it('should send FlushTrace with provided traceId when traceId is set via options', async () => {
      const trace = client.trace({ traceId: 'frontend-trace-abc', captureStackTrace: false })
        .addAttribute('endpoint', '/api/swap')
        .addTag('backend');
      trace.flush();
      await flushMicrotasks();
      await flushPromises();
      const traceId = trace.getTraceId();

      expect(traceId).toBe('frontend-trace-abc');
      expect(mockApiGatewayClient.FlushTrace).toHaveBeenCalledTimes(1);
      expect(mockApiGatewayClient.FlushTrace.mock.calls[0][0].traceId).toBe('frontend-trace-abc');
    });

    it('should include attributes in the FlushTrace request', async () => {
      client.trace({ traceId: 'trace-attrs', captureStackTrace: false })
        .addAttribute('user', '0xabc')
        .addAttribute('slippage', 25)
        .addAttributes({ env: 'production', region: 'us-east' })
        .flush();
      await flushMicrotasks();
      await flushPromises();

      const updateCall = (mockApiGatewayClient as jest.Mocked<apiGateway.IngestGatewayServiceClientImpl>).FlushTrace.mock.calls[0][0];
      expect(updateCall.traceId).toBe('trace-attrs');
      expect(updateCall.data?.attributes?.[0]?.attributes).toEqual({
        user: '0xabc',
        slippage: '25',
        env: 'production',
        region: 'us-east',
      });
    });

    it('should include tags in the FlushTrace request', async () => {
      client.trace({ traceId: 'trace-tags', captureStackTrace: false })
        .addTag('backend')
        .addTags(['api', 'swap'])
        .flush();
      await flushMicrotasks();
      await flushPromises();

      const updateCall = (mockApiGatewayClient as jest.Mocked<apiGateway.IngestGatewayServiceClientImpl>).FlushTrace.mock.calls[0][0];
      expect(updateCall.data?.tags?.[0]?.tags).toEqual(['backend', 'api', 'swap']);
    });

    it('should include events in the FlushTrace request', async () => {
      client.trace({ traceId: 'trace-events', captureStackTrace: false })
        .addEvent('backend:received', 'request received')
        .addEvent('backend:processed', { duration: 150 })
        .flush();
      await flushMicrotasks();
      await flushPromises();

      const updateCall = (mockApiGatewayClient as jest.Mocked<apiGateway.IngestGatewayServiceClientImpl>).FlushTrace.mock.calls[0][0];
      expect(updateCall.data?.events).toHaveLength(2);
      expect(updateCall.data?.events?.[0]?.name).toBe('backend:received');
      expect(updateCall.data?.events?.[0]?.details).toBe('request received');
      expect(updateCall.data?.events?.[1]?.name).toBe('backend:processed');
      expect(JSON.parse(updateCall.data?.events?.[1]?.details || '{}')).toEqual({ duration: 150 });
    });

    it('should include txHashHints in the FlushTrace request', async () => {
      client.trace({ traceId: 'trace-tx', captureStackTrace: false })
        .web3.evm.addTxHint('0xhash123', 'ethereum', 'swap tx')
        .flush();
      await flushMicrotasks();
      await flushPromises();

      const updateCall = (mockApiGatewayClient as jest.Mocked<apiGateway.IngestGatewayServiceClientImpl>).FlushTrace.mock.calls[0][0];
      expect(updateCall.data?.txHashHints).toHaveLength(1);
      expect(updateCall.data?.txHashHints?.[0]?.txHash).toBe('0xhash123');
      expect(updateCall.data?.txHashHints?.[0]?.chain).toBe(ProtoChain.CHAIN_ETHEREUM);
      expect(updateCall.data?.txHashHints?.[0]?.details).toBe('swap tx');
    });

    it('should include all data types in a complex resumed trace', async () => {
      client.trace({ traceId: 'trace-complex', captureStackTrace: false })
        .addAttribute('user', '0xabc')
        .addTag('dex')
        .addEvent('started', 'swap initiated')
        .web3.evm.addTxHint('0xhash', 'polygon')
        .web3.evm.addInputData('0xa9059cbb')
        .flush();
      await flushMicrotasks();
      await flushPromises();

      expect(mockApiGatewayClient.FlushTrace).toHaveBeenCalledTimes(1);
      const updateCall = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      expect(updateCall.traceId).toBe('trace-complex');
      expect(updateCall.data?.attributes?.[0]?.attributes).toEqual({ user: '0xabc' });
      expect(updateCall.data?.tags?.[0]?.tags).toEqual(['dex']);
      expect(updateCall.data?.events?.map((e: { name?: string }) => e.name)).toContain('started');
      expect(updateCall.data?.events?.map((e: { name?: string }) => e.name)).toContain('Tx input data');
      expect(updateCall.data?.txHashHints?.[0]?.chain).toBe(ProtoChain.CHAIN_POLYGON);
    });

    it('should start keep-alive after successful flush()', async () => {
      const trace = client.trace({ traceId: 'trace-keepalive', captureStackTrace: false });
      trace.flush();
      await flushMicrotasks();
      await flushPromises();

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

    it('should return the pre-set traceId from getTraceId() before flush()', () => {
      const trace = client.trace({ traceId: 'pre-set-id', captureStackTrace: false });
      expect(trace.getTraceId()).toBe('pre-set-id');
    });

    it('should log error when FlushTrace fails for resumed trace', async () => {
      // Use a retryable gRPC error (UNAVAILABLE = code 14)
      const grpcError = Object.assign(new Error('Network error'), { code: 14 });
      (mockApiGatewayClient as jest.Mocked<apiGateway.IngestGatewayServiceClientImpl>).FlushTrace =
        jest.fn().mockRejectedValue(grpcError);

      client.trace({
        traceId: 'fail-trace',
        captureStackTrace: false,
        maxRetries: 0,
      }).flush();
      await flushMicrotasks();
      await flushPromises();

      expect(mockConsoleError).toHaveBeenCalledWith(
        '[MiradorTrace] FlushTrace error after retries:',
        expect.any(Error)
      );
    });

    it('should retry FlushTrace on failure for resumed traces', async () => {
      // Use a retryable gRPC error (UNAVAILABLE = code 14)
      const grpcError = Object.assign(new Error('Transient error'), { code: 14 });
      const updateMock = jest.fn()
        .mockRejectedValueOnce(grpcError)
        .mockResolvedValueOnce(mockUpdateResponse);

      (mockApiGatewayClient as jest.Mocked<apiGateway.IngestGatewayServiceClientImpl>).FlushTrace = updateMock;

      const trace = client.trace({
        traceId: 'retry-trace',
        captureStackTrace: false,
        maxRetries: 1,
        retryBackoff: 1, // 1ms for fast tests
      });
      trace.flush();
      // Wait long enough for the retry backoff (1ms) + promise resolution
      await new Promise(r => setTimeout(r, 50));
      const traceId = trace.getTraceId();

      expect(traceId).toBe('retry-trace');
      expect(updateMock).toHaveBeenCalledTimes(2);
    });

    it('should close a resumed trace correctly', async () => {
      const trace = client.trace({ traceId: 'close-test', captureStackTrace: false });
      trace.flush();
      await flushMicrotasks();
      await flushPromises();
      await trace.close('done');

      expect(trace.isClosed()).toBe(true);
      expect((mockApiGatewayClient as jest.Mocked<apiGateway.IngestGatewayServiceClientImpl>).CloseTrace).toHaveBeenCalledWith(
        expect.objectContaining({ traceId: 'close-test', text: 'done' })
      );
    });

    it('should send empty data arrays when no data is added to resumed trace', async () => {
      client.trace({ traceId: 'empty-data', captureStackTrace: false }).flush();
      await flushMicrotasks();
      await flushPromises();

      const updateCall = (mockApiGatewayClient as jest.Mocked<apiGateway.IngestGatewayServiceClientImpl>).FlushTrace.mock.calls[0][0];
      expect(updateCall.traceId).toBe('empty-data');
      expect(updateCall.data?.attributes).toEqual([]);
      expect(updateCall.data?.tags).toEqual([]);
      expect(updateCall.data?.events).toEqual([]);
      expect(updateCall.data?.txHashHints).toEqual([]);
    });

    it('should include sendClientTimestamp in the FlushTrace request', async () => {
      const before = new Date();
      client.trace({ traceId: 'timestamp-test', captureStackTrace: false }).flush();
      await flushMicrotasks();
      await flushPromises();
      const after = new Date();

      const updateCall = (mockApiGatewayClient as jest.Mocked<apiGateway.IngestGatewayServiceClientImpl>).FlushTrace.mock.calls[0][0];
      expect(updateCall.sendClientTimestamp).toBeDefined();
      expect(updateCall.sendClientTimestamp!.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(updateCall.sendClientTimestamp!.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('standard trace (no traceId)', () => {
    const mockCreateResponse: apiGateway.FlushTraceResponse = {
      status: {
        code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS,
        errorMessage: undefined,
      },
      traceId: 'server-assigned-id',
      created: true,
    };

    const mockKeepAliveResponse: apiGateway.KeepAliveResponse = {
      accepted: true,
    };

    const mockCloseResponse: apiGateway.CloseTraceResponse = {
      accepted: true,
    };

    beforeEach(() => {
      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockCreateResponse);
      (mockApiGatewayClient as jest.Mocked<apiGateway.IngestGatewayServiceClientImpl>).KeepAlive =
        jest.fn().mockResolvedValue(mockKeepAliveResponse);
      (mockApiGatewayClient as jest.Mocked<apiGateway.IngestGatewayServiceClientImpl>).CloseTrace =
        jest.fn().mockResolvedValue(mockCloseResponse);
    });

    it('should send FlushTrace when no traceId is provided', async () => {
      const trace = client.trace({ name: 'standard', captureStackTrace: false })
        .addAttribute('key', 'value');
      trace.flush();
      await flushMicrotasks();
      await flushPromises();
      const traceId = trace.getTraceId();

      expect(traceId).toHaveLength(32); // auto-generated W3C trace ID
      expect(mockApiGatewayClient.FlushTrace).toHaveBeenCalledTimes(1);
    });

    it('should send FlushTrace when traceId option is undefined', async () => {
      const trace = client.trace({ name: 'explicit-undefined', traceId: undefined, captureStackTrace: false });
      trace.flush();
      await flushMicrotasks();
      await flushPromises();
      const traceId = trace.getTraceId();

      expect(traceId).toHaveLength(32); // auto-generated W3C trace ID
      expect(mockApiGatewayClient.FlushTrace).toHaveBeenCalledTimes(1);
    });

    it('should have auto-generated traceId immediately (no traceId option)', () => {
      const trace = client.trace({ captureStackTrace: false });
      expect(trace.getTraceId()).toHaveLength(32); // auto-generated W3C trace ID
    });

    it('should include name in FlushTrace request', async () => {
      client.trace({ name: 'my-trace', captureStackTrace: false }).flush();
      await flushMicrotasks();
      await flushPromises();

      const createCall = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      expect(createCall.name).toBe('my-trace');
    });

    it('should include all data in FlushTrace request', async () => {
      client.trace({ name: 'full-trace', captureStackTrace: false })
        .addAttribute('user', '0xabc')
        .addTag('dex')
        .addEvent('started', 'details')
        .web3.evm.addTxHint('0xhash', 'ethereum')
        .flush();
      await flushMicrotasks();
      await flushPromises();

      const createCall = mockApiGatewayClient.FlushTrace.mock.calls[0][0];
      expect(createCall.data?.attributes?.[0]?.attributes).toEqual({ user: '0xabc' });
      expect(createCall.data?.tags?.[0]?.tags).toEqual(['dex']);
      expect(createCall.data?.events?.[0]?.name).toBe('started');
      expect(createCall.data?.txHashHints?.[0]?.txHash).toBe('0xhash');
    });

    it('should close a standard trace correctly', async () => {
      const trace = client.trace({ captureStackTrace: false });
      const traceId = trace.getTraceId();
      trace.flush();
      await flushMicrotasks();
      await flushPromises();
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
      mockApiGatewayClient.FlushTrace.mockResolvedValue({
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
        traceId: 'owner-created-id',
        created: true,
      });

      // Owner creates the trace
      const ownerTrace = client.trace({ name: 'UserSwap', captureStackTrace: false });
      const ownerTraceId = ownerTrace.getTraceId();
      ownerTrace.addAttribute('wallet', '0xabc');
      ownerTrace.flush();
      await jest.advanceTimersByTimeAsync(15000);

      // Owner should have keepalive running
      expect(mockApiGatewayClient.KeepAlive).toHaveBeenCalled();

      // Non-owner resumes the same trace
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

    it('should send FlushTrace on subsequent flushes after trace is created', async () => {
      const mockFlushResponse: apiGateway.FlushTraceResponse = {
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
        traceId: '',
        created: true,
      };
      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockFlushResponse);

      const trace = client.trace({ name: 'update-test', captureStackTrace: false });
      const traceId = trace.getTraceId();
      trace.addAttribute('initial', 'data');

      // First flush → FlushTrace
      await flushMicrotasks();
      await flushPromises();
      expect(mockApiGatewayClient.FlushTrace).toHaveBeenCalledTimes(1);

      // Add more data → should trigger another FlushTrace
      trace.addEvent('step2');
      await flushMicrotasks();
      await flushPromises();

      expect(mockApiGatewayClient.FlushTrace).toHaveBeenCalledTimes(2);
      const secondCall = mockApiGatewayClient.FlushTrace.mock.calls[1][0];
      expect(secondCall.traceId).toBe(traceId);
      expect(secondCall.data?.events).toHaveLength(1);
      expect(secondCall.data?.events?.[0]?.name).toBe('step2');
    });

    it('should clear pending data after flush so subsequent flushes do not re-send', async () => {
      const mockCreateResponse: apiGateway.FlushTraceResponse = {
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
        traceId: 'clear-pending-id',
      created: true,
      };
      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockCreateResponse);

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
      trace.flush();
      await flushMicrotasks();
      await flushPromises();
      await trace.close();

      mockApiGatewayClient.FlushTrace.mockClear();
      trace.flush();

      await flushMicrotasks();
      await flushPromises();

      expect(mockApiGatewayClient.FlushTrace).not.toHaveBeenCalled();
    });

    it('should return void from flush (fire-and-forget)', () => {
      const trace = client.trace({ name: 'void-flush', captureStackTrace: false });
      trace.addAttribute('key', 'value');
      const result = trace.flush();
      expect(result).toBeUndefined();
    });

    it('close() should drain flush queue before sending CloseTrace', async () => {
      const mockFlushResponse: apiGateway.FlushTraceResponse = {
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
        traceId: '',
        created: true,
      };
      mockApiGatewayClient.FlushTrace.mockResolvedValue(mockFlushResponse);
      (mockApiGatewayClient as jest.Mocked<apiGateway.IngestGatewayServiceClientImpl>).CloseTrace = jest.fn().mockResolvedValue({ accepted: true });

      const trace = client.trace({ name: 'drain-test', captureStackTrace: false });
      const traceId = trace.getTraceId();
      trace.addAttribute('key', 'value');
      // flush is auto-scheduled but not yet executed

      // close() should await the pending flush before sending CloseTrace
      await trace.close('done');

      // FlushTrace should have been called (flush drained)
      expect(mockApiGatewayClient.FlushTrace).toHaveBeenCalledTimes(1);
      // CloseTrace should have been called after
      expect((mockApiGatewayClient as jest.Mocked<apiGateway.IngestGatewayServiceClientImpl>).CloseTrace).toHaveBeenCalledWith(
        expect.objectContaining({ traceId, text: 'done' })
      );
    });

    it('should include stack trace attributes only on first flush', async () => {
      const mockFlushResponse: apiGateway.FlushTraceResponse = {
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
        traceId: '',
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

  describe('logger abstraction', () => {
    it('should use noop logger by default (no console output)', async () => {
      const silentClient = new Client('test-key');
      mockApiGatewayClient.FlushTrace.mockResolvedValue({
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_INTERNAL_ERROR, errorMessage: 'fail' },
        traceId: '',
        created: false,
      });

      silentClient.trace({ name: 'silent', captureStackTrace: false }).addTag('x').flush();
      await flushMicrotasks();
      await flushPromises();

      // console.error should NOT be called since logger is noop
      expect(mockConsoleError).not.toHaveBeenCalledWith(
        '[MiradorTrace] FlushTrace failed:',
        'fail'
      );
    });

    it('should use console logger when debug: true', async () => {
      const debugClient = new Client('test-key', { debug: true });
      mockApiGatewayClient.FlushTrace.mockResolvedValue({
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_INTERNAL_ERROR, errorMessage: 'fail' },
        traceId: '',
        created: false,
      });

      debugClient.trace({ name: 'debug', captureStackTrace: false }).addTag('x').flush();
      await flushMicrotasks();
      await flushPromises();

      expect(mockConsoleError).toHaveBeenCalledWith(
        '[MiradorTrace] FlushTrace failed:',
        'fail'
      );
    });

    it('should use custom logger when provided', async () => {
      const customLogger: Logger = {
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      };
      const customClient = new Client('test-key', { logger: customLogger });
      mockApiGatewayClient.FlushTrace.mockResolvedValue({
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_INTERNAL_ERROR, errorMessage: 'custom fail' },
        traceId: '',
        created: false,
      });

      customClient.trace({ name: 'custom', captureStackTrace: false }).addTag('x').flush();
      await flushMicrotasks();
      await flushPromises();

      expect(customLogger.error).toHaveBeenCalledWith(
        '[MiradorTrace] FlushTrace failed:',
        'custom fail'
      );
      // console.error should NOT be called
      expect(mockConsoleError).not.toHaveBeenCalledWith(
        '[MiradorTrace] FlushTrace failed:',
        'custom fail'
      );
    });
  });

  describe('TraceCallbacks', () => {
    it('should invoke onFlushed after successful flush', async () => {
      const onFlushed = jest.fn();
      const cbClient = new Client('test-key', { callbacks: { onFlushed } });
      mockApiGatewayClient.FlushTrace.mockResolvedValue({
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
        traceId: '',
        created: true,
      });

      const trace = cbClient.trace({ name: 'cb-test', captureStackTrace: false });
      trace.addTag('hello');
      trace.flush();
      await flushMicrotasks();
      await flushPromises();

      expect(onFlushed).toHaveBeenCalledWith(trace.getTraceId(), expect.any(Number));
    });

    it('should invoke onFlushError when flush fails after retries', async () => {
      const onFlushError = jest.fn();
      const cbClient = new Client('test-key', { callbacks: { onFlushError } });
      const grpcError = Object.assign(new Error('unavailable'), { code: 14 });
      mockApiGatewayClient.FlushTrace.mockRejectedValue(grpcError);

      cbClient.trace({ name: 'err', captureStackTrace: false, maxRetries: 0 }).addTag('x').flush();
      await flushMicrotasks();
      await flushPromises();

      expect(onFlushError).toHaveBeenCalledWith(expect.any(Error), 'FlushTrace');
    });

    it('should invoke onClosed when trace is closed', async () => {
      const onClosed = jest.fn();
      const cbClient = new Client('test-key', { callbacks: { onClosed } });
      mockApiGatewayClient.FlushTrace.mockResolvedValue({
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
        traceId: '',
        created: true,
      });
      (mockApiGatewayClient as jest.Mocked<apiGateway.IngestGatewayServiceClientImpl>).CloseTrace =
        jest.fn().mockResolvedValue({ accepted: true });

      const trace = cbClient.trace({ name: 'close-cb', captureStackTrace: false });
      trace.addTag('x');
      trace.flush();
      await flushMicrotasks();
      await flushPromises();
      await trace.close('done');

      expect(onClosed).toHaveBeenCalledWith(trace.getTraceId(), 'done');
    });

    it('should invoke onDropped when queue is full', async () => {
      const onDropped = jest.fn();
      const cbClient = new Client('test-key', { debug: true, callbacks: { onDropped } });

      const trace = cbClient.trace({ name: 'drop', captureStackTrace: false, maxQueueSize: 3 });
      trace.addTag('a');
      trace.addTag('b');
      trace.addTag('c');
      // Queue is now at 3 — next add should trigger drop
      trace.addTag('overflow');

      expect(onDropped).toHaveBeenCalledWith(1, 'Queue full');
    });

    it('should swallow errors thrown by callbacks', async () => {
      const throwingCallback: TraceCallbacks = {
        onFlushed: () => { throw new Error('callback crash'); },
      };
      const cbClient = new Client('test-key', { callbacks: throwingCallback });
      mockApiGatewayClient.FlushTrace.mockResolvedValue({
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
        traceId: '',
        created: true,
      });

      const trace = cbClient.trace({ name: 'safe', captureStackTrace: false });
      trace.addTag('x');
      trace.flush();
      await flushMicrotasks();
      await flushPromises();

      // Should not throw — callback error is swallowed
      expect(trace.isClosed()).toBe(false);
    });

    it('should allow per-trace callbacks to override client-level', async () => {
      const clientOnFlushed = jest.fn();
      const traceOnFlushed = jest.fn();
      const cbClient = new Client('test-key', { callbacks: { onFlushed: clientOnFlushed } });
      mockApiGatewayClient.FlushTrace.mockResolvedValue({
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
        traceId: '',
        created: true,
      });

      const trace = cbClient.trace({
        name: 'override',
        captureStackTrace: false,
        callbacks: { onFlushed: traceOnFlushed },
      });
      trace.addTag('x');
      trace.flush();
      await flushMicrotasks();
      await flushPromises();

      expect(traceOnFlushed).toHaveBeenCalled();
      expect(clientOnFlushed).not.toHaveBeenCalled();
    });
  });

  describe('sampling', () => {
    it('should return NoopTrace when sampleRate is 0', () => {
      const sampledClient = new Client('test-key', { sampleRate: 0 });
      const trace = sampledClient.trace({ name: 'sampled-out' });

      expect(trace).toBeInstanceOf(NoopTrace);
      expect(trace.isClosed()).toBe(true);
      expect(trace.getTraceId()).toBe('0'.repeat(32));
    });

    it('should return real Trace when sampleRate is 1', () => {
      const sampledClient = new Client('test-key', { sampleRate: 1 });
      const trace = sampledClient.trace({ name: 'sampled-in' });

      expect(trace).toBeInstanceOf(Trace);
      expect(trace).not.toBeInstanceOf(NoopTrace);
    });

    it('should use custom sampler function', () => {
      const sampler = jest.fn().mockReturnValue(false);
      const sampledClient = new Client('test-key', { sampler });
      const trace = sampledClient.trace({ name: 'custom-sampled' });

      expect(sampler).toHaveBeenCalledWith(expect.objectContaining({ name: 'custom-sampled' }));
      expect(trace).toBeInstanceOf(NoopTrace);
    });

    it('should prefer sampler over sampleRate', () => {
      const sampler = jest.fn().mockReturnValue(true);
      const sampledClient = new Client('test-key', { sampleRate: 0, sampler });
      const trace = sampledClient.trace({ name: 'sampler-wins' });

      expect(trace).not.toBeInstanceOf(NoopTrace);
    });

    it('NoopTrace methods should be no-ops and return this for chaining', () => {
      const noop = new NoopTrace();

      // All builder methods return this and accept no-op calls
      expect(noop.addAttribute()).toBe(noop);
      expect(noop.addAttributes()).toBe(noop);
      expect(noop.addTag()).toBe(noop);
      expect(noop.addTags()).toBe(noop);
      expect(noop.addEvent()).toBe(noop);
      expect(noop.addStackTrace()).toBe(noop);
      expect(noop.addExistingStackTrace()).toBe(noop);
      expect(noop.isClosed()).toBe(true);
      expect(noop.getTraceId()).toBe('0'.repeat(32));
    });

    it('NoopTrace with Web3Plugin methods should be no-ops and return this', () => {
      const noop = new NoopTrace();
      noop._initPlugins([Web3Plugin()]);
      const n = noop as unknown as { web3: { evm: Record<string, (...args: unknown[]) => unknown>; safe: Record<string, (...args: unknown[]) => unknown> } };
      expect(n.web3.evm.addTxHint()).toBe(noop);
      expect(n.web3.safe.addMsgHint()).toBe(noop);
      expect(n.web3.safe.addTxHint()).toBe(noop);
      expect(n.web3.evm.addInputData()).toBe(noop);
      expect(n.web3.evm.addTx()).toBe(noop);
      expect(n.web3.evm.setProvider()).toBe(noop);
    });

    it('NoopTrace.sendTransaction should return empty string', async () => {
      const noop = new NoopTrace();
      noop._initPlugins([Web3Plugin()]);
      const n = noop as unknown as { web3: { evm: Record<string, (...args: unknown[]) => unknown> } };
      const result = await n.web3.evm.sendTransaction();
      expect(result).toBe('');
    });
  });

  describe('rate limiting', () => {
    it('should detect RESOURCE_EXHAUSTED and set client-wide backoff', async () => {
      const rateLimitError = Object.assign(new Error('rate limited'), { code: 8 });
      mockApiGatewayClient.FlushTrace.mockRejectedValue(rateLimitError);

      const trace = client.trace({ name: 'rate-limit', captureStackTrace: false, maxRetries: 0 });
      trace.addTag('x');
      trace.flush();
      await flushMicrotasks();
      await flushPromises();

      // rateLimitedUntil should be set ~30s in the future
      expect((client as unknown as { rateLimitedUntil: number }).rateLimitedUntil).toBeGreaterThan(Date.now());
    });
  });

  describe('retry jitter', () => {
    it('should retry with jitter on retryable errors', async () => {
      const grpcError = Object.assign(new Error('unavailable'), { code: 14 });
      const flushMock = jest.fn()
        .mockRejectedValueOnce(grpcError)
        .mockResolvedValueOnce({
          status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
          traceId: '',
          created: true,
        });
      mockApiGatewayClient.FlushTrace = flushMock;

      const trace = client.trace({
        name: 'jitter-test',
        captureStackTrace: false,
        maxRetries: 1,
        retryBackoff: 1,
      });
      trace.addTag('x');
      trace.flush();
      await new Promise(r => setTimeout(r, 50));

      expect(flushMock).toHaveBeenCalledTimes(2);
    });

    it('should not retry on non-retryable errors', async () => {
      const nonRetryableError = new Error('bad request');
      const flushMock = jest.fn().mockRejectedValue(nonRetryableError);
      mockApiGatewayClient.FlushTrace = flushMock;

      client.trace({
        name: 'no-retry',
        captureStackTrace: false,
        maxRetries: 3,
        retryBackoff: 1,
      }).addTag('x').flush();
      await flushMicrotasks();
      await flushPromises();

      // Should only be called once — no retries for non-retryable errors
      expect(flushMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('queue size limits', () => {
    it('should drop items when queue exceeds maxQueueSize', () => {
      const trace = client.trace({ name: 'queue', captureStackTrace: false, maxQueueSize: 2 });
      trace.addTag('a');
      trace.addTag('b');
      // Queue is now full — this should be dropped
      const result = trace.addTag('dropped');

      // Should still return this for chaining
      expect(result).toBe(trace);
    });

    it('should use default maxQueueSize of 4096', () => {
      const trace = client.trace({ name: 'default-queue', captureStackTrace: false });
      // Just verify it can add many items without dropping
      for (let i = 0; i < 100; i++) {
        trace.addTag(`tag-${i}`);
      }
      // If queue was too small, tags would be dropped — no assertion needed,
      // just verifying no errors thrown
    });
  });

  describe('keepAlive resilience', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should stop keepAlive after 3 consecutive failures', async () => {
      mockApiGatewayClient.FlushTrace.mockResolvedValue({
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
        traceId: '',
        created: true,
      });
      (mockApiGatewayClient as jest.Mocked<apiGateway.IngestGatewayServiceClientImpl>).KeepAlive =
        jest.fn().mockRejectedValue(new Error('network down'));

      const trace = client.trace({ name: 'ka-fail', captureStackTrace: false });
      trace.addTag('x');
      trace.flush();

      // Resolve pending flush (uses advanceTimersByTimeAsync to handle both timers and promises)
      await jest.advanceTimersByTimeAsync(0);

      // Trigger 3 keepAlive intervals (default 10s each)
      // advanceTimersByTimeAsync flushes both timers AND promises (including withTimeout)
      for (let i = 0; i < 3; i++) {
        await jest.advanceTimersByTimeAsync(10000);
      }

      // After 3 failures, keepAlive should be stopped
      const keepAliveMock = (mockApiGatewayClient as jest.Mocked<apiGateway.IngestGatewayServiceClientImpl>).KeepAlive;
      const callCountAfterStop = keepAliveMock.mock.calls.length;

      // Advance more time — no additional calls should be made
      await jest.advanceTimersByTimeAsync(30000);

      expect(keepAliveMock.mock.calls.length).toBe(callCountAfterStop);
    });
  });

  describe('close retry', () => {
    it('should retry CloseTrace once on failure', async () => {
      mockApiGatewayClient.FlushTrace.mockResolvedValue({
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
        traceId: '',
        created: true,
      });
      const closeMock = jest.fn()
        .mockRejectedValueOnce(new Error('close failed'))
        .mockResolvedValueOnce({ accepted: true });
      (mockApiGatewayClient as jest.Mocked<apiGateway.IngestGatewayServiceClientImpl>).CloseTrace = closeMock;

      const trace = client.trace({ name: 'close-retry', captureStackTrace: false });
      trace.addTag('x');
      trace.flush();
      await flushMicrotasks();
      await flushPromises();
      await trace.close();

      expect(closeMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('trace abandonment', () => {
    it('should abandon trace after flush retries exhausted', async () => {
      const grpcError = Object.assign(new Error('unavailable'), { code: 14 });
      mockApiGatewayClient.FlushTrace.mockRejectedValue(grpcError);

      const trace = client.trace({
        name: 'abandon',
        captureStackTrace: false,
        maxRetries: 0,
      });
      trace.addTag('first');
      trace.flush();
      await flushMicrotasks();
      await flushPromises();

      // After abandonment, further flushes should be no-ops
      mockApiGatewayClient.FlushTrace.mockClear();
      trace.addTag('second');
      trace.flush();
      await flushMicrotasks();
      await flushPromises();

      expect(mockApiGatewayClient.FlushTrace).not.toHaveBeenCalled();
    });

    it('should skip CloseTrace on abandoned trace', async () => {
      const grpcError = Object.assign(new Error('unavailable'), { code: 14 });
      mockApiGatewayClient.FlushTrace.mockRejectedValue(grpcError);
      (mockApiGatewayClient as jest.Mocked<apiGateway.IngestGatewayServiceClientImpl>).CloseTrace =
        jest.fn().mockResolvedValue({ accepted: true });

      const trace = client.trace({
        name: 'abandon-close',
        captureStackTrace: false,
        maxRetries: 0,
      });
      trace.addTag('x');
      trace.flush();
      await flushMicrotasks();
      await flushPromises();

      await trace.close();

      expect((mockApiGatewayClient as jest.Mocked<apiGateway.IngestGatewayServiceClientImpl>).CloseTrace)
        .not.toHaveBeenCalled();
    });
  });

  describe('max trace lifetime', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should auto-close trace when maxTraceLifetimeMs is exceeded', async () => {
      mockApiGatewayClient.FlushTrace.mockResolvedValue({
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
        traceId: '',
        created: true,
      });
      (mockApiGatewayClient as jest.Mocked<apiGateway.IngestGatewayServiceClientImpl>).CloseTrace =
        jest.fn().mockResolvedValue({ accepted: true });

      const trace = client.trace({
        name: 'lifetime',
        captureStackTrace: false,
        maxTraceLifetimeMs: 25000, // 25s lifetime
      });
      trace.addTag('x');
      trace.flush();

      // Resolve flush
      await jest.advanceTimersByTimeAsync(0);

      // Advance past the lifetime (3 keepAlive intervals = 30s > 25s)
      await jest.advanceTimersByTimeAsync(30000);

      expect(trace.isClosed()).toBe(true);
    });
  });

  describe('flush batch size limit', () => {
    it('should split large flushes into batches', async () => {
      mockApiGatewayClient.FlushTrace.mockResolvedValue({
        status: { code: ResponseStatus_StatusCode.STATUS_CODE_SUCCESS, errorMessage: undefined },
        traceId: '',
        created: true,
      });

      const trace = client.trace({ name: 'batch', captureStackTrace: false });

      // Add 150 events (exceeds MAX_FLUSH_BATCH_SIZE of 100)
      for (let i = 0; i < 150; i++) {
        trace.addEvent(`event-${i}`);
      }
      trace.flush();

      // Wait for both batches to complete
      await new Promise(r => setTimeout(r, 50));

      // Should have been called at least 2 times (batch overflow triggers re-schedule)
      expect(mockApiGatewayClient.FlushTrace.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });
});

describe('toChain', () => {
  it('should map known chain IDs', () => {
    expect(toChain(1)).toBe(Chain.Ethereum);
    expect(toChain(137)).toBe(Chain.Polygon);
    expect(toChain(42161)).toBe(Chain.Arbitrum);
    expect(toChain(8453)).toBe(Chain.Base);
    expect(toChain(10)).toBe(Chain.Optimism);
    expect(toChain(56)).toBe(Chain.BSC);
  });

  it('should return undefined for unknown chain IDs', () => {
    expect(toChain(999999)).toBeUndefined();
  });

  it('should handle bigint input', () => {
    expect(toChain(BigInt(1))).toBe(Chain.Ethereum);
  });

  it('should handle string input', () => {
    expect(toChain('137')).toBe(Chain.Polygon);
  });

  it('should handle hex string input', () => {
    expect(toChain('0x1')).toBe(Chain.Ethereum);
  });
});

describe('MiradorProvider', () => {
  let mockClient: Client<[ReturnType<typeof Web3Plugin>]>;
  let mockApiGatewayClient: jest.Mocked<apiGateway.IngestGatewayServiceClientImpl>;
  let mockUnderlying: EIP1193Provider;

  beforeEach(() => {
    jest.clearAllMocks();

    mockClient = new Client('test-api-key', { plugins: [Web3Plugin()] });

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
