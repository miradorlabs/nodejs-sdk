// API key prefix validation (nodejs-sdk)
import { Client, NoopTrace, MiradorApiKeyError, WEB_KEY_PREFIX, SERVER_KEY_PREFIX } from '../src/ingest';
import * as apiGateway from '@miradorlabs/ingest-grpc/proto/gateway/ingest/v1/ingest_gateway';

jest.mock('../src/grpc');

const VALID_KEY = `${SERVER_KEY_PREFIX}abc123`;

let mockGrpcClient: { FlushTrace: jest.Mock; KeepAlive: jest.Mock; CloseTrace: jest.Mock };

beforeEach(() => {
  jest.clearAllMocks();
  mockGrpcClient = {
    FlushTrace: jest.fn().mockResolvedValue({ status: undefined }),
    KeepAlive: jest.fn().mockResolvedValue({ accepted: true }),
    CloseTrace: jest.fn().mockResolvedValue({ accepted: true }),
  };
  jest
    .spyOn(apiGateway, 'IngestGatewayServiceClientImpl')
    .mockImplementation(() => mockGrpcClient as unknown as apiGateway.IngestGatewayServiceClientImpl);
});

describe('accepts a valid server key', () => {
  it('constructs without throwing', () => {
    expect(() => new Client(VALID_KEY)).not.toThrow();
    expect(new Client(VALID_KEY).apiKey).toBe(VALID_KEY);
  });
});

describe('rejects a malformed key', () => {
  it.each([
    ['a bare word', 'not-a-key'],
    ['a truncated key', 'mir_'],
    ['a wrong-product key', 'sk_live_abc123'],
    ['whitespace-wrapped junk', '  garbage  '],
  ])('throws MiradorApiKeyError for %s', (_label, key) => {
    expect(() => new Client(key)).toThrow(MiradorApiKeyError);
    expect(() => new Client(key)).toThrow(/expected it to start with "mir_srv_"/);
  });

  it('does not leak the full key in the error message', () => {
    const secretish = 'super-secret-value-that-should-not-appear';
    try {
      new Client(secretish);
      throw new Error('expected constructor to throw');
    } catch (err) {
      expect((err as Error).message).not.toContain(secretish);
      expect((err as Error).message).toContain('(41 chars)');
    }
  });
});

describe('rejects a stringified unset env var', () => {
  it.each(['undefined', 'null'])('throws a targeted error for "%s"', (key) => {
    expect(() => new Client(key)).toThrow(MiradorApiKeyError);
    expect(() => new Client(key)).toThrow(/unset environment variable was stringified/);
  });
});

describe('rejects a web key on the server', () => {
  it('throws with an origin-validation message', () => {
    const webKey = `${WEB_KEY_PREFIX}abc123`;
    expect(() => new Client(webKey)).toThrow(MiradorApiKeyError);
    expect(() => new Client(webKey)).toThrow(/validates web keys against the browser origin/);
  });
});

describe('disables tracing when no key is supplied', () => {
  it.each([
    ['undefined', undefined],
    ['empty string', ''],
    ['whitespace only', '   '],
  ])('does not throw for %s', (_label, key) => {
    expect(() => new Client(key)).not.toThrow();
  });

  it('warns exactly once via the configured logger', () => {
    const logger = { debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
    new Client(undefined, { logger });
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('tracing is disabled'));
  });

  it('returns a NoopTrace from trace()', () => {
    const client = new Client();
    expect(client.trace({ name: 'Test' })).toBeInstanceOf(NoopTrace);
  });

  it('no-ops the internal RPCs instead of calling the gateway', async () => {
    const client = new Client();

    await expect(client._keepAlive({ traceId: 'abc' })).resolves.toEqual({ accepted: false });
    await expect(client._closeTrace({ traceId: 'abc' } as never)).resolves.toEqual({ accepted: false });

    expect(mockGrpcClient.KeepAlive).not.toHaveBeenCalled();
    expect(mockGrpcClient.CloseTrace).not.toHaveBeenCalled();
    expect(mockGrpcClient.FlushTrace).not.toHaveBeenCalled();
  });
});
