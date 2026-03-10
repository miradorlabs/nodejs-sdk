# Mirador Ingest Node.js SDK

Node.js SDK for the Mirador tracing platform. This package provides a server-side client using gRPC to interact with the Mirador Ingest Gateway API.

## Installation

```bash
npm install @miradorlabs/nodejs-sdk
```

## Features

- **Auto-Flush** - Builder methods automatically batch and send data via microtask scheduling
- **Fluent Builder Pattern** - Method chaining for creating traces
- **Retry with Backoff** - Automatic retry with exponential backoff on network failures
- **Keep-Alive** - Automatic periodic pings to maintain trace liveness (configurable interval)
- **Trace Lifecycle** - Explicit close trace method with automatic cleanup
- **Blockchain Integration** - Built-in support for correlating traces with blockchain transactions
- **Stack Trace Capture** - Automatic or manual capture of call stack for debugging
- **TypeScript Support** - Full type definitions included
- **Multiple Transaction Hints** - Support for multiple blockchain transaction correlations
- **Safe Multisig Tracking** - Track Safe message and transaction confirmations with `addSafeMsgHint()` and `addSafeTxHint()`
- **EIP-1193 Provider Integration** - Send transactions directly through traces with `sendTransaction()`

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
  .addTxHint('0xtxhash...', 'ethereum');
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
  useSsl?: boolean;             // Use SSL for gRPC connection (default: true)
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

// Configure retry behavior:
const trace = client.trace({
  name: 'MyTrace',
  maxRetries: 5,      // Override default of 3
  retryBackoff: 2000  // Override default of 1000ms
});
```

| Parameter | Type           | Required | Description           |
|-----------|----------------|----------|-----------------------|
| `options` | `TraceOptions` | No       | Trace configuration   |

```typescript
interface TraceOptions {
  name?: string;             // Trace name
  traceId?: string;          // Resume an existing trace by ID
  captureStackTrace?: boolean; // Capture stack trace at creation (default: true)
  maxRetries?: number;       // Max retry attempts on failure (default: 3)
  retryBackoff?: number;     // Base backoff delay in ms (default: 1000)
  provider?: EIP1193Provider;  // EIP-1193 provider for transaction operations
  autoKeepAlive?: boolean;   // Auto keep-alive (default: true for new, false when resuming)
}
```

Returns: `Trace` builder instance

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

#### `addTxHint(txHash, chain, details?)`

Add a transaction hash hint for blockchain correlation. Multiple hints can be added.

```typescript
trace.addTxHint('0x123...', 'ethereum', 'Main transaction')
     .addTxHint('0x456...', 'polygon', 'Bridge transaction')
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `txHash` | `string` | Transaction hash |
| `chain` | `ChainName` | Chain name: `'ethereum'` \| `'polygon'` \| `'arbitrum'` \| `'base'` \| `'optimism'` \| `'bsc'` |
| `details` | `string` | Optional details about the transaction |

#### `addSafeMsgHint(msgHint, chain, details?)`

Add a Safe message hint for tracking Safe multisig message confirmations. Mirador will monitor the Safe contract for confirmation events related to the given message hash.

```typescript
trace.addSafeMsgHint('0xmsgHash...', 'ethereum')
     .addSafeMsgHint('0xotherHash...', 'base', 'Token approval')
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `msgHint` | `string` | The Safe message hash to track |
| `chain` | `ChainName` | Chain name: `'ethereum'` \| `'polygon'` \| `'arbitrum'` \| `'base'` \| `'optimism'` \| `'bsc'` |
| `details` | `string` | Optional details about the message |

#### `addSafeTxHint(safeTxHash, chain, details?)`

Add a Safe transaction hint for tracking Safe multisig transaction executions.

```typescript
trace.addSafeTxHint('0xsafeTxHash...', 'ethereum')
     .addSafeTxHint('0xotherHash...', 'base', 'Token transfer')
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `safeTxHash` | `string` | The Safe transaction hash to track |
| `chain` | `ChainName` | Chain name: `'ethereum'` \| `'polygon'` \| `'arbitrum'` \| `'base'` \| `'optimism'` \| `'bsc'` |
| `details` | `string` | Optional details about the transaction |

#### `addTx(tx, chain?)`

Add a transaction object, automatically extracting hash, chain, and input data.

```typescript
// Works with ethers.js transaction responses
const tx = await wallet.sendTransaction({ to, data });
trace.addTx(tx, 'ethereum');

// Or with viem — chain inferred from tx.chainId if not provided
trace.addTx({ hash: txHash, data: calldata, chainId: 1 });
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `tx` | `TransactionLike` | Transaction object with `hash`, optional `data`/`input`/`chainId` |
| `chain` | `ChainName` | Optional chain override (inferred from `tx.chainId` or provider if omitted) |

#### `sendTransaction(tx, provider?)`

Send a transaction through the trace's EIP-1193 provider, automatically capturing events (`tx:send`, `tx:sent`, `tx:error`), input data, and tx hint.

```typescript
// Set provider on client or trace
const client = new Client('key', { provider: myProvider });
const trace = client.trace({ name: 'Swap' });

const txHash = await trace.sendTransaction({
  from: '0xabc...',
  to: '0xRouterAddress...',
  data: '0x38ed1739...',
});
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `tx` | `TransactionRequest` | EIP-1193 style transaction parameters |
| `provider` | `EIP1193Provider` | Optional provider override |

Returns: `Promise<string>` - The transaction hash

#### `setProvider(provider)`

Set an EIP-1193 provider for transaction operations. Automatically detects chain ID.

```typescript
trace.setProvider(myProvider);
```

#### `addTxInputData(inputData)`

Add transaction input data (calldata) as a trace event. This is the hex-encoded data field from a transaction, useful for debugging failed transactions where the calldata is still available even though the transaction reverted.

```typescript
trace.addTxInputData('0xa9059cbb000000000000000000000000...')
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `inputData` | `string` | Hex-encoded transaction input data (calldata) |

Returns: `this` for chaining

#### `flush()`

Send pending data to the gateway. Fire-and-forget — returns immediately but maintains strict ordering internally.

The first flush sends `CreateTrace`, subsequent flushes send `UpdateTrace`.

```typescript
trace.addEvent('important_milestone');
trace.flush();  // Send immediately
```

Returns: `void`

> **Note:** Builder methods automatically call `flush()` via microtask scheduling, so you rarely need to call it manually. All synchronous builder calls within the same JS tick are batched into a single flush.

#### `create()` *(deprecated)*

> **Deprecated:** Use `flush()` or rely on auto-flush instead. Kept for backward compatibility.

Submit the trace to the gateway synchronously and return the trace ID. Keep-alive timer starts automatically after successful creation.

```typescript
const traceId = await trace.create();
```

Returns: `Promise<string | undefined>` - The trace ID if successful, undefined if failed

#### `getTraceId()`

Get the trace ID (available after first flush completes successfully, or immediately if using `traceId` option / `setTraceId()`).

```typescript
const traceId = trace.getTraceId();  // string | null
```

Returns: `string | null`

#### `setTraceId(traceId)`

Set the trace ID on an existing trace instance, allowing it to resume a trace created elsewhere (e.g., passed from a frontend SDK via HTTP header). Subsequent flushes will send `UpdateTrace` instead of `CreateTrace`.

```typescript
trace.setTraceId('abc-123-def');
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `traceId` | `string` | The trace ID to resume |

Returns: `this` for chaining

**Notes:**
- Ignored if the trace is already closed (logs a warning)
- Ignored if a trace ID is already set (logs a warning)
- Can also be set at creation time via `client.trace({ traceId: '...' })`

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
- All method calls (`addAttribute`, `addEvent`, `addTag`, `addTxHint`, `addSafeMsgHint`, `addSafeTxHint`) will be ignored with a warning
- The keep-alive timer will be stopped
- Any pending data will be flushed, then a close request will be sent to the server

#### `isClosed()`

Check if the trace has been closed.

```typescript
const closed = trace.isClosed();  // boolean
```

Returns: `boolean`

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
  // → CreateTrace auto-flushed at end of current JS tick

  try {
    await processTransaction();

    // Add more data — auto-flushed as UpdateTrace
    trace.addEvent('transaction_signed')
         .addEvent('transaction_confirmed', { blockNumber: 12345678 })
         .addTxHint(txHash, 'ethereum', 'Swap transaction');

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
         .addTxHint(tx.hash, 'ethereum')
         .addTxInputData(tx.data);  // record the calldata for debugging
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
         .addTxHint(hash, 'ethereum')
         .addTxInputData(calldata);  // record the calldata for debugging
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

### `chainIdToName(chainId)`

Convert a numeric chain ID to a Mirador `ChainName`.

```typescript
import { chainIdToName } from '@miradorlabs/nodejs-sdk';

chainIdToName(1);     // 'ethereum'
chainIdToName(137);   // 'polygon'
chainIdToName(42161); // 'arbitrum'
chainIdToName(8453);  // 'base'
chainIdToName(10);    // 'optimism'
chainIdToName(56);    // 'bsc'
chainIdToName(999);   // undefined
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
  MiradorProvider,

  // Utilities
  captureStackTrace,
  formatStackTrace,
  formatStackTraceReadable,
  chainIdToName,

  // Types
  ClientOptions,
  TraceOptions,             // { name?, traceId?, captureStackTrace?, maxRetries?, retryBackoff?, provider?, autoKeepAlive? }
  AddEventOptions,          // { captureStackTrace?: boolean }
  StackFrame,               // { functionName, fileName, lineNumber, columnNumber }
  StackTrace,               // { frames: StackFrame[], raw: string }
  ChainName,                // 'ethereum' | 'polygon' | 'arbitrum' | 'base' | 'optimism' | 'bsc'
  TraceEvent,               // { eventName, details?, timestamp }
  TxHashHint,               // { txHash, chain, details?, timestamp }
  SafeTxHintData,           // { safeTxHash, chain, details?, timestamp }
  SafeMsgHintData,          // { messageHash, chain, details?, timestamp }
  EIP1193Provider,          // { request(args): Promise<unknown> }
  TxHintOptions,            // { input?, details? }
  TransactionLike,          // { hash, data?, input?, chainId? }
  TransactionRequest,       // { from, to?, data?, value?, ... }
  MiradorProviderOptions,   // { trace?, traceOptions? }
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
