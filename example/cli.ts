#!/usr/bin/env node
/**
 * CLI tool for testing the Mirador Ingest SDK
 *
 * Usage:
 *   npm run cli                    # Interactive mode
 *   npm run cli -- help            # Show help
 */

import 'dotenv/config';
import { Client, Trace, ChainName } from '../src/ingest';
import * as readline from 'readline';

// Configuration
const API_KEY = process.env.MIRADOR_API_KEY;
const API_URL = process.env.GRPC_BASE_URL_API || 'ingest-gateway-dev.mirador.org:443';

// State
let currentTrace: Trace | null = null;
let traceId: string | null = null;

// Colors
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

const log = {
  success: (msg: string) => console.log(`${c.green}✓ ${msg}${c.reset}`),
  error: (msg: string) => console.log(`${c.red}✗ ${msg}${c.reset}`),
  info: (msg: string) => console.log(`${c.cyan}ℹ ${msg}${c.reset}`),
  warn: (msg: string) => console.log(`${c.yellow}⚠ ${msg}${c.reset}`),
};

// Valid chains
const VALID_CHAINS: ChainName[] = ['ethereum', 'polygon', 'arbitrum', 'base', 'optimism', 'bsc'];

// Initialize client
const client = new Client(API_KEY, { apiUrl: API_URL });

// Parse value (number, boolean, JSON, or string)
function parseValue(value: string): string | number | boolean | object {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (!isNaN(Number(value)) && value !== '') return Number(value);
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

// Commands
async function create(name: string) {
  if (!name) {
    log.error('Usage: create <name>');
    return;
  }
  currentTrace = client.trace({ name });
  traceId = null;
  log.success(`Created trace: ${name}`);
}

function attr(key: string, value: string) {
  if (!currentTrace) {
    log.error('No trace. Run "create <name>" first');
    return;
  }
  if (!key || value === undefined) {
    log.error('Usage: attr <key> <value>');
    return;
  }
  currentTrace.addAttribute(key, parseValue(value));
  log.success(`Added attribute: ${key} = ${value}`);
}

function tag(tagName: string) {
  if (!currentTrace) {
    log.error('No trace. Run "create <name>" first');
    return;
  }
  if (!tagName) {
    log.error('Usage: tag <name>');
    return;
  }
  currentTrace.addTag(tagName);
  log.success(`Added tag: ${tagName}`);
}

function event(name: string, details?: string) {
  if (!currentTrace) {
    log.error('No trace. Run "create <name>" first');
    return;
  }
  if (!name) {
    log.error('Usage: event <name> [details]');
    return;
  }
  let parsedDetails: string | object | undefined;
  if (details) {
    try {
      parsedDetails = JSON.parse(details);
    } catch {
      parsedDetails = details;
    }
  }
  currentTrace.addEvent(name, parsedDetails);
  log.success(`Added event: ${name}${details ? ' (with details)' : ''}`);
}

function tx(hash: string, chain: string, details?: string) {
  if (!currentTrace) {
    log.error('No trace. Run "create <name>" first');
    return;
  }
  if (!hash || !chain) {
    log.error('Usage: tx <hash> <chain> [details]');
    log.info(`Chains: ${VALID_CHAINS.join(', ')}`);
    return;
  }
  if (!VALID_CHAINS.includes(chain as ChainName)) {
    log.error(`Invalid chain. Use: ${VALID_CHAINS.join(', ')}`);
    return;
  }
  currentTrace.addTxHint(hash, chain as ChainName, details);
  log.success(`Added tx hint: ${hash} on ${chain}`);
}

async function submit() {
  if (!currentTrace) {
    log.error('No trace. Run "create <name>" first');
    return;
  }
  log.info('Submitting trace...');
  try {
    traceId = (await currentTrace.create()) || null;
    if (traceId) {
      log.success(`Trace submitted! ID: ${traceId}`);
    } else {
      log.error('Failed to submit trace');
    }
  } catch (err) {
    log.error(`Submit failed: ${err instanceof Error ? err.message : err}`);
  }
}

async function close(reason?: string) {
  if (!currentTrace) {
    log.error('No trace to close');
    return;
  }
  try {
    await currentTrace.close(reason || 'CLI close');
    log.success(`Trace closed${reason ? `: ${reason}` : ''}`);
    currentTrace = null;
    traceId = null;
  } catch (err) {
    log.error(`Close failed: ${err instanceof Error ? err.message : err}`);
  }
}

function status() {
  if (!currentTrace) {
    log.info('No active trace');
  } else {
    log.info(`Active trace${traceId ? ` (ID: ${traceId})` : ' (not submitted)'}`);
  }
}

function showHelp() {
  console.log(`
${c.bold}Mirador SDK CLI${c.reset}

${c.bold}Commands:${c.reset}
  ${c.green}create <name>${c.reset}              Create a new trace
  ${c.green}attr <key> <value>${c.reset}         Add an attribute
  ${c.green}tag <name>${c.reset}                 Add a tag
  ${c.green}event <name> [details]${c.reset}     Add an event
  ${c.green}tx <hash> <chain> [details]${c.reset} Add a transaction hint
  ${c.green}submit${c.reset}                     Submit the trace
  ${c.green}close [reason]${c.reset}             Close the trace
  ${c.green}status${c.reset}                     Show current trace status
  ${c.green}help${c.reset}                       Show this help
  ${c.green}exit${c.reset}                       Exit the CLI

${c.bold}Chains:${c.reset} ${VALID_CHAINS.join(', ')}

${c.bold}Example:${c.reset}
  create my_swap
  attr user 0xabc123
  attr amount 100
  tag swap
  event wallet_connected '{"wallet":"MetaMask"}'
  tx 0x123... ethereum "Swap tx"
  submit
  close "Completed"
`);
}

// Parse command line (handles quoted strings)
function parseArgs(line: string): string[] {
  const args: string[] = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = '';

  for (const char of line.trim()) {
    if ((char === '"' || char === "'") && !inQuotes) {
      inQuotes = true;
      quoteChar = char;
    } else if (char === quoteChar && inQuotes) {
      inQuotes = false;
      quoteChar = '';
    } else if (char === ' ' && !inQuotes) {
      if (current) {
        args.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }
  if (current) args.push(current);
  return args;
}

// Interactive mode
async function interactive() {
  console.log(`\n${c.bold}Mirador SDK CLI${c.reset}`);
  console.log(`API: ${API_URL}`);
  console.log(`Key: ${API_KEY ? `...${API_KEY.slice(-4)}` : 'not set'}`);
  console.log(`Type "help" for commands\n`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${c.cyan}mirador>${c.reset} `,
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const args = parseArgs(line);
    const cmd = args[0]?.toLowerCase();

    if (!cmd) {
      rl.prompt();
      return;
    }

    switch (cmd) {
      case 'create':
        await create(args[1]);
        break;
      case 'attr':
      case 'attribute':
        attr(args[1], args.slice(2).join(' '));
        break;
      case 'tag':
        tag(args[1]);
        break;
      case 'event':
        event(args[1], args.slice(2).join(' '));
        break;
      case 'tx':
        tx(args[1], args[2], args.slice(3).join(' '));
        break;
      case 'submit':
        await submit();
        break;
      case 'close':
        await close(args.slice(1).join(' '));
        break;
      case 'status':
        status();
        break;
      case 'help':
        showHelp();
        break;
      case 'exit':
      case 'quit':
        console.log('Goodbye!');
        rl.close();
        return;
      default:
        log.error(`Unknown command: ${cmd}. Type "help" for commands.`);
    }

    rl.prompt();
  });

  rl.on('close', () => process.exit(0));
}

// Main
const cmd = process.argv[2];
if (cmd === 'help' || cmd === '-h' || cmd === '--help') {
  showHelp();
} else {
  interactive();
}
