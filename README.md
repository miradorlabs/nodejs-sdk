# Parallax Node.js SDK

TypeScript client library for the Mirador Parallax tracing platform.

## Installation

```bash
npm install @miradorlabs/parallax
```

## Quick Start

```typescript
import { ParallaxClient } from '@miradorlabs/parallax';

const client = new ParallaxClient('your-api-key');

const traceId = await client.trace('swap_execution')
  .addAttribute('user', '0xabc123')
  .addAttribute('slippage_bps', 25)
  .addTag('dex')
  .addEvent('wallet_connected', { wallet: 'MetaMask' })
  .addEvent('transaction_signed')
  .setTxHint('0x123...', 'ethereum')
  .create();

console.log('Trace created:', traceId);
```

## API

### ParallaxClient

```typescript
const client = new ParallaxClient(apiKey?: string, apiUrl?: string);
```

Creates a new client instance.

- `apiKey` - API key for authentication
- `apiUrl` - Gateway URL (default: `parallax-gateway.dev.mirador.org:443`)

### ParallaxTrace (Builder)

Create a trace builder with `client.trace(name)`, then chain methods:

#### `addAttribute(key, value)`
Add an attribute. Values can be strings, numbers, booleans, or objects (auto-stringified).

```typescript
.addAttribute('user', '0xabc')
.addAttribute('config', { timeout: 30 })
```

#### `addAttributes(attrs)`
Add multiple attributes at once.

```typescript
.addAttributes({ user: '0xabc', slippage: 25 })
```

#### `addTag(tag)` / `addTags(tags)`
Add tags to the trace.

```typescript
.addTag('swap')
.addTags(['dex', 'ethereum'])
```

#### `addEvent(name, details?, timestamp?)`
Add a timestamped event. Details can be a string or object.

```typescript
.addEvent('wallet_connected')
.addEvent('quote_received', { price: 2500 })
```

#### `setTxHint(txHash, chain, details?)`
Set blockchain transaction correlation.

```typescript
.setTxHint('0x123...', 'ethereum', 'Swap transaction')
```

Supported chains: `ethereum`, `polygon`, `arbitrum`, `base`, `optimism`, `bsc`

#### `create()`
Submit the trace. Returns the trace ID or `undefined` on failure.

```typescript
const traceId = await trace.create();
```

## Configuration

### Environment Variables

- `PARALLAX_API_KEY` - API key for authentication
- `GRPC_BASE_URL_API` - Override gateway URL

## Development

```bash
npm install          # Install dependencies
npm run build        # Build
npm run lint         # Lint
npm test             # Run tests
npm run cli          # CLI tool for testing
```

## License

ISC
