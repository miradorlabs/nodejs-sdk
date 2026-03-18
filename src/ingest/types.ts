/**
 * TypeScript interfaces for the Mirador Ingest SDK
 */

// Import shared types used locally in this file
import type { Logger } from '@miradorlabs/plugins';

// Re-export shared types from plugins package
export {
  Chain,
  Severity,
  type ChainName,
  type ChainInput,
  type EIP1193Provider,
  type TxHintOptions,
  type TransactionLike,
  type TransactionRequest,
  type Logger,
  type TxHashHint,
  type SafeMsgHintData,
  type SafeTxHintData,
  type AddEventOptions,
} from '@miradorlabs/plugins';

/** Options for the MiradorProvider wrapper */
export interface MiradorProviderOptions {
  /** Bind to an existing trace instead of auto-creating per tx */
  trace?: import('./trace').Trace;
  /** Trace options for auto-created traces (ignored if trace is provided) */
  traceOptions?: TraceOptions;
}

/**
 * Lifecycle callbacks for observing trace events programmatically.
 */
export interface TraceCallbacks {
  /** Called once when the trace is first created on the server (first successful flush) */
  onCreated?: (traceId: string) => void;
  /** Called after a successful flush */
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
  /** Gateway URL (defaults to ingest.mirador.org:443) */
  apiUrl?: string;
  /** Keep-alive ping interval in milliseconds (default: 10000) */
  keepAliveIntervalMs?: number;
  /** Use SSL for gRPC connection (default: true, set false for local development) */
  useSsl?: boolean;
  /** Per-call timeout in milliseconds for gRPC operations (default: 5000) */
  callTimeoutMs?: number;
  /** Enable debug logging (default: false) */
  debug?: boolean;
  /** Custom logger implementation (defaults to no-op) */
  logger?: Logger;
  /** Default lifecycle callbacks for all traces (can be overridden per-trace) */
  callbacks?: TraceCallbacks;
  /** Sample rate for traces, between 0 and 1 (default: 1 = send all traces). */
  sampleRate?: number;
  /** Custom sampler function. Takes precedence over sampleRate when provided. Return true to sample (send) the trace. */
  sampler?: (options: TraceOptions) => boolean;
}

/**
 * An event to be recorded in a trace
 */
export interface TraceEvent {
  eventName: string;
  details?: string;
  timestamp: Date;
  severity?: Severity;
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
  /** Maximum number of retry attempts on failure (default: 2) */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff between retries (default: 500) */
  retryBackoff?: number;
  /** Whether to automatically start keep-alive pings. Defaults to true for new traces, false when resuming via traceId. */
  autoKeepAlive?: boolean;
  /** Maximum trace lifetime in milliseconds (default: 0 = disabled). Auto-closes trace after this duration. */
  maxTraceLifetimeMs?: number;
  /** Maximum number of items in the pending queue before dropping (default: 4096) */
  maxQueueSize?: number;
  /** Per-trace lifecycle callbacks (overrides client-level defaults) */
  callbacks?: TraceCallbacks;
}
