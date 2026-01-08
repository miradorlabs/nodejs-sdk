# Parallax Node.js SDK

Node.js SDK for the Parallax tracing platform. This package provides a server-side client using gRPC to interact with the Parallax Gateway API.

## Installation

```bash
npm install @miradorlabs/parallax
```

## Features

- **Fluent Builder Pattern** - Method chaining for creating traces
- **Blockchain Integration** - Built-in support for correlating traces with blockchain transactions
- **TypeScript Support** - Full type definitions included
- **Single Request** - All trace data submitted in one efficient gRPC call

## Quick Start

```typescript
import { ParallaxClient } from '@miradorlabs/parallax';

const client = new ParallaxClient('your-api-key');

const traceId = await client.trace('SwapExecution')
  .addAttribute('from', '0xabc...')
  .addAttribute('slippage', { bps: 50, tolerance: 'auto' })  // objects are stringified
  .addTags(['dex', 'swap'])
  .addEvent('quote_received', { provider: 'Uniswap' })
  .addEvent('transaction_signed')
  .setTxHint('0xtxhash...', 'ethereum')  // optional
  .create();

console.log('Trace ID:', traceId);
```

## API Reference

### ParallaxClient

The main client for interacting with the Parallax Gateway.

#### Constructor

```typescript
new ParallaxClient(apiKey?: string, apiUrl?: string)
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `apiKey` | `string` | No | API key for authentication (sent as `x-parallax-api-key` header) |
| `apiUrl` | `string` | No | Gateway URL (defaults to `parallax-gateway-dev.mirador.org:443`) |

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

#### `setTxHint(txHash, chain, details?)`

Set the transaction hash hint for blockchain correlation.

```typescript
trace.setTxHint('0x123...', 'ethereum', 'Main transaction')
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `txHash` | `string` | Transaction hash |
| `chain` | `ChainName` | Chain name: `'ethereum'` \| `'polygon'` \| `'arbitrum'` \| `'base'` \| `'optimism'` \| `'bsc'` |
| `details` | `string` | Optional details about the transaction |

#### `create()`

Submit the trace to the gateway.

```typescript
const traceId = await trace.create();
```

Returns: `Promise<string | undefined>` - The trace ID if successful, undefined if failed

## Complete Example

```typescript
import { ParallaxClient } from '@miradorlabs/parallax';

const client = new ParallaxClient(process.env.PARALLAX_API_KEY);

async function trackSwapExecution(userAddress: string, txHash: string) {
  const traceId = await client.trace('SwapExecution')
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
    .addEvent('quote_received', { price: 2500.50, provider: 'Uniswap' })
    .addEvent('transaction_signed')
    .addEvent('transaction_confirmed', { blockNumber: 12345678 })
    .setTxHint(txHash, 'ethereum', 'Swap transaction')
    .create();

  if (traceId) {
    console.log('Trace created:', traceId);
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
