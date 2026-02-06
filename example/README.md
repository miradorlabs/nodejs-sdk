# Mirador SDK CLI Example

Interactive CLI for testing the Mirador Ingest SDK.

## Setup

```bash
# From the nodejs-client directory
npm install

# Set your API key
export MIRADOR_API_KEY=your-api-key
```

## Usage

```bash
npm run cli
```

This starts an interactive session where you can build and submit traces.

## Commands

| Command | Description |
|---------|-------------|
| `create <name>` | Create a new trace |
| `attr <key> <value>` | Add an attribute |
| `tag <name>` | Add a tag |
| `event <name> [details]` | Add an event |
| `tx <hash> <chain> [details]` | Add a transaction hint |
| `submit` | Submit the trace to the server |
| `close [reason]` | Close the trace |
| `status` | Show current trace status |
| `help` | Show available commands |
| `exit` | Exit the CLI |

## Example Session

```
$ npm run cli

Mirador SDK CLI
API: ingest-gateway-dev.mirador.org:443
Key: ...abc1
Type "help" for commands

mirador> create my_swap
✓ Created trace: my_swap

mirador> attr user 0xabc123
✓ Added attribute: user = 0xabc123

mirador> attr amount 100
✓ Added attribute: amount = 100

mirador> tag swap
✓ Added tag: swap

mirador> event wallet_connected '{"wallet":"MetaMask"}'
✓ Added event: wallet_connected (with details)

mirador> tx 0x123abc... ethereum "Swap transaction"
✓ Added tx hint: 0x123abc... on ethereum

mirador> submit
ℹ Submitting trace...
✓ Trace submitted! ID: abc123-def456-...

mirador> close "Completed successfully"
✓ Trace closed: Completed successfully

mirador> exit
Goodbye!
```

## Supported Chains

- ethereum
- polygon
- arbitrum
- base
- optimism
- bsc

## Configuration

| Environment Variable | Description | Default |
|---------------------|-------------|---------|
| `MIRADOR_API_KEY` | Your Mirador API key | - |
| `GRPC_BASE_URL_API` | Gateway URL | `ingest-gateway-dev.mirador.org:443` |
