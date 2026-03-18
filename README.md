# Mirador Ingest Node.js SDK

Node.js SDK for the Mirador tracing platform. This package provides a server-side client using gRPC to interact with the Mirador Ingest Gateway API.

## Installation

```bash
npm install @miradorlabs/nodejs-sdk
```

## Features

- **Auto-Flush** - Builder methods automatically batch and send data via microtask scheduling
- **Fluent Builder Pattern** - Method chaining for creating traces
- **Keep-Alive** - Automatic periodic pings with in-flight guard, single retry, and auto-stop after 3 consecutive failures
- **Trace Lifecycle** - Explicit close trace method with automatic cleanup and flush queue draining
- **Blockchain Integration** - Built-in support for correlating traces with blockchain transactions
- **Stack Trace Capture** - Automatic capture at trace creation (default: on) or manual capture via `addStackTrace()`
- **TypeScript Support** - Full type definitions included
- **Strict Ordering** - Flush calls maintain strict ordering even when async
- **Cross-SDK Trace Sharing** - Resume traces across frontend and backend SDKs
- **Safe Multisig Tracking** - Track Safe message and transaction confirmations via `web3.safe.addMsgHint()` and `web3.safe.addTxHint()`
- **EIP-1193 Provider Integration** - Send transactions directly through traces with `sendTransaction()`
- **Configurable Logger** - Pluggable `Logger` interface (defaults to no-op; enable with `debug: true` or provide custom logger)
- **Lifecycle Callbacks** - `TraceCallbacks` for observing flush success/failure, close, and dropped items
- **Sampling** - `sampleRate` (0-1) or custom `sampler` function; sampled-out traces return `NoopTrace`
- **Rate Limiting** - Automatic 30s client-wide backoff on `RESOURCE_EXHAUSTED` (gRPC code 8)
- **Retry with Jitter** - Full jitter backoff (`random(0, base * 2^attempt)`) on retryable gRPC errors
- **Queue Size Limits** - Configurable `maxQueueSize` (default 4096) with `onDropped` callback
- **Flush Batch Splitting** - Large flushes automatically split at 100 items with overflow re-scheduling
- **Trace Abandonment** - After retry exhaustion, trace stops all API calls to prevent runaway retries
- **Max Trace Lifetime** - Optional `maxTraceLifetimeMs` to auto-close long-running traces
- **Call Timeout** - Per-call `callTimeoutMs` (default 5000ms) wrapping all gRPC operations

## Quick Start

```typescript
import { Client } from '@miradorlabs/nodejs-sdk';

const client = new Client('your-api-key');

const trace = client.trace({ name: 'SwapExecution' })
  .addAttribute('from', '0xabc...')
  .addAttribute('slippage', { bps: 50, tolerance: 'auto' })  // objects are stringified
  .addTags(['dex', 'swap'])
  .addEvent('quote_received', { provider: 'Uniswap' })
  .addEvent('transaction_signed')
  .web3.evm.addTxHint('0xtxhash...', 'ethereum');
// Data is auto-flushed at the end of the current JS tick.
// Call trace.close() when the trace is complete.

// ... later, when done with the trace
await trace.close('Transaction completed');
```

## API Reference

### Client

The main client for interacting with the Mirador Ingest Gateway.

#### Constructor

```typescript
new Client(apiKey?: string, options?: ClientOptions)
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `apiKey` | `string` | No | API key for authentication (sent as `x-ingest-api-key` header) |
| `options` | `ClientOptions` | No | Configuration options |

#### Options

```typescript
interface ClientOptions {
  apiUrl?: string;              // Gateway URL (defaults to ingest.mirador.org:443)
  keepAliveIntervalMs?: number; // Keep-alive ping interval in milliseconds (default: 10000)
  provider?: EIP1193Provider;   // EIP-1193 provider for transaction operations
  useSsl?: boolean;             // Use SSL for gRPC connection (default: true, set false for local dev)
  callTimeoutMs?: number;       // Per-call timeout for gRPC operations (default: 5000)
  debug?: boolean;              // Enable debug logging via console (default: false)
  logger?: Logger;              // Custom logger implementation (defaults to no-op)
  callbacks?: TraceCallbacks;   // Default lifecycle callbacks for all traces
  sampleRate?: number;          // Sample rate 0-1 (default: 1 = send all)
  sampler?: (options: TraceOptions) => boolean; // Custom sampler (overrides sampleRate)
}
```

#### Methods

##### `trace(options?)`

Creates a new trace builder.

```typescript
const trace = client.trace({ name: 'MyTrace' });
const trace = client.trace();  // name is optional

// Stack trace capture is enabled by default - to disable:
const trace = client.trace({ name: 'MyTrace', captureStackTrace: false });
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | `string` | `undefined` | Optional name of the trace |
| `traceId` | `string` | auto-generated | Resume an existing trace by ID, or auto-generated W3C trace ID (32 hex chars) |
| `captureStackTrace` | `boolean` | `true` | Capture stack trace at trace creation point |
| `maxRetries` | `number` | `2` | Maximum retry attempts on retryable gRPC errors |
| `retryBackoff` | `number` | `500` | Base delay in ms for full jitter backoff |
| `provider` | `EIP1193Provider` | `undefined` | EIP-1193 provider for transaction operations |
| `autoKeepAlive` | `boolean` | `true`/`false` | Auto keep-alive (default: true for new, false when resuming) |
| `maxTraceLifetimeMs` | `number` | `0` | Max trace lifetime in ms (0 = disabled). Auto-closes trace after this duration |
| `maxQueueSize` | `number` | `4096` | Max pending items before dropping |
| `callbacks` | `TraceCallbacks` | `undefined` | Per-trace lifecycle callbacks (overrides client-level) |

> **Note:** A W3C-compatible trace ID (32 hex chars) is automatically generated when you call `client.trace()`. If you pass `traceId`, the trace resumes an existing trace instead.

Returns: `Trace` builder instance (or `NoopTrace` if sampled out)

### Trace (Builder)

Fluent builder for constructing traces. All methods return `this` for chaining.

#### `addAttribute(key, value)`

Add a single attribute. Objects are automatically stringified.

```typescript
trace.addAttribute('user', '0xabc...')
     .addAttribute('amount', 1.5)
     .addAttribute('config', { slippage: 50, deadline: 300 })  // stringified to JSON
```

#### `addAttributes(attrs)`

Add multiple attributes at once. Objects are automatically stringified.

```typescript
trace.addAttributes({
  from: '0xabc...',
  to: '0xdef...',
  value: 1.0,
  metadata: { source: 'api', version: '1.0' }  // stringified to JSON
})
```

#### `addTag(tag)` / `addTags(tags)`

Add tags to categorize the trace.

```typescript
trace.addTag('transaction')
     .addTags(['ethereum', 'send'])
```

#### `addEvent(name, details?, options?)`

Add an event with optional details (string or object) and optional settings.

```typescript
trace.addEvent('wallet_connected', { wallet: 'MetaMask' })
     .addEvent('transaction_initiated')
     .addEvent('transaction_confirmed', { blockNumber: 12345 })

// With stack trace - captures where in your code the event was added
trace.addEvent('error_occurred', { code: 500 }, { captureStackTrace: true })

// Legacy: timestamp can still be passed as third parameter for backward compatibility
trace.addEvent('custom_event', 'details', new Date())
```

| Parameter | Type                       | Description                                         |
|-----------|----------------------------|-----------------------------------------------------|
| `name`    | `string`                   | Event name                                          |
| `details` | `string \| object`         | Optional event details (objects are stringified)    |
| `options` | `AddEventOptions \| Date`  | Options with `captureStackTrace`, or legacy Date    |

#### `addStackTrace(eventName?, additionalDetails?)`

Capture and add the current stack trace as an event. Useful for debugging or tracking code paths.

```typescript
trace.addStackTrace()  // Creates event named "stack_trace"
trace.addStackTrace('checkpoint', { stage: 'validation' })
```

| Parameter           | Type     | Description                                      |
|---------------------|----------|--------------------------------------------------|
| `eventName`         | `string` | Event name (defaults to "stack_trace")           |
| `additionalDetails` | `object` | Optional additional details to include           |

#### `addExistingStackTrace(stackTrace, eventName?, additionalDetails?)`

Add a previously captured stack trace as an event. Useful when you need to capture a stack trace at one point but record it later.

```typescript
import { captureStackTrace } from '@miradorlabs/nodejs-sdk';

// Capture stack trace now
const stack = captureStackTrace();

// ... later ...
trace.addExistingStackTrace(stack, 'deferred_location', { reason: 'async operation' })
```

| Parameter           | Type         | Description                                      |
|---------------------|--------------|--------------------------------------------------|
| `stackTrace`        | `StackTrace` | Previously captured stack trace                  |
| `eventName`         | `string`     | Event name (defaults to "stack_trace")           |
| `additionalDetails` | `object`     | Optional additional details to include           |

#### Web3Plugin Methods

The following methods are available when `Web3Plugin` is registered. They are accessed via the `web3.evm` and `web3.safe` namespaces on the trace.

##### `web3.evm.addTxHint(txHash, chain, options?)`

Add a transaction hash hint for blockchain correlation. Accepts `Chain` enum or chain name string.

```typescript
import { Chain } from '@miradorlabs/nodejs-sdk';

trace.web3.evm.addTxHint('0x123...', Chain.Ethereum, 'Main transaction');
trace.web3.evm.addTxHint('0x456...', 'polygon', 'Bridge transaction'); // string also works
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `txHash` | `string` | Transaction hash |
| `chain` | `Chain \| ChainName` | Chain enum value or name string |
| `options` | `string \| TxHintOptions` | Optional details string, or options with `input` and `details` |

##### `web3.safe.addMsgHint(msgHash, chain, details?)`

Add a Safe message hint for tracking Safe multisig message confirmations.

```typescript
trace.web3.safe.addMsgHint('0xmsgHash...', Chain.Ethereum);
trace.web3.safe.addMsgHint('0xotherHash...', Chain.Base, 'Token approval');
```

##### `web3.safe.addTxHint(safeTxHash, chain, details?)`

Add a Safe transaction hint for tracking Safe multisig transaction executions.

```typescript
trace.web3.safe.addTxHint('0xsafeTxHash...', Chain.Ethereum);
trace.web3.safe.addTxHint('0xotherHash...', Chain.Base, 'Token transfer');
```

##### `web3.evm.addTx(tx, chain?)`

Add a transaction object, automatically extracting hash, chain, and input data.

```typescript
const tx = await wallet.sendTransaction({ to, data });
trace.web3.evm.addTx(tx, Chain.Ethereum);

// Chain inferred from tx.chainId if not provided
trace.web3.evm.addTx({ hash: txHash, data: calldata, chainId: 1 });
```

##### `web3.evm.sendTransaction(tx, provider?)`

Send a transaction through the trace's EIP-1193 provider, automatically capturing events (`tx:send`, `tx:sent`, `tx:error`), input data, and tx hint.

```typescript
const client = new Client('key', { plugins: [Web3Plugin({ provider: myProvider })] });
const trace = client.trace({ name: 'Swap' });

const txHash = await trace.web3.evm.sendTransaction({
  from: '0xabc...',
  to: '0xRouterAddress...',
  data: '0x38ed1739...',
});
```

##### `web3.evm.setProvider(provider)`

Set an EIP-1193 provider for transaction operations. Automatically detects chain ID.

```typescript
trace.web3.evm.setProvider(myProvider);
```

##### `web3.evm.addInputData(inputData)`

Add transaction input data (calldata) as a trace event.

```typescript
trace.web3.evm.addInputData('0xa9059cbb000000000000000000000000...')
```

#### `flush()`

Send pending data to the gateway. Fire-and-forget — returns immediately but maintains strict ordering internally.

Each flush sends `FlushTrace` (an idempotent create-or-update RPC).

```typescript
trace.addEvent('important_milestone');
trace.flush();  // Send immediately
```

Returns: `void`

> **Note:** Builder methods automatically call `flush()` via microtask scheduling, so you rarely need to call it manually. All synchronous builder calls within the same JS tick are batched into a single flush.

#### `getTraceId()`

Get the trace ID. Available immediately — trace IDs are generated client-side (W3C-compatible, 32 hex chars).

```typescript
const traceId = trace.getTraceId();  // string (always available)
```

Returns: `string`

#### `close(reason?)`

Close the trace and stop all timers. Flushes any pending data before sending the close request. After calling this method, all subsequent operations will be ignored.

```typescript
await trace.close();
await trace.close('User completed workflow');
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `reason` | `string` | Optional reason for closing the trace |

Returns: `Promise<void>`

**Important:** Once a trace is closed:
- All method calls (`addAttribute`, `addEvent`, `addTag`, `web3.evm.addTxHint`, `web3.safe.addMsgHint`, `web3.safe.addTxHint`) will be ignored with a warning
- The keep-alive timer will be stopped
- Any pending data will be flushed, then a close request will be sent to the server

#### `isClosed()`

Check if the trace has been closed.

```typescript
const closed = trace.isClosed();  // boolean
```

Returns: `boolean`

## Logger

By default, the SDK silences all log output. Enable logging with `debug: true` for console output, or provide a custom `Logger`:

```typescript
// Debug mode - logs to console.debug/warn/error
const client = new Client('key', { debug: true });

// Custom logger (e.g., winston, pino)
const client = new Client('key', {
  logger: {
    debug: (...args) => pino.debug(...args),
    warn:  (...args) => pino.warn(...args),
    error: (...args) => pino.error(...args),
  },
});
```

## Lifecycle Callbacks (TraceCallbacks)

Observe trace lifecycle events programmatically:

```typescript
const client = new Client('key', {
  callbacks: {
    onFlushed:    (traceId, itemCount) => console.log(`Flushed ${itemCount} items`),
    onFlushError: (error, operation)   => console.error(`${operation} failed:`, error),
    onClosed:     (traceId, reason)    => console.log(`Trace closed: ${reason}`),
    onDropped:    (count, reason)      => console.warn(`Dropped ${count} items: ${reason}`),
  },
});

// Per-trace overrides
const trace = client.trace({
  name: 'ImportantFlow',
  callbacks: { onFlushed: (id, n) => metrics.increment('flush', { id, n }) },
});
```

## Sampling

Control which traces are actually sent:

```typescript
// Fixed sample rate - send 10% of traces
const client = new Client('key', { sampleRate: 0.1 });

// Custom sampler - full control
const client = new Client('key', {
  sampler: (options) => {
    // Always sample traces named "critical"
    if (options.name === 'critical') return true;
    return Math.random() < 0.1;
  },
});
```

When a trace is sampled out, `client.trace()` returns a `NoopTrace` - a zero-cost stub with the same API surface. All method calls are no-ops, and `getTraceId()` returns a sentinel value (`'0'.repeat(32)`).

```typescript
import { NoopTrace } from '@miradorlabs/nodejs-sdk';

const trace = client.trace({ name: 'MaybeSampled' });
if (trace instanceof NoopTrace) {
  // This trace was sampled out - no network calls will be made
}
```

## Complete Example: Transaction Tracking

```typescript
import { Client } from '@miradorlabs/nodejs-sdk';

const client = new Client(process.env.MIRADOR_API_KEY);

async function trackSwapExecution(userAddress: string, txHash: string) {
  const trace = client.trace({ name: 'SwapExecution' })
    .addAttribute('user', userAddress)
    .addAttribute('protocol', 'uniswap-v3')
    .addAttribute('tokenIn', 'ETH')
    .addAttribute('tokenOut', 'USDC')
    .addAttribute('amountIn', '1.0')
    .addAttributes({
      slippageBps: 50,
      deadline: Math.floor(Date.now() / 1000) + 300,
    })
    .addTags(['swap', 'dex', 'ethereum'])
    .addEvent('quote_requested')
    .addEvent('quote_received', { price: 2500.50, provider: 'Uniswap' });
  // → FlushTrace auto-sent at end of current JS tick

  try {
    await processTransaction();

    // Add more data — auto-flushed via FlushTrace
    trace.addEvent('transaction_signed')
         .addEvent('transaction_confirmed', { blockNumber: 12345678 })
         .web3.evm.addTxHint(txHash, 'ethereum', 'Swap transaction');

    // Close the trace when done (flushes pending data first)
    await trace.close('Transaction completed successfully');
  } catch (error) {
    await trace.close('Transaction failed');
    throw error;
  }
}
```

## Tracing Transaction Input Data with ethers.js / viem

When a transaction fails on-chain, the input data (calldata) still contains the encoded function call and parameters. Recording it with `addTxInputData()` lets you decode and debug the failure later in the Mirador dashboard.

### Using ethers.js

```typescript
import { Client } from '@miradorlabs/nodejs-sdk';
import { JsonRpcProvider, Wallet, parseEther } from 'ethers';

const client = new Client(process.env.MIRADOR_API_KEY);
const provider = new JsonRpcProvider(process.env.RPC_URL);
const wallet = new Wallet(process.env.PRIVATE_KEY, provider);

async function sendTracedTransaction() {
  const trace = client.trace({ name: 'ServerSwap' })
    .addAttribute('from', wallet.address)
    .addTags(['swap', 'ethereum', 'server']);

  try {
    const tx = await wallet.sendTransaction({
      to: '0xRouterAddress...',
      data: '0x38ed1739000000000000000000000000...', // encoded swap calldata
    });

    trace.addEvent('transaction_sent', { txHash: tx.hash })
         .web3.evm.addTxHint(tx.hash, 'ethereum')
         .web3.evm.addInputData(tx.data);  // record the calldata for debugging
    // → auto-flushed

    const receipt = await tx.wait();

    trace.addEvent('transaction_confirmed', { blockNumber: receipt.blockNumber });
    await trace.close('Swap completed');
  } catch (error) {
    trace.addEvent('transaction_failed', { error: error.message });
    await trace.close('Swap failed');
  }
}
```

### Using viem

```typescript
import { Client } from '@miradorlabs/nodejs-sdk';
import { createWalletClient, createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

const client = new Client(process.env.MIRADOR_API_KEY);
const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);

const walletClient = createWalletClient({
  account,
  chain: mainnet,
  transport: http(process.env.RPC_URL),
});

const publicClient = createPublicClient({
  chain: mainnet,
  transport: http(process.env.RPC_URL),
});

async function sendTracedTransaction() {
  const calldata = '0xa9059cbb000000000000000000000000...' as `0x${string}`;

  const trace = client.trace({ name: 'TokenTransfer' })
    .addAttribute('from', account.address)
    .addTags(['transfer', 'ethereum']);

  try {
    const hash = await walletClient.sendTransaction({
      to: '0xTokenAddress...' as `0x${string}`,
      data: calldata,
    });

    trace.addEvent('transaction_sent', { txHash: hash })
         .web3.evm.addTxHint(hash, 'ethereum')
         .web3.evm.addInputData(calldata);  // record the calldata for debugging
    // → auto-flushed

    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    trace.addEvent('transaction_confirmed', { blockNumber: Number(receipt.blockNumber) });
    await trace.close('Transfer completed');
  } catch (error) {
    trace.addEvent('transaction_failed', { error: error.message });
    await trace.close('Transfer failed');
  }
}
```

## MiradorProvider

`MiradorProvider` is an EIP-1193 provider wrapper that automatically captures transaction data for Mirador traces. Wrap any existing provider to get automatic tracing for `eth_sendTransaction` and `eth_sendRawTransaction` calls.

```typescript
import { Client, MiradorProvider } from '@miradorlabs/nodejs-sdk';

const client = new Client('your-api-key');

// Option 1: Auto-create a new trace per transaction
const provider = new MiradorProvider(myProvider, client);

// Option 2: Bind to an existing trace
const trace = client.trace({ name: 'ServerSwap' });
const provider = new MiradorProvider(myProvider, client, { trace });

// Option 3: Configure trace options for auto-created traces
const provider = new MiradorProvider(myProvider, client, {
  traceOptions: { name: 'BackendTx' }
});

// Use like any EIP-1193 provider — transactions are automatically traced
const txHash = await provider.request({
  method: 'eth_sendTransaction',
  params: [{ from: '0xabc...', to: '0xdef...', value: '0x0' }],
});
```

For each intercepted transaction, `MiradorProvider`:
- Sets the underlying provider on the trace for chain detection
- Captures `tx:sent` event with transaction hash on success
- Captures `tx:error` event with error details on failure
- Adds transaction hash hint and input data automatically

## Chain Utilities

### `Chain` Enum

Supported EVM chains, keyed by chain ID:

```typescript
import { Chain } from '@miradorlabs/nodejs-sdk';

Chain.Ethereum  // 1
Chain.Polygon   // 137
Chain.Arbitrum  // 42161
Chain.Base      // 8453
Chain.Optimism  // 10
Chain.BSC       // 56
```

All chain parameters accept `ChainInput` — either a `Chain` enum value or a chain name string (`'ethereum'`, `'polygon'`, etc.).

### `toChain(chainId)`

Convert a raw chain ID to a `Chain` enum value.

```typescript
import { toChain, Chain } from '@miradorlabs/nodejs-sdk';

toChain(1);     // Chain.Ethereum
toChain(137);   // Chain.Polygon
toChain(42161); // Chain.Arbitrum
toChain('0x1'); // Chain.Ethereum (hex string)
toChain(999);   // undefined
```

## Configuration

### Environment Variables

| Variable | Description |
|----------|-------------|
| `MIRADOR_API_KEY` | API key for authentication |
| `GRPC_BASE_URL_API` | Override gateway URL |

## Stack Trace Utilities

The SDK exports utilities for capturing and formatting stack traces:

```typescript
import {
  captureStackTrace,
  formatStackTrace,
  formatStackTraceReadable
} from '@miradorlabs/nodejs-sdk';

// Capture current stack trace
const stack = captureStackTrace();
// stack.frames: Array of { functionName, fileName, lineNumber, columnNumber }
// stack.raw: Original Error.stack string

// Format for storage (JSON string)
const json = formatStackTrace(stack);

// Format for display (human-readable)
const readable = formatStackTraceReadable(stack);
// Output:
//   at myFunction (/path/to/file.ts:42:10)
//   at caller (/path/to/other.ts:15:5)
```

## TypeScript Support

Full TypeScript support with exported types:

```typescript
import {
  // Classes
  Client,
  Trace,
  NoopTrace,
  MiradorProvider,

  // gRPC transport
  NodeGrpcRpc,

  // Utilities
  captureStackTrace,
  formatStackTrace,
  formatStackTraceReadable,
  toChain,
  Chain,

  // Types
  ClientOptions,
  TraceOptions,             // { name?, traceId?, captureStackTrace?, maxRetries?, retryBackoff?, ... }
  AddEventOptions,          // { captureStackTrace?: boolean }
  StackFrame,               // { functionName, fileName, lineNumber, columnNumber }
  StackTrace,               // { frames: StackFrame[], raw: string }
  ChainName,                // 'ethereum' | 'polygon' | 'arbitrum' | 'base' | 'optimism' | 'bsc'
  ChainInput,               // Chain | ChainName
  TraceEvent,               // { eventName, details?, timestamp }
  TxHashHint,               // { txHash, chain, details?, timestamp }
  SafeTxHintData,           // { safeTxHash, chain, details?, timestamp }
  SafeMsgHintData,          // { messageHash, chain, details?, timestamp }
  EIP1193Provider,          // { request(args): Promise<unknown> }
  TxHintOptions,            // { input?, details? }
  TransactionLike,          // { hash, data?, input?, chainId? }
  TransactionRequest,       // { from, to?, data?, value?, ... }
  MiradorProviderOptions,   // { trace?, traceOptions? }
  Logger,                   // { debug(), warn(), error() }
  TraceCallbacks,           // { onFlushed?, onFlushError?, onClosed?, onDropped? }

  // Advanced: raw proto types
  FlushTraceRequest,
  FlushTraceResponse,
} from '@miradorlabs/nodejs-sdk';
```

## Development

```bash
npm install          # Install dependencies
npm run build        # Build the SDK
npm run lint         # Run linter
npm test             # Run tests
npm run test:watch   # Run tests in watch mode
npm run test:coverage # Run tests with coverage
```

### Release

```bash
npm run release:patch  # 1.0.x
npm run release:minor  # 1.x.0
npm run release:major  # x.0.0
```

## Example CLI

An interactive CLI for testing the SDK is available in the [`example/`](./example/) directory.

```bash
# Run the CLI
npm run cli

# Example session
mirador> create my_swap
mirador> attr user 0xabc123
mirador> tag swap
mirador> event wallet_connected '{"wallet":"MetaMask"}'
mirador> tx 0x123... ethereum
mirador> safemsg 0xabc... ethereum "Multisig approval"
mirador> flush
mirador> close "Completed"
```

See the [example README](./example/README.md) for full documentation.

## License

MIT
