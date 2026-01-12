# Parallax Node.js SDK

Node.js SDK for the Parallax tracing platform. This package provides a server-side client using gRPC to interact with the Parallax Gateway API.

## Installation

```bash
npm install @miradorlabs/parallax
```

## Features

- **Fluent Builder Pattern** - Method chaining for creating traces
- **Keep-Alive** - Automatic periodic pings to maintain trace liveness (configurable interval)
- **Trace Lifecycle** - Explicit close trace method with automatic cleanup
- **Blockchain Integration** - Built-in support for correlating traces with blockchain transactions
- **TypeScript Support** - Full type definitions included
- **Multiple Transaction Hints** - Support for multiple blockchain transaction correlations

## Quick Start

```typescript
import { ParallaxClient } from '@miradorlabs/parallax';

// Create client with optional keep-alive configuration
const client = new ParallaxClient('your-api-key', {
  keepAliveIntervalMs: 10000  // Default is 10 seconds
});

const trace = client.trace('SwapExecution')
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

### ParallaxClient

The main client for interacting with the Parallax Gateway.

#### Constructor

```typescript
new ParallaxClient(apiKey?: string, options?: ParallaxClientOptions)
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `apiKey` | `string` | No | API key for authentication (sent as `x-parallax-api-key` header) |
| `options` | `ParallaxClientOptions` | No | Configuration options |

#### Options

```typescript
interface ParallaxClientOptions {
  apiUrl?: string;              // Gateway URL (defaults to parallax-gateway-dev.mirador.org:443)
  keepAliveIntervalMs?: number; // Keep-alive ping interval in milliseconds (default: 10000)
}
```

#### Methods

##### `trace(name?)`

Creates a new trace builder.

```typescript
const trace = client.trace('MyTrace');
const trace = client.trace();  // name is optional (defaults to empty string)
```

Returns: `ParallaxTrace` builder instance

### ParallaxTrace (Builder)

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

#### `addEvent(name, details?, timestamp?)`

Add an event with optional details (string or object) and optional timestamp.

```typescript
trace.addEvent('wallet_connected', { wallet: 'MetaMask' })
     .addEvent('transaction_initiated')
     .addEvent('transaction_confirmed', { blockNumber: 12345 })
```

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
import { ParallaxClient } from '@miradorlabs/parallax';

// Create client with custom keep-alive interval (optional)
const client = new ParallaxClient(process.env.PARALLAX_API_KEY, {
  keepAliveIntervalMs: 15000  // Override default 10s interval
});

async function trackSwapExecution(userAddress: string, txHash: string) {
  const trace = client.trace('SwapExecution')
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
| `PARALLAX_API_KEY` | API key for authentication |
| `GRPC_BASE_URL_API` | Override gateway URL |

## TypeScript Support

Full TypeScript support with exported types:

```typescript
import {
  ParallaxClient,
  ParallaxTrace,
  ParallaxClientOptions,
  ChainName,  // 'ethereum' | 'polygon' | 'arbitrum' | 'base' | 'optimism' | 'bsc'
} from '@miradorlabs/parallax';
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
