/**
 * Chain ID to chain name mapping utilities
 */
import type { ChainName } from './types';

/**
 * Maps EVM chain IDs to Mirador chain names
 */
const CHAIN_ID_MAP: Record<number, ChainName> = {
  1: 'ethereum',
  137: 'polygon',
  42161: 'arbitrum',
  8453: 'base',
  10: 'optimism',
  56: 'bsc',
};

/**
 * Convert a chain ID to a Mirador ChainName
 * @param chainId Chain ID as number, bigint, or hex string
 * @returns The ChainName or undefined if not recognized
 */
export function chainIdToName(chainId: number | bigint | string): ChainName | undefined {
  return CHAIN_ID_MAP[Number(chainId)];
}
