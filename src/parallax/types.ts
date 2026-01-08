/**
 * TypeScript interfaces for the Parallax SDK
 */

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
 * Maps chain names to proto Chain enum values
 */
export const CHAIN_MAP: Record<ChainName, number> = {
  ethereum: 1,  // CHAIN_ETHEREUM
  polygon: 2,   // CHAIN_POLYGON
  arbitrum: 3,  // CHAIN_ARBITRUM
  base: 4,      // CHAIN_BASE
  optimism: 5,  // CHAIN_OPTIMISM
  bsc: 6,       // CHAIN_BSC
};
