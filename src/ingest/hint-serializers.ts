/**
 * Hint serializer registry for Node.js SDK (ts-proto interface-based API).
 * Maps hint type strings to functions that serialize hint data into FlushTraceData.
 */
import type { FlushTraceData, FlushTraceData_Plugin } from 'mirador-gateway-ingest/proto/gateway/ingest/v1/ingest_gateway';
import { HintType } from '@miradorlabs/plugins';
import type { HintDataMap } from '@miradorlabs/plugins';
import { Chain as ProtoChain } from 'mirador-gateway-ingest/proto/gateway/ingest/v1/ingest_gateway';
import { CHAIN_MAP } from './chains';

/** A function that serializes hint data into a FlushTraceData object */
export type HintSerializer = (traceData: FlushTraceData, data: Record<string, unknown>) => void;

/** Resolve chain with bounds check, falling back to CHAIN_UNSPECIFIED */
function resolveProtoChain(chain: number): ProtoChain {
  return CHAIN_MAP[chain as keyof typeof CHAIN_MAP] ?? ProtoChain.CHAIN_UNSPECIFIED;
}

/** Registry of hint serializers, keyed by hint type string */
export const HINT_SERIALIZERS: Record<string, HintSerializer> = {
  [HintType.TX_HASH]: (traceData, data) => {
    const hint = data as unknown as HintDataMap[typeof HintType.TX_HASH];
    const plugin: FlushTraceData_Plugin = {
      txHashHints: {
        chain: resolveProtoChain(hint.chain),
        chainId: hint.chain,
        txHash: hint.txHash,
        details: hint.details,
        timestamp: hint.timestamp,
      },
    };
    traceData.plugins.push(plugin);
  },

  [HintType.SAFE_MSG]: (traceData, data) => {
    const hint = data as unknown as HintDataMap[typeof HintType.SAFE_MSG];
    const plugin: FlushTraceData_Plugin = {
      safeMsgHints: {
        chain: resolveProtoChain(hint.chain),
        chainId: hint.chain,
        messageHash: hint.messageHash,
        details: hint.details,
        timestamp: hint.timestamp,
      },
    };
    traceData.plugins.push(plugin);
  },

  [HintType.SAFE_TX]: (traceData, data) => {
    const hint = data as unknown as HintDataMap[typeof HintType.SAFE_TX];
    const plugin: FlushTraceData_Plugin = {
      safeTxHints: {
        chain: resolveProtoChain(hint.chain),
        chainId: hint.chain,
        safeTxHash: hint.safeTxHash,
        details: hint.details,
        timestamp: hint.timestamp,
      },
    };
    traceData.plugins.push(plugin);
  },

  [HintType.RELAY_QUOTE]: (traceData, data) => {
    const hint = data as unknown as HintDataMap[typeof HintType.RELAY_QUOTE];
    const plugin: FlushTraceData_Plugin = {
      relayHints: {
        requestId: hint.requestId,
        details: encodeRelayQuoteDetails(hint),
        timestamp: hint.timestamp,
      },
    };
    traceData.plugins.push(plugin);
  },
};

/**
 * Encode a RelayQuoteHintData snapshot into the snake_case JSON payload the
 * relayhint backend processor expects in `RelayHint.details`. Only fields
 * with values are emitted, but `origin_chain_id` and `destination_chain_id`
 * are always included (the processor rejects payloads without them). Keys
 * mirror `recoveryQuoteDetails` in mirador-platform.
 */
function encodeRelayQuoteDetails(
  hint: HintDataMap[typeof HintType.RELAY_QUOTE],
): string {
  const payload: Record<string, string | number> = {
    origin_chain_id: Number(hint.originChainId),
    dest_chain_id: Number(hint.destChainId),
  };
  if (hint.orderId) payload.order_id = hint.orderId;
  if (hint.onChainId) payload.on_chain_id = hint.onChainId;
  if (hint.originChainName) payload.origin_chain_name = hint.originChainName;
  if (hint.destChainName) payload.dest_chain_name = hint.destChainName;
  if (hint.originCurrency) payload.origin_currency = hint.originCurrency;
  if (hint.destCurrency) payload.dest_currency = hint.destCurrency;
  if (hint.depositor) payload.depositor = hint.depositor;
  if (hint.recipient) payload.recipient = hint.recipient;
  if (hint.solverAddress) payload.solver_address = hint.solverAddress;
  if (hint.depositoryAddress) payload.depository_address = hint.depositoryAddress;
  if (hint.originAmount) payload.origin_amount = hint.originAmount;
  if (hint.destExpectedAmount) payload.dest_expected_amount = hint.destExpectedAmount;
  if (hint.destMinimumAmount) payload.dest_minimum_amount = hint.destMinimumAmount;
  return JSON.stringify(payload);
}
