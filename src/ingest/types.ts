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
 * Options for Client constructor
 */
export interface ClientOptions {
  /** Gateway URL (defaults to ingest-gateway-dev.mirador.org:443) */
  apiUrl?: string;
  /** Keep-alive ping interval in milliseconds (default: 10000) */
  keepAliveIntervalMs?: number;
  /** EIP-1193 provider to use for transaction operations */
  provider?: EIP1193Provider;
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
  /** Capture stack trace at trace creation point (default: true) */
  captureStackTrace?: boolean;
  /** Maximum number of retry attempts on failure (default: 3) */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff between retries (default: 1000) */
  retryBackoff?: number;
  /** EIP-1193 provider to use for transaction operations */
  provider?: EIP1193Provider;
}

/**
 * Options for adding an event
 */
export interface AddEventOptions {
  /** Capture stack trace at the point where addEvent is called */
  captureStackTrace?: boolean;
}
