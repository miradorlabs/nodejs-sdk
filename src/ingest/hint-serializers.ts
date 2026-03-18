/**
 * Hint serializer registry for Node.js SDK (ts-proto interface-based API).
 * Maps hint type strings to functions that serialize hint data into TraceData.
 */
import type { TraceData } from 'mirador-gateway-ingest/proto/gateway/ingest/v1/ingest_gateway';
import { HintType } from '@miradorlabs/plugins';
import type { HintDataMap } from '@miradorlabs/plugins';
import { CHAIN_MAP } from './chains';

/** A function that serializes hint data into a TraceData object */
export type HintSerializer = (traceData: TraceData, data: Record<string, unknown>) => void;

/** Registry of hint serializers, keyed by hint type string */
export const HINT_SERIALIZERS: Record<string, HintSerializer> = {
  [HintType.TX_HASH]: (traceData, data) => {
    const hint = data as unknown as HintDataMap[typeof HintType.TX_HASH];
    traceData.txHashHints!.push({
      chain: CHAIN_MAP[hint.chain],
      txHash: hint.txHash,
      details: hint.details,
      timestamp: hint.timestamp,
    });
  },

  [HintType.SAFE_MSG]: (traceData, data) => {
    const hint = data as unknown as HintDataMap[typeof HintType.SAFE_MSG];
    traceData.safeMsgHints!.push({
      chain: CHAIN_MAP[hint.chain],
      messageHash: hint.messageHash,
      details: hint.details,
      timestamp: hint.timestamp,
    });
  },

  [HintType.SAFE_TX]: (traceData, data) => {
    const hint = data as unknown as HintDataMap[typeof HintType.SAFE_TX];
    traceData.safeTxHints!.push({
      chain: CHAIN_MAP[hint.chain],
      safeTxHash: hint.safeTxHash,
      details: hint.details,
      timestamp: hint.timestamp,
    });
  },
};
