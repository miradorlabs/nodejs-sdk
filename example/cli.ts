#!/usr/bin/env node
/**
 * CLI tool for testing the Parallax SDK locally
 *
 * Usage:
 *   npm run cli                                    # Interactive demo
 *   npm run cli -- create <name>                   # Create a new trace
 *   npm run cli -- add-attribute <key> <value>     # Add attribute to trace (requires trace name first)
 *   npm run cli -- add-event <name> [details]      # Add event to trace
 *   npm run cli -- add-tag <tag>                   # Add tag to trace
 *   npm run cli -- set-tx <hash> <chainId>         # Set transaction hash
 *   npm run cli -- submit                          # Submit the trace
 *   npm run cli -- builder                         # Use the builder pattern demo
 *   npm run cli -- interactive                     # Interactive mode with prompts
 */

import { ParallaxClient, ParallaxTrace } from '../src/parallax';
import * as readline from 'readline';

// Configuration from environment variables
const API_KEY = process.env.PARALLAX_API_KEY;
const API_URL = process.env.GRPC_BASE_URL_API || 'parallax-gateway.dev.mirador.org:443';

// In-memory trace builder for command mode
let currentTrace: ParallaxTrace | null = null;
let currentTraceName: string | null = null;

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

function log(message: string, color: string = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logSection(title: string) {
  console.log('\n' + '='.repeat(60));
  log(title, colors.bright + colors.blue);
  console.log('='.repeat(60));
}

function logSuccess(message: string) {
  log(`✓ ${message}`, colors.green);
}

function logError(message: string) {
  log(`✗ ${message}`, colors.red);
}

function logInfo(message: string) {
  log(`ℹ ${message}`, colors.cyan);
}

function logWarning(message: string) {
  log(`⚠️  ${message}`, colors.yellow);
}

// Initialize client
const client = new ParallaxClient(API_KEY, API_URL);

// Command: Create a new trace
function createTrace(traceName: string) {
  if (!traceName) {
    logError('Trace name is required');
    logInfo('Usage: npm run cli -- create <trace-name>');
    process.exit(1);
  }

  currentTrace = client.trace(traceName);
  currentTraceName = traceName;
  logSuccess(`Trace "${traceName}" created`);
  logInfo('You can now add attributes, events, tags, or transaction hashes');
  logInfo('Commands: add-attribute, add-event, add-tag, set-tx, submit');
}

// Command: Add attribute
function addAttribute(key: string, value: string) {
  if (!currentTrace) {
    logError('No active trace. Create one first with: npm run cli -- create <name>');
    process.exit(1);
  }

  if (!key || !value) {
    logError('Both key and value are required');
    logInfo('Usage: npm run cli -- add-attribute <key> <value>');
    process.exit(1);
  }

  // Try to parse value as number or boolean
  let parsedValue: string | number | boolean = value;
  if (value === 'true') parsedValue = true;
  else if (value === 'false') parsedValue = false;
  else if (!isNaN(Number(value))) parsedValue = Number(value);

  currentTrace.addAttribute(key, parsedValue);
  logSuccess(`Added attribute: ${key} = ${parsedValue} (${typeof parsedValue})`);
}

// Command: Add event
function addEvent(eventName: string, details?: string) {
  if (!currentTrace) {
    logError('No active trace. Create one first with: npm run cli -- create <name>');
    process.exit(1);
  }

  if (!eventName) {
    logError('Event name is required');
    logInfo('Usage: npm run cli -- add-event <event-name> [details-json]');
    process.exit(1);
  }

  let parsedDetails: any = details;
  if (details) {
    try {
      parsedDetails = JSON.parse(details);
    } catch (e) {
      // If not valid JSON, treat as string
      parsedDetails = details;
    }
  }

  currentTrace.addEvent(eventName, parsedDetails);
  logSuccess(`Added event: ${eventName}${details ? ` with details` : ''}`);
}

// Command: Add tag
function addTag(tag: string) {
  if (!currentTrace) {
    logError('No active trace. Create one first with: npm run cli -- create <name>');
    process.exit(1);
  }

  if (!tag) {
    logError('Tag is required');
    logInfo('Usage: npm run cli -- add-tag <tag>');
    process.exit(1);
  }

  currentTrace.addTag(tag);
  logSuccess(`Added tag: ${tag}`);
}

// Command: Set transaction hash
function setTxHash(txHash: string, chainId: string, details?: string) {
  if (!currentTrace) {
    logError('No active trace. Create one first with: npm run cli -- create <name>');
    process.exit(1);
  }

  if (!txHash || !chainId) {
    logError('Both txHash and chainId are required');
    logInfo('Usage: npm run cli -- set-tx <txHash> <chainId> [details]');
    process.exit(1);
  }

  currentTrace.setTxHash(txHash, chainId, details);
  logSuccess(`Set transaction hash: ${txHash} on ${chainId}`);
}

// Command: Submit trace
async function submitTrace() {
  if (!currentTrace) {
    logError('No active trace. Create one first with: npm run cli -- create <name>');
    process.exit(1);
  }

  logInfo('Submitting trace...');

  try {
    const response = await currentTrace.submit();
    logSuccess('Trace submitted successfully!');
    logInfo(`Trace ID: ${response.traceId}`);
    logInfo(`Status: ${response.status?.code}`);

    // Reset current trace
    currentTrace = null;
    currentTraceName = null;
  } catch (error) {
    logError(`Failed to submit trace: ${error}`);
    throw error;
  }
}

// Interactive mode with readline
async function interactiveMode() {
  logSection('Interactive Mode');
  logInfo('Build a trace interactively. Type "help" for commands or "exit" to quit.');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: colors.cyan + 'parallax> ' + colors.reset,
  });

  const showHelp = () => {
    console.log(`
${colors.bright}Available Commands:${colors.reset}
  ${colors.green}create <name>${colors.reset}                      Create a new trace (use quotes for multi-word names)
  ${colors.green}attr <key> <value>${colors.reset}                 Add an attribute (alias: attribute)
  ${colors.green}event <name> [details]${colors.reset}             Add an event (details can be JSON)
  ${colors.green}tag <tag>${colors.reset}                          Add a tag
  ${colors.green}tx <hash> <chainId> [details]${colors.reset}      Set transaction hash (alias: set-tx, settx)
  ${colors.green}submit${colors.reset}                             Submit the current trace
  ${colors.green}status${colors.reset}                             Show current trace status
  ${colors.green}help${colors.reset}                               Show this help
  ${colors.green}exit${colors.reset}                               Exit interactive mode (alias: quit)

${colors.bright}Tips:${colors.reset}
  - Use quotes for multi-word values: ${colors.yellow}create "my swap trace"${colors.reset}
  - Use quotes for JSON: ${colors.yellow}event test '{"key":"value"}'${colors.reset}
  - Both single and double quotes work

${colors.bright}Examples:${colors.reset}
  create my_swap_trace
  create "My Complex Trace Name"
  attr user 0xabc123
  attr slippage_bps 25
  tag swap
  event wallet_connected '{"wallet":"MetaMask"}'
  event "transaction completed" "with success"
  tx 0x123abc ethereum
  set-tx 0x123abc 1 "Alternative syntax"
  submit
    `);
  };

  const showStatus = () => {
    if (!currentTrace) {
      logWarning('No active trace');
      logInfo('Create one with: create <name>');
    } else {
      logSuccess(`Active trace: ${currentTraceName}`);
      logInfo('Trace is ready. You can add more data or submit it.');
    }
  };

  // Parse command line with support for quoted strings
  const parseCommandLine = (line: string): { command: string; args: string[] } => {
    const trimmed = line.trim();
    const parts: string[] = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';

    for (let i = 0; i < trimmed.length; i++) {
      const char = trimmed[i];

      if ((char === '"' || char === "'") && !inQuotes) {
        inQuotes = true;
        quoteChar = char;
      } else if (char === quoteChar && inQuotes) {
        inQuotes = false;
        quoteChar = '';
      } else if (char === ' ' && !inQuotes) {
        if (current) {
          parts.push(current);
          current = '';
        }
      } else {
        current += char;
      }
    }

    if (current) {
      parts.push(current);
    }

    return {
      command: parts[0] || '',
      args: parts.slice(1),
    };
  };

  rl.prompt();

  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      rl.prompt();
      return;
    }

    const { command, args } = parseCommandLine(trimmed);

    try {
      switch (command) {
        case 'help':
          showHelp();
          break;

        case 'create':
          createTrace(args[0]);
          break;

        case 'attr':
        case 'attribute':
          addAttribute(args[0], args[1]);
          break;

        case 'event':
          addEvent(args[0], args.slice(1).join(' '));
          break;

        case 'tag':
          addTag(args[0]);
          break;

        case 'tx':
        case 'set-tx':
        case 'settx':
          setTxHash(args[0], args[1], args.slice(2).join(' '));
          break;

        case 'submit':
          await submitTrace();
          break;

        case 'status':
          showStatus();
          break;

        case 'exit':
        case 'quit':
          log('Goodbye!', colors.green);
          rl.close();
          return;

        default:
          logError(`Unknown command: ${command}`);
          logInfo('Type "help" for available commands');
      }
    } catch (error) {
      logError(`Command failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    rl.prompt();
  });

  rl.on('close', () => {
    process.exit(0);
  });
}

// Example: Builder pattern demo
async function builderDemo() {
  logSection('Builder Pattern Demo');

  try {
    logInfo('Building trace with fluent API...');

    const response = await client.trace('swap_execution_demo')
      .addAttribute('user', '0xabc123def456')
      .addAttribute('slippage_bps', 25)
      .addAttribute('isPremium', true)
      .addTag('dex')
      .addTag('swap')
      .addTag('demo')
      .addEvent('wallet_connected', { wallet: 'MetaMask', version: '10.0.0' })
      .addEvent('quote_requested', { token_in: 'ETH', token_out: 'USDC', amount: '1.0' })
      .addEvent('quote_received', { price: 2500, slippage: 0.25 })
      .addEvent('tx_signed')
      .submit();

    logSuccess('Trace created with builder!');
    logInfo(`Trace ID: ${response.traceId}`);

    return response;
  } catch (error) {
    logError(`Failed to create trace with builder: ${error}`);
    throw error;
  }
}

// Show configuration
function showConfig() {
  logSection('Configuration');
  logInfo(`API URL: ${API_URL}`);
  logInfo(`API Key: ${API_KEY ? '***' + API_KEY.slice(-4) : 'Not set'}`);

  if (!API_KEY) {
    logWarning('PARALLAX_API_KEY not set in environment');
    logInfo('Set it with: export PARALLAX_API_KEY=your-key-here');
  }
}

// Show usage
function showUsage() {
  logSection('Parallax SDK CLI - Usage');

  console.log(`
${colors.bright}Build a Trace:${colors.reset}
  ${colors.green}npm run cli -- create <name>${colors.reset}              Create a new trace
  ${colors.green}npm run cli -- add-attribute <key> <value>${colors.reset} Add an attribute
  ${colors.green}npm run cli -- add-event <name> [details]${colors.reset}  Add an event
  ${colors.green}npm run cli -- add-tag <tag>${colors.reset}               Add a tag
  ${colors.green}npm run cli -- set-tx <hash> <chain>${colors.reset}       Set transaction hash
  ${colors.green}npm run cli -- submit${colors.reset}                      Submit the trace

${colors.bright}Demos & Modes:${colors.reset}
  ${colors.green}npm run cli -- interactive${colors.reset}                 Interactive mode
  ${colors.green}npm run cli -- builder${colors.reset}                     Builder pattern demo
  ${colors.green}npm run cli -- help${colors.reset}                        Show this help

${colors.bright}Environment Variables:${colors.reset}
  ${colors.cyan}PARALLAX_API_KEY${colors.reset}                Your Parallax API key
  ${colors.cyan}GRPC_BASE_URL_API${colors.reset}               API URL (default: gateway-parallax-dev.mirador.org:443)

${colors.bright}Example Workflow:${colors.reset}
  ${colors.yellow}# Create a trace${colors.reset}
  npm run cli -- create my_swap_trace

  ${colors.yellow}# Add data to the trace${colors.reset}
  npm run cli -- add-attribute user 0xabc123
  npm run cli -- add-attribute slippage_bps 25
  npm run cli -- add-tag swap
  npm run cli -- add-event wallet_connected '{"wallet":"MetaMask"}'
  npm run cli -- add-event quote_received

  ${colors.yellow}# Set transaction hash (optional)${colors.reset}
  npm run cli -- set-tx 0x123abc ethereum "Swap transaction"

  ${colors.yellow}# Submit the trace${colors.reset}
  npm run cli -- submit

${colors.bright}Interactive Mode:${colors.reset}
  ${colors.yellow}npm run cli -- interactive${colors.reset}
  Then use commands like:
    create my_trace
    attr user 0xabc
    event wallet_connected
    submit
  `);
}

// Main CLI function
async function main() {
  const command = process.argv[2];
  const args = process.argv.slice(3);

  // Show usage if help flag
  if (!command || command === '-h' || command === '--help' || command === 'help') {
    showUsage();
    return;
  }

  showConfig();

  try {
    switch (command) {
      case 'create':
        createTrace(args[0]);
        break;

      case 'add-attribute':
      case 'attr':
        addAttribute(args[0], args[1]);
        break;

      case 'add-event':
      case 'event':
        addEvent(args[0], args.slice(1).join(' '));
        break;

      case 'add-tag':
      case 'tag':
        addTag(args[0]);
        break;

      case 'set-tx':
      case 'tx':
        setTxHash(args[0], args[1], args.slice(2).join(' '));
        break;

      case 'submit':
        await submitTrace();
        break;

      case 'interactive':
      case 'i':
        await interactiveMode();
        break;

      case 'builder':
      case 'demo':
        await builderDemo();
        break;

      default:
        logError(`Unknown command: ${command}`);
        logInfo('Run with --help to see available commands');
        process.exit(1);
    }
  } catch (error) {
    logError(`\nCLI execution failed: ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run the CLI
main().catch((error) => {
  logError(`Unhandled error: ${error}`);
  process.exit(1);
});
