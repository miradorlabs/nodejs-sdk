/**
 * TypeScript interfaces for the Mirador Ingest SDK
 */

/**
 * Options for Client constructor
 */
export interface ClientOptions {
  /** Gateway URL (defaults to ingest-gateway-dev.mirador.org:443) */
  apiUrl?: string;
  /** Keep-alive ping interval in milliseconds (default: 10000) */
  keepAliveIntervalMs?: number;
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
  /** Capture stack trace at trace creation point */
  captureStackTrace?: boolean;
}

/**
 * Options for adding an event
 */
export interface AddEventOptions {
  /** Capture stack trace at the point where addEvent is called */
  captureStackTrace?: boolean;
}
