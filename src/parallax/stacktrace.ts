/**
 * Stack trace capture utilities
 */
import type { StackFrame, StackTrace } from './types';

/**
 * Parse a V8/Node.js stack trace string into structured frames
 * @param stack Raw stack string from Error.stack
 * @returns Array of parsed stack frames
 */
function parseStackString(stack: string): StackFrame[] {
  const frames: StackFrame[] = [];
  const lines = stack.split('\n');

  for (const line of lines) {
    // Skip the first line (error message) and empty lines
    if (!line.trim().startsWith('at ')) {
      continue;
    }

    // Parse V8 stack frame format:
    // "    at functionName (filename:line:column)"
    // "    at filename:line:column"
    // "    at async functionName (filename:line:column)"
    const trimmed = line.trim().slice(3); // Remove "at "

    let functionName = '<anonymous>';
    let locationPart = trimmed;

    // Check if there's a function name before the location
    const parenMatch = trimmed.match(/^(.*?)\s*\((.+)\)$/);
    if (parenMatch) {
      functionName = parenMatch[1].replace(/^async\s+/, '').trim() || '<anonymous>';
      locationPart = parenMatch[2];
    }

    // Parse location: filename:line:column
    const locationMatch = locationPart.match(/^(.+):(\d+):(\d+)$/);
    if (locationMatch) {
      frames.push({
        functionName,
        fileName: locationMatch[1],
        lineNumber: parseInt(locationMatch[2], 10),
        columnNumber: parseInt(locationMatch[3], 10),
      });
    } else {
      // Fallback for unusual formats
      frames.push({
        functionName,
        fileName: locationPart,
        lineNumber: 0,
        columnNumber: 0,
      });
    }
  }

  return frames;
}

/**
 * Capture the current stack trace
 * @param skipFrames Number of frames to skip from the top (default: 1 to skip this function)
 * @returns Captured stack trace with parsed frames and raw string
 */
export function captureStackTrace(skipFrames: number = 1): StackTrace {
  const error = new Error();
  const rawStack = error.stack || '';

  // Parse all frames
  const allFrames = parseStackString(rawStack);

  // Skip internal frames (this function + any additional requested skips)
  // Add 1 to account for this function itself
  const frames = allFrames.slice(skipFrames + 1);

  return {
    frames,
    raw: rawStack,
  };
}

/**
 * Format a stack trace for storage/display
 * @param stackTrace The stack trace to format
 * @returns JSON string representation of the stack trace
 */
export function formatStackTrace(stackTrace: StackTrace): string {
  return JSON.stringify({
    frames: stackTrace.frames,
    raw: stackTrace.raw,
  });
}

/**
 * Format a stack trace as a human-readable string
 * @param stackTrace The stack trace to format
 * @returns Human-readable stack trace string
 */
export function formatStackTraceReadable(stackTrace: StackTrace): string {
  return stackTrace.frames
    .map((frame) => `  at ${frame.functionName} (${frame.fileName}:${frame.lineNumber}:${frame.columnNumber})`)
    .join('\n');
}
