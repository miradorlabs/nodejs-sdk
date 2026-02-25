/**
 * EIP-1193 Provider wrapper that auto-captures transaction data for Mirador traces
 */
import type { EIP1193Provider, MiradorProviderOptions, TraceOptions } from './types';
import type { Client } from './client';
import type { Trace } from './trace';

export class MiradorProvider implements EIP1193Provider {
  private underlying: EIP1193Provider;
  private client: Client;
  private boundTrace: Trace | null;
  private traceOptions?: TraceOptions;

  constructor(underlying: EIP1193Provider, client: Client, options?: MiradorProviderOptions) {
    this.underlying = underlying;
    this.client = client;
    this.boundTrace = (options?.trace as Trace) ?? null;
    this.traceOptions = options?.traceOptions;
  }

  async request(args: { method: string; params?: unknown[] }): Promise<unknown> {
    if (args.method === 'eth_sendTransaction' || args.method === 'eth_sendRawTransaction') {
      return this.interceptSendTransaction(args);
    }
    return this.underlying.request(args);
  }

  private async interceptSendTransaction(args: { method: string; params?: unknown[] }): Promise<unknown> {
    const trace = this.boundTrace ?? this.client.trace(this.traceOptions);
    trace.setProvider(this.underlying);

    const txParams = args.params?.[0] as Record<string, unknown> | undefined;

    try {
      const result = await this.underlying.request(args);
      const txHash = result as string;

      if (args.method === 'eth_sendTransaction' && txParams) {
        const chain = trace.resolveChain(undefined, txParams.chainId as number | string | undefined);
        trace.addTxHint(txHash, chain, {
          input: txParams.data as string | undefined,
        });
      } else {
        const providerChain = trace.getProviderChain();
        if (providerChain) {
          trace.addTxHint(txHash, providerChain);
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
