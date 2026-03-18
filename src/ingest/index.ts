/**
 * Mirador Ingest Node.js SDK
 */

// Classes
export { Client } from './client';
export { Trace, NoopTrace } from './trace';
export { MiradorProvider } from './provider';

// Stack trace utilities
export { captureStackTrace, formatStackTrace, formatStackTraceReadable } from './stacktrace';

// Plugin system + shared types (re-exported from @miradorlabs/plugins)
export { Web3Plugin, toChain, Chain, HintType } from '@miradorlabs/plugins';
export type {
  Web3PluginOptions,
  Web3Methods,
  EvmMethods,
  SafeNamespaceMethods,
  MiradorPlugin,
  TraceContext,
  PluginSetupResult,
  FlushBuilder,
  MergedPluginMethods,
  HintDataMap,
  HintTypeName,
  ChainName,
  ChainInput,
  TxHashHint,
  SafeMsgHintData,
  SafeTxHintData,
  EIP1193Provider,
  TxHintOptions,
  TransactionLike,
  TransactionRequest,
  AddEventOptions,
  Logger,
} from '@miradorlabs/plugins';

// SDK-specific types
export type {
  ClientOptions,
  TraceEvent,
  TraceOptions,
  StackFrame,
  StackTrace,
  MiradorProviderOptions,
  TraceCallbacks,
} from './types';
