/**
 * Plugin Chain enum to proto Chain enum mapping (SDK-specific, depends on proto package)
 */
import { Chain as ProtoChain } from 'mirador-gateway-ingest/proto/gateway/ingest/v1/ingest_gateway';
import { Chain } from '@miradorlabs/plugins';

/**
 * Maps plugin Chain enum values to proto Chain enum values
 */
export const CHAIN_MAP: Record<Chain, ProtoChain> = {
  [Chain.Ethereum]: ProtoChain.CHAIN_ETHEREUM,
  [Chain.Polygon]: ProtoChain.CHAIN_POLYGON,
  [Chain.Arbitrum]: ProtoChain.CHAIN_ARBITRUM,
  [Chain.Base]: ProtoChain.CHAIN_BASE,
  [Chain.Optimism]: ProtoChain.CHAIN_OPTIMISM,
  [Chain.BSC]: ProtoChain.CHAIN_BSC,
};
