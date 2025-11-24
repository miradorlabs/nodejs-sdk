# Parallax SDK

The Parallax SDK is a TypeScript client library for interacting with the Mirador tracing platform. It provides a simple and intuitive API for creating traces, managing spans, and adding observability to your applications.

## Features

- 🚀 **Simple API** - Easy-to-use client for trace creation and span management
- 📊 **Full Span Control** - Start, finish, and manage spans with complete control
- 🏷️ **Rich Metadata** - Add attributes, events, errors, and hints to spans
- 🔌 **gRPC Transport** - Built on top of gRPC for efficient communication
- 📦 **TypeScript First** - Fully typed for excellent IDE support
- ⚡ **Async/Await** - Modern promise-based API

## Installation

```bash
npm install @mirador/parallax
```

## Quick Start

```typescript
import { ParallaxClient } from '@mirador/parallax';

// Initialize the client
const client = new ParallaxClient('your-api-key');

// Create a new trace
const trace = await client.createTrace({
  name: 'my-application',
  // ... additional trace parameters
});

// Start a span
const span = await client.startSpan({
  traceId: trace.traceId,
  name: 'operation-name',
  // ... additional span parameters
});

// Add attributes to the span
await client.addSpanAttributes({
  traceId: trace.traceId,
  spanId: span.spanId,
  attributes: {
    'user.id': '12345',
    'operation.type': 'database-query'
  }
});

// Finish the span
await client.finishSpan({
  traceId: trace.traceId,
  spanId: span.spanId
});
```

## API Reference

### Constructor

```typescript
new ParallaxClient(apiKey?: string)
```

Creates a new instance of the Parallax client.

**Parameters:**

- `apiKey` (optional): Your Mirador API key for authentication

### Methods

#### `createTrace(params: CreateTraceRequest)`

Creates a new trace in the Mirador platform.

**Returns:** `Promise<CreateTraceResponse>`

```typescript
const trace = await client.createTrace({
  name: 'my-service',
  // ... additional parameters
});
```

#### `startSpan(params: StartSpanRequest)`

Starts a new span within an existing trace.

**Returns:** `Promise<StartSpanResponse>`

```typescript
const span = await client.startSpan({
  traceId: 'trace-id',
  name: 'span-name',
  parentSpanId: 'parent-span-id', // optional
  // ... additional parameters
});
```

#### `finishSpan(params: FinishSpanRequest)`

Finishes an active span.

**Returns:** `Promise<FinishSpanResponse>`

```typescript
await client.finishSpan({
  traceId: 'trace-id',
  spanId: 'span-id'
});
```

#### `addSpanAttributes(params: AddSpanAttributesRequest)`

Adds custom attributes to a span for additional context.

**Returns:** `Promise<AddSpanAttributesResponse>`

```typescript
await client.addSpanAttributes({
  traceId: 'trace-id',
  spanId: 'span-id',
  attributes: {
    'http.method': 'GET',
    'http.status_code': 200,
    'custom.metadata': 'value'
  }
});
```

#### `addSpanEvent(params: AddSpanEventRequest)`

Adds a timestamped event to a span.

**Returns:** `Promise<AddSpanEventResponse>`

```typescript
await client.addSpanEvent({
  traceId: 'trace-id',
  spanId: 'span-id',
  name: 'cache.hit',
  // ... additional event data
});
```

#### `addSpanError(params: AddSpanErrorRequest)`

Records an error that occurred during span execution.

**Returns:** `Promise<AddSpanErrorResponse>`

```typescript
await client.addSpanError({
  traceId: 'trace-id',
  spanId: 'span-id',
  error: 'Error message',
  // ... additional error details
});
```

#### `addSpanHint(params: AddSpanHintRequest)`

Adds hints to a span for debugging and optimization suggestions.

**Returns:** `Promise<AddSpanHintResponse>`

```typescript
await client.addSpanHint({
  traceId: 'trace-id',
  spanId: 'span-id',
  hint: 'Consider caching this operation',
  // ... additional hint data
});
```

## Configuration

### Environment Variables

The SDK supports the following environment variable:

- `GRPC_BASE_URL_API` - The gRPC gateway URL (default: `localhost:50053`)

```bash
export GRPC_BASE_URL_API=api.mirador.example.com:50053
```

## Advanced Usage

### Error Handling

All methods throw errors that should be caught and handled appropriately:

```typescript
try {
  const trace = await client.createTrace({ name: 'my-app' });
} catch (error) {
  console.error('Failed to create trace:', error);
  // Handle error appropriately
}
```

### Nested Spans

Create hierarchical span relationships by specifying parent spans:

```typescript
// Create parent span
const parentSpan = await client.startSpan({
  traceId: trace.traceId,
  name: 'parent-operation'
});

// Create child span
const childSpan = await client.startSpan({
  traceId: trace.traceId,
  name: 'child-operation',
  parentSpanId: parentSpan.spanId
});

// Finish child first
await client.finishSpan({
  traceId: trace.traceId,
  spanId: childSpan.spanId
});

// Then finish parent
await client.finishSpan({
  traceId: trace.traceId,
  spanId: parentSpan.spanId
});
```

## Development

### Building from Source

```bash
# Clone the repository
git clone https://github.com/miradorlabs/mirador-frontend.git
cd parallax

# Install dependencies
npm install

# Build the SDK
npm run build
```

### Running Tests

```bash
npm test
```

## Dependencies

- **@grpc/grpc-js** - gRPC client for Node.js
- **google-protobuf** - Protocol Buffers runtime
- **mirador-gateway-api** - Mirador Gateway API definitions
- **rxjs** - Reactive Extensions for streaming support

## License

ISC

## Support

For questions, issues, or feature requests, please open an issue in the GitHub repository or contact the Mirador team.

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting pull requests.

---

Made with ❤️ by the Mirador team
