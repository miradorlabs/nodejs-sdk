/**
 * Hint serializer registry for Node.js SDK (ts-proto interface-based API).
 * Maps hint type strings to functions that serialize hint data into FlushTraceData.
 */
import type { FlushTraceData, FlushTraceData_Plugin } from 'mirador-gateway-ingest/proto/gateway/ingest/v1/ingest_gateway';
import { HintType } from '@miradorlabs/plugins';
import type { HintDataMap } from '@miradorlabs/plugins';
import { CHAIN_MAP } from './chains';

/** A function that serializes hint data into a FlushTraceData object */
export type HintSerializer = (traceData: FlushTraceData, data: Record<string, unknown>) => void;

/** Registry of hint serializers, keyed by hint type string */
export const HINT_SERIALIZERS: Record<string, HintSerializer> = {
  [HintType.TX_HASH]: (traceData, data) => {
    const hint = data as unknown as HintDataMap[typeof HintType.TX_HASH];
    const plugin: FlushTraceData_Plugin = {
      txHashHints: {
        chain: CHAIN_MAP[hint.chain],
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
        chain: CHAIN_MAP[hint.chain],
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
        chain: CHAIN_MAP[hint.chain],
        chainId: hint.chain,
        safeTxHash: hint.safeTxHash,
        details: hint.details,
        timestamp: hint.timestamp,
      },
    };
    traceData.plugins.push(plugin);
  },
};
