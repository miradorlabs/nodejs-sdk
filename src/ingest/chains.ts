/**
 * Chain name to proto enum mapping (SDK-specific, depends on proto package)
 */
import { Chain } from 'mirador-gateway-ingest/proto/gateway/ingest/v1/ingest_gateway';
import type { ChainName } from '@miradorlabs/plugins';

/**
 * Maps chain names to proto Chain enum values
 */
export const CHAIN_MAP: Record<ChainName, Chain> = {
  ethereum: Chain.CHAIN_ETHEREUM,
  polygon: Chain.CHAIN_POLYGON,
  arbitrum: Chain.CHAIN_ARBITRUM,
  base: Chain.CHAIN_BASE,
  optimism: Chain.CHAIN_OPTIMISM,
  bsc: Chain.CHAIN_BSC,
};
