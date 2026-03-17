/**
 * EIP-1193 Provider wrapper that auto-captures transaction data for Mirador traces.
 * Requires Web3Plugin to be registered on the Client.
 */
import type { EIP1193Provider, EvmMethods } from '@miradorlabs/plugins';
import type { MiradorProviderOptions, TraceOptions } from './types';
import type { Trace } from './trace';

/** Minimal Client interface needed by MiradorProvider */
interface TraceFactory {
  trace(options?: TraceOptions): Trace;
}

type Web3Trace = Trace & { web3: { evm: EvmMethods } };

export class MiradorProvider implements EIP1193Provider {
  private underlying: EIP1193Provider;
  private client: TraceFactory;
  private boundTrace: Web3Trace | null;
  private traceOptions?: TraceOptions;

  constructor(underlying: EIP1193Provider, client: TraceFactory, options?: MiradorProviderOptions) {
    this.underlying = underlying;
    this.client = client;
    this.boundTrace = (options?.trace as Web3Trace) ?? null;
    this.traceOptions = options?.traceOptions;
  }

  async request(args: { method: string; params?: unknown[] }): Promise<unknown> {
    if (args.method === 'eth_sendTransaction' || args.method === 'eth_sendRawTransaction') {
      return this.interceptSendTransaction(args);
    }
    return this.underlying.request(args);
  }

  private async interceptSendTransaction(args: { method: string; params?: unknown[] }): Promise<unknown> {
    const trace = (this.boundTrace ?? this.client.trace(this.traceOptions)) as Web3Trace;

    // Runtime check: ensure Web3Plugin is registered
    if (!trace.web3?.evm || typeof trace.web3.evm.setProvider !== 'function') {
      throw new Error(
        '[MiradorProvider] Web3Plugin is required. Register it with Client: ' +
        'new Client(key, { plugins: [Web3Plugin()] })'
      );
    }

    trace.web3.evm.setProvider(this.underlying);

    const txParams = args.params?.[0] as Record<string, unknown> | undefined;

    try {
      const result = await this.underlying.request(args);
      const txHash = result as string;

      if (args.method === 'eth_sendTransaction' && txParams) {
        const chain = trace.web3.evm.resolveChain(undefined, txParams.chainId as number | string | undefined);
        if (txParams.data) {
          trace.web3.evm.addInputData(txParams.data as string);
        }
        trace.web3.evm.addTxHint(txHash, chain);
      } else {
        const providerChain = trace.web3.evm.getProviderChain();
        if (providerChain) {
          trace.web3.evm.addTxHint(txHash, providerChain);
        }
      }

      trace.addEvent('tx:sent', { txHash, method: args.method });
      return result;
    } catch (err) {
      const error = err as Error & { code?: unknown; data?: unknown };
      trace.addEvent('tx:error', {
        message: error.message,
        code: error.code,
        data: error.data,
        method: args.method,
      });
      throw err;
    }
  }
}
