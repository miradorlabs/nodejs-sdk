# Mirador Ingest Node.js SDK

Node.js SDK for the Mirador tracing platform. This package provides a server-side client using gRPC to interact with the Mirador Ingest Gateway API.

## Installation

```bash
npm install @miradorlabs/node
```

## Features

- **Fluent Builder Pattern** - Method chaining for creating traces
- **Retry with Backoff** - Automatic retry with exponential backoff on network failures
- **Keep-Alive** - Automatic periodic pings to maintain trace liveness (configurable interval)
- **Trace Lifecycle** - Explicit close trace method with automatic cleanup
- **Blockchain Integration** - Built-in support for correlating traces with blockchain transactions
- **Stack Trace Capture** - Automatic or manual capture of call stack for debugging
- **TypeScript Support** - Full type definitions included
- **Multiple Transaction Hints** - Support for multiple blockchain transaction correlations

## Quick Start

```typescript
import { Client } from '@miradorlabs/node';

// Create client with optional keep-alive configuration
const client = new Client('your-api-key', {
  keepAliveIntervalMs: 10000  // Default is 10 seconds
});

const trace = client.trace({ name: 'SwapExecution' })
  .addAttribute('from', '0xabc...')
  .addAttribute('slippage', { bps: 50, tolerance: 'auto' })  // objects are stringified
  .addTags(['dex', 'swap'])
  .addEvent('quote_received', { provider: 'Uniswap' })
  .addEvent('transaction_signed')
  .addTxHint('0xtxhash...', 'ethereum');  // Can add multiple tx hints

const traceId = await trace.create();  // Keep-alive starts automatically

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
  captureStackTrace?: boolean; // Capture stack trace at creation (default: true)
  maxRetries?: number;       // Max retry attempts on failure (default: 3)
  retryBackoff?: number;     // Base backoff delay in ms (default: 1000)
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
import { captureStackTrace } from '@miradorlabs/node';

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

#### `create()`

Submit the trace to the gateway. Keep-alive timer starts automatically after successful creation.

```typescript
const traceId = await trace.create();
```

Returns: `Promise<string | undefined>` - The trace ID if successful, undefined if failed

#### `getTraceId()`

Get the trace ID (available after create() completes successfully).

```typescript
const traceId = trace.getTraceId();  // string | null
```

Returns: `string | null`

#### `close(reason?)`

Close the trace and stop all timers (keep-alive timer). After calling this method, all subsequent operations will be ignored.

```typescript
await trace.close();
await trace.close('User completed workflow');
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `reason` | `string` | Optional reason for closing the trace |

Returns: `Promise<void>`

**Important:** Once a trace is closed:
- All method calls (`addAttribute`, `addEvent`, `addTag`, `addTxHint`) will be ignored with a warning
- The keep-alive timer will be stopped
- A close request will be sent to the server

#### `isClosed()`

Check if the trace has been closed.

```typescript
const closed = trace.isClosed();  // boolean
```

Returns: `boolean`

## Complete Example: Transaction Tracking

```typescript
import { Client } from '@miradorlabs/node';

// Create client with custom keep-alive interval (optional)
const client = new Client(process.env.MIRADOR_API_KEY, {
  keepAliveIntervalMs: 15000  // Override default 10s interval
});

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

  try {
    const traceId = await trace.create();
    // Keep-alive timer starts automatically

    if (traceId) {
      console.log('Trace created:', traceId);

      // Simulate some processing
      await processTransaction();

      // Add transaction hint
      trace.addEvent('transaction_signed')
           .addEvent('transaction_confirmed', { blockNumber: 12345678 })
           .addTxHint(txHash, 'ethereum', 'Swap transaction');

      // Close the trace when done
      await trace.close('Transaction completed successfully');
    }
  } catch (error) {
    await trace.close('Transaction failed');
    throw error;
  }
}
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
} from '@miradorlabs/node';

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
  Client,
  Trace,
  ClientOptions,
  TraceOptions,      // { name?, captureStackTrace?, maxRetries?, retryBackoff? }
  AddEventOptions,   // { captureStackTrace?: boolean }
  StackFrame,        // { functionName, fileName, lineNumber, columnNumber }
  StackTrace,        // { frames: StackFrame[], raw: string }
  ChainName,         // 'ethereum' | 'polygon' | 'arbitrum' | 'base' | 'optimism' | 'bsc'
} from '@miradorlabs/node';
```

## Development

```bash
npm install          # Install dependencies
npm run build        # Build the SDK
npm run lint         # Run linter
npm test             # Run tests
npm run test:watch   # Run tests in watch mode
npm run test:coverage # Run tests with coverage
npm run cli          # CLI tool for testing
```

### Release

```bash
npm run release:patch  # 1.0.x
npm run release:minor  # 1.x.0
npm run release:major  # x.0.0
```

## License

ISC
