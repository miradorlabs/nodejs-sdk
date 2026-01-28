# CLI Quick Start

## ✅ CLI is Now Working!

The Parallax SDK CLI has been successfully set up and is ready to use.

## Installation Complete

The following has been installed:
- ✅ `tsx` - TypeScript execution engine
- ✅ CLI script at `example/cli.ts`
- ✅ Custom commands for building traces
- ✅ Interactive mode support

## Quick Test

Run the help command to verify installation:
```bash
npm run cli -- help
```

## Usage Examples

### 1. Builder Demo (Pre-built Example)
```bash
npm run cli -- builder
```

### 2. Interactive Mode (Recommended for Testing)
```bash
npm run cli -- interactive
```

Then try these commands:
```
parallax> create test_trace
parallax> attr user 0xabc123
parallax> attr amount 100
parallax> tag test
parallax> event started
parallax> status
parallax> submit
parallax> exit
```

### 3. Command-Line Mode
```bash
# Create a trace
npm run cli -- create my_trace

# Add data
npm run cli -- add-attribute user 0xtest
npm run cli -- add-attribute slippage 25
npm run cli -- add-tag swap
npm run cli -- add-event wallet_connected '{"wallet":"MetaMask"}'

# Submit
npm run cli -- submit
```

## Configuration

### Set API Key (Optional)
```bash
export MIRADOR_API_KEY=your-api-key-here
```

### Set Custom API URL (Optional)
```bash
export GRPC_BASE_URL_API=your-gateway-url:443
```

## Available Commands

### Trace Management
- `create <name>` - Create a new trace
- `submit` - Submit the current trace
- `status` - Check current trace state

### Adding Data
- `add-attribute <key> <value>` - Add an attribute
- `add-event <name> [details]` - Add an event
- `add-tag <tag>` - Add a tag
- `set-tx <hash> <chain> [details]` - Set transaction hash

### Modes
- `interactive` - Interactive REPL mode
- `builder` - Pre-built demo
- `help` - Show help

## Features

✅ **Color-Coded Output**
- Green ✓ for success
- Red ✗ for errors
- Blue ℹ for info
- Yellow ⚠️ for warnings

✅ **Smart Type Parsing**
- Numbers: `25` → number
- Booleans: `true` → boolean
- Strings: `0xabc` → string

✅ **JSON Support**
```bash
npm run cli -- add-event test '{"key":"value","count":42}'
```

✅ **Stateful Sessions**
Build traces incrementally across multiple commands

## Troubleshooting

### Connection Errors
If you see "Name resolution failed" or "UNAVAILABLE" errors, this is expected when the API server isn't running locally. The CLI itself is working correctly.

To test without a server:
1. Use a mock/local server, or
2. Verify the CLI commands work (they will fail at submit, which is expected)

### Import Errors
If you see "Cannot use import statement outside a module", make sure `tsx` is installed:
```bash
npm install --save-dev tsx
```

### TypeScript Errors
Ensure TypeScript dependencies are installed:
```bash
npm install
```

## Next Steps

1. **Test the CLI** - Run `npm run cli -- help`
2. **Try Interactive Mode** - Run `npm run cli -- interactive`
3. **Build a Trace** - Follow the examples above
4. **Set Up API** - Configure your API key and URL for real testing

## Architecture

```
example/cli.ts          # Main CLI entry point
src/parallax/index.ts   # ParallaxClient and ParallaxTrace classes
tsconfig.cli.json       # TypeScript config for CLI
package.json            # npm scripts
```

## CLI Commands Reference

| Command | Alias | Description |
|---------|-------|-------------|
| `create <name>` | - | Create new trace |
| `add-attribute` | `attr` | Add attribute |
| `add-event` | `event` | Add event |
| `add-tag` | `tag` | Add tag |
| `set-tx` | `tx` | Set transaction |
| `submit` | - | Submit trace |
| `interactive` | `i` | Interactive mode |
| `builder` | `demo` | Builder demo |
| `help` | `-h`, `--help` | Show help |

Enjoy using the Parallax SDK CLI! 🚀
