/**
 * TypeScript interfaces for the Mirador Ingest SDK
 */

/** EIP-1193 compatible provider interface */
export interface EIP1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

/** Options for addTxHint (extends current string details) */
export interface TxHintOptions {
  /** Transaction input data / calldata */
  input?: string;
  /** Additional details string */
  details?: string;
}

/** A transaction-like object (matches ethers/viem/raw RPC response shapes) */
export interface TransactionLike {
  hash: string;
  data?: string;
  input?: string;
  chainId?: number | bigint | string;
}

/** Transaction parameters for sendTransaction (EIP-1193 style) */
export interface TransactionRequest {
  from: string;
  to?: string;
  data?: string;
  value?: string | bigint;
  gas?: string | bigint;
  gasPrice?: string | bigint;
  maxFeePerGas?: string | bigint;
  maxPriorityFeePerGas?: string | bigint;
  nonce?: number | string;
  chainId?: number | string;
}

/** Options for the MiradorProvider wrapper */
export interface MiradorProviderOptions {
  /** Bind to an existing trace instead of auto-creating per tx */
  trace?: unknown;
  /** Trace options for auto-created traces (ignored if trace is provided) */
  traceOptions?: TraceOptions;
}

/**
 * Logger interface for configurable SDK logging.
 * Defaults to console methods unless overridden.
 */
export interface Logger {
  debug(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

/**
 * Lifecycle callbacks for observing trace events programmatically.
 */
export interface TraceCallbacks {
  /** Called after a trace is successfully created on the server */
  onCreated?: (traceId: string) => void;
  /** Called after a successful flush (create or update) */
  onFlushed?: (traceId: string, itemCount: number) => void;
  /** Called when a flush operation fails after retries */
  onFlushError?: (error: Error, operation: string) => void;
  /** Called when the trace is closed */
  onClosed?: (traceId: string, reason?: string) => void;
  /** Called when items are dropped (e.g., queue full) */
  onDropped?: (count: number, reason: string) => void;
}

/**
 * Options for Client constructor
 */
export interface ClientOptions {
  /** Gateway URL (defaults to ingest-gateway-dev.mirador.org:443) */
  apiUrl?: string;
  /** Keep-alive ping interval in milliseconds (default: 10000) */
  keepAliveIntervalMs?: number;
  /** EIP-1193 provider to use for transaction operations */
  provider?: EIP1193Provider;
  /** Use SSL for gRPC connection (default: true, set false for local development) */
  useSsl?: boolean;
  /** Per-call timeout in milliseconds for gRPC operations (default: 5000) */
  callTimeoutMs?: number;
  /** Enable debug logging (default: false) */
  debug?: boolean;
  /** Custom logger implementation (defaults to console) */
  logger?: Logger;
  /** Default lifecycle callbacks for all traces (can be overridden per-trace) */
  callbacks?: TraceCallbacks;
  /** Sample rate for traces, between 0 and 1 (default: 1 = send all traces). */
  sampleRate?: number;
  /** Custom sampler function. Takes precedence over sampleRate when provided. Return true to sample (send) the trace. */
  sampler?: (options: TraceOptions) => boolean;
}

/**
 * Supported chain names (maps to Chain enum in proto)
 */
export type ChainName = 'ethereum' | 'polygon' | 'arbitrum' | 'base' | 'optimism' | 'bsc';

/**
 * An event to be recorded in a trace
 */
export interface TraceEvent {
  eventName: string;
  details?: string;
  timestamp: Date;
}

/**
 * Transaction hash hint for blockchain correlation
 */
export interface TxHashHint {
  txHash: string;
  chain: ChainName;
  details?: string;
  timestamp: Date;
}

/**
 * Safe message hint for Safe multisig message tracking
 */
export interface SafeMsgHintData {
  messageHash: string;
  chain: ChainName;
  details?: string;
  timestamp: Date;
}

/**
 * A single frame in a stack trace
 */
export interface StackFrame {
  /** Function or method name */
  functionName: string;
  /** File path */
  fileName: string;
  /** Line number */
  lineNumber: number;
  /** Column number */
  columnNumber: number;
}

/**
 * A captured stack trace
 */
export interface StackTrace {
  /** Array of stack frames (top of stack first) */
  frames: StackFrame[];
  /** Raw stack string from Error.stack */
  raw: string;
}

/**
 * Options for creating a trace
 */
export interface TraceOptions {
  /** Trace name */
  name?: string;
  /** Resume an existing trace by ID (e.g., passed from frontend SDK) */
  traceId?: string;
  /** Capture stack trace at trace creation point (default: true) */
  captureStackTrace?: boolean;
  /** Maximum number of retry attempts on failure (default: 3) */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff between retries (default: 1000) */
  retryBackoff?: number;
  /** EIP-1193 provider to use for transaction operations */
  provider?: EIP1193Provider;
  /** Whether to automatically start keep-alive pings. Defaults to true for new traces, false when resuming via traceId. */
  autoKeepAlive?: boolean;
  /** Maximum trace lifetime in milliseconds (default: 0 = disabled). Auto-closes trace after this duration. */
  maxTraceLifetimeMs?: number;
  /** Maximum number of items in the pending queue before dropping (default: 4096) */
  maxQueueSize?: number;
  /** Per-trace lifecycle callbacks (overrides client-level defaults) */
  callbacks?: TraceCallbacks;
}

/**
 * Options for adding an event
 */
export interface AddEventOptions {
  /** Capture stack trace at the point where addEvent is called */
  captureStackTrace?: boolean;
}
