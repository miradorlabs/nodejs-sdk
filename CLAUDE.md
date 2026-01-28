# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Parallax SDK is a TypeScript client library for interacting with the Mirador tracing platform. It provides APIs for creating traces with attributes, events, tags, and transaction hash hints, communicating over gRPC.

## Build Commands

```bash
npm install          # Install dependencies
npm run build        # Build the SDK (uses Rollup)
npm run lint         # Run ESLint on src/ and tests/
npm test             # Run Jest tests
npm run test:watch   # Run tests in watch mode
npm run test:coverage # Run tests with coverage
npm run cli          # Run CLI tool for testing (requires MIRADOR_API_KEY env var)
./scripts/build.sh   # Full build pipeline: lint -> test -> build
./scripts/release.sh # Interactive release workflow
```

## Architecture

### Entry Point
- `index.ts` - Main export file that re-exports from `src/parallax` and gRPC types

### Source Structure (`src/parallax/`)
- `client.ts` - `ParallaxClient` class for creating traces via gRPC
- `trace.ts` - `ParallaxTrace` builder class for fluent API trace construction (includes internal `CHAIN_MAP` for converting chain names to proto enum values)
- `types.ts` - Type definitions (`ChainName`, `TraceEvent`, `TxHashHint`)
- `index.ts` - Re-exports all public APIs

### gRPC Transport (`src/grpc/`)
- `index.ts` - `NodeGrpcRpc` class implementing gRPC transport with SSL and API key auth

### Proto Types
The SDK uses types from `mirador-gateway-parallax`:
- `CreateTraceRequest` / `CreateTraceResponse` - Main request/response types
- `Event` - Event with `name`, `details`, and `timestamp` fields
- `TxHashHint` - Transaction hint with `chain` (Chain enum), `txHash`, `details`, and `timestamp`
- `Chain` - Enum for supported blockchains (CHAIN_ETHEREUM, CHAIN_POLYGON, etc.)

### Key Patterns
- Builder pattern: `client.trace(name).addAttribute(...).addTag(...).addEvent(...).setTxHint(...).create()`
- All attribute values are converted to strings (objects are JSON.stringify'd)
- Events accept optional details (string or object that gets JSON.stringify'd) and optional timestamps
- Transaction hash hints are set via `setTxHint(txHash, chain, details?)` with typed `ChainName`
- Chain names (`'ethereum'`, `'polygon'`, etc.) are internally mapped to proto `Chain` enum values
- Terminal method `create()` returns `Promise<string | undefined>` (trace ID or undefined on failure)

### External Dependencies
- `mirador-gateway-parallax` - Protocol buffer definitions for the Parallax Gateway API
- `@grpc/grpc-js` - gRPC client implementation
- `rxjs` - Used for streaming support in gRPC layer

### Configuration
- Default API URL: `parallax-gateway-dev.mirador.org:443`
- Environment variables:
  - `MIRADOR_API_KEY` - API key for authentication
  - `GRPC_BASE_URL_API` - Override default gateway URL

## Testing

Tests are in `tests/` directory. The test suite mocks `NodeGrpcRpc` and the gateway client to test the `Client` and `Trace` builder logic.

```bash
# Run a single test file
npx jest tests/parallax.test.ts

# Run tests matching a pattern
npx jest --testNamePattern="trace builder"
```

## Release Process

```bash
npm run release:patch  # Bump patch version, tag, and push
npm run release:minor  # Bump minor version, tag, and push
npm run release:major  # Bump major version, tag, and push
```
