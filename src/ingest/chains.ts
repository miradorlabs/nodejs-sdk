/**
 * Plugin Chain enum to proto Chain enum mapping (SDK-specific, depends on proto package)
 */
import { Chain as ProtoChain } from '@miradorlabs/ingest-grpc/proto/gateway/ingest/v1/ingest_gateway';
import { Chain } from '@miradorlabs/plugins';

/**
 * Maps plugin Chain enum values to proto Chain enum values
 */
export const CHAIN_MAP: Record<Chain, ProtoChain> = {
  [Chain.Ethereum]: ProtoChain.CHAIN_ETHEREUM,
  [Chain.Optimism]: ProtoChain.CHAIN_OPTIMISM,
  [Chain.BSC]: ProtoChain.CHAIN_BSC,
  [Chain.Polygon]: ProtoChain.CHAIN_POLYGON,
  [Chain.Base]: ProtoChain.CHAIN_BASE,
  [Chain.Arbitrum]: ProtoChain.CHAIN_ARBITRUM,
  // HyperEVM has no entry in the deprecated proto Chain enum; gateway
  // resolves it via chain_id=999.
  [Chain.HyperEVM]: ProtoChain.CHAIN_UNSPECIFIED,
};
