/**
 * TypeScript interfaces for the Parallax SDK
 */

/**
 * Options for ParallaxClient constructor
 */
export interface ParallaxClientOptions {
  /** Gateway URL (defaults to parallax-gateway-dev.mirador.org:443) */
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

