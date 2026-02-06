// Stack Trace Utility Tests
import {
  captureStackTrace,
  formatStackTrace,
  formatStackTraceReadable,
} from '../src/ingest/stacktrace';
import type { StackTrace } from '../src/ingest/types';

describe('Stack Trace Utilities', () => {
  describe('captureStackTrace', () => {
    it('should capture the current stack trace', () => {
      const stack = captureStackTrace();

      expect(stack).toBeDefined();
      expect(stack.frames).toBeInstanceOf(Array);
      expect(stack.raw).toBeDefined();
      expect(typeof stack.raw).toBe('string');
    });

    it('should capture frames with correct structure', () => {
      const stack = captureStackTrace();

      expect(stack.frames.length).toBeGreaterThan(0);

      const firstFrame = stack.frames[0];
      expect(firstFrame).toHaveProperty('functionName');
      expect(firstFrame).toHaveProperty('fileName');
      expect(firstFrame).toHaveProperty('lineNumber');
      expect(firstFrame).toHaveProperty('columnNumber');
      expect(typeof firstFrame.functionName).toBe('string');
      expect(typeof firstFrame.fileName).toBe('string');
      expect(typeof firstFrame.lineNumber).toBe('number');
      expect(typeof firstFrame.columnNumber).toBe('number');
    });

    it('should skip the correct number of frames', () => {
      function innerFunction() {
        return captureStackTrace(0);
      }

      function outerFunction() {
        return innerFunction();
      }

      const stack = outerFunction();

      // The first frame should be innerFunction (since we skip 0 + 1 for captureStackTrace itself)
      expect(stack.frames[0].functionName).toContain('innerFunction');
    });

    it('should skip additional frames when specified', () => {
      function innerFunction() {
        return captureStackTrace(1); // Skip 1 additional frame
      }

      function outerFunction() {
        return innerFunction();
      }

      const stack = outerFunction();

      // First frame should now be outerFunction (skipped innerFunction)
      expect(stack.frames[0].functionName).toContain('outerFunction');
    });

    it('should include file path in fileName', () => {
      const stack = captureStackTrace();

      // At least one frame should have a recognizable file path
      const hasFilePath = stack.frames.some(
        (frame) => frame.fileName.includes('.ts') || frame.fileName.includes('.js')
      );
      expect(hasFilePath).toBe(true);
    });

    it('should have positive line and column numbers for valid frames', () => {
      const stack = captureStackTrace();

      // Most frames should have valid line/column numbers
      const validFrames = stack.frames.filter(
        (frame) => frame.lineNumber > 0 && frame.columnNumber > 0
      );
      expect(validFrames.length).toBeGreaterThan(0);
    });
  });

  describe('formatStackTrace', () => {
    it('should format stack trace as JSON string', () => {
      const stack = captureStackTrace();
      const formatted = formatStackTrace(stack);

      expect(typeof formatted).toBe('string');

      // Should be valid JSON
      const parsed = JSON.parse(formatted);
      expect(parsed).toHaveProperty('frames');
      expect(parsed).toHaveProperty('raw');
    });

    it('should preserve all frame data in formatted output', () => {
      const stack = captureStackTrace();
      const formatted = formatStackTrace(stack);
      const parsed = JSON.parse(formatted);

      expect(parsed.frames.length).toBe(stack.frames.length);
      expect(parsed.raw).toBe(stack.raw);

      if (stack.frames.length > 0) {
        expect(parsed.frames[0].functionName).toBe(stack.frames[0].functionName);
        expect(parsed.frames[0].fileName).toBe(stack.frames[0].fileName);
        expect(parsed.frames[0].lineNumber).toBe(stack.frames[0].lineNumber);
        expect(parsed.frames[0].columnNumber).toBe(stack.frames[0].columnNumber);
      }
    });
  });

  describe('formatStackTraceReadable', () => {
    it('should format stack trace as human-readable string', () => {
      const stack = captureStackTrace();
      const readable = formatStackTraceReadable(stack);

      expect(typeof readable).toBe('string');
      expect(readable).toContain('at ');
    });

    it('should include function names and file locations', () => {
      const mockStack: StackTrace = {
        frames: [
          {
            functionName: 'testFunction',
            fileName: '/path/to/file.ts',
            lineNumber: 42,
            columnNumber: 10,
          },
          {
            functionName: 'callerFunction',
            fileName: '/path/to/caller.ts',
            lineNumber: 15,
            columnNumber: 5,
          },
        ],
        raw: 'mock stack',
      };

      const readable = formatStackTraceReadable(mockStack);

      expect(readable).toContain('testFunction');
      expect(readable).toContain('/path/to/file.ts');
      expect(readable).toContain('42');
      expect(readable).toContain('10');
      expect(readable).toContain('callerFunction');
      expect(readable).toContain('/path/to/caller.ts');
    });

    it('should format each frame on a separate line', () => {
      const mockStack: StackTrace = {
        frames: [
          {
            functionName: 'func1',
            fileName: 'file1.ts',
            lineNumber: 1,
            columnNumber: 1,
          },
          {
            functionName: 'func2',
            fileName: 'file2.ts',
            lineNumber: 2,
            columnNumber: 2,
          },
        ],
        raw: 'mock',
      };

      const readable = formatStackTraceReadable(mockStack);
      const lines = readable.split('\n');

      expect(lines.length).toBe(2);
      expect(lines[0]).toContain('func1');
      expect(lines[1]).toContain('func2');
    });

    it('should handle empty frames array', () => {
      const emptyStack: StackTrace = {
        frames: [],
        raw: '',
      };

      const readable = formatStackTraceReadable(emptyStack);
      expect(readable).toBe('');
    });
  });

  describe('edge cases', () => {
    it('should handle anonymous functions', () => {
      const stack = (() => captureStackTrace())();

      expect(stack).toBeDefined();
      expect(stack.frames.length).toBeGreaterThan(0);
    });

    it('should handle async functions', async () => {
      async function asyncFunc() {
        return captureStackTrace();
      }

      const stack = await asyncFunc();

      expect(stack).toBeDefined();
      expect(stack.frames.length).toBeGreaterThan(0);
    });

    it('should handle deeply nested calls', () => {
      function level1() {
        return level2();
      }
      function level2() {
        return level3();
      }
      function level3() {
        return captureStackTrace();
      }

      const stack = level1();

      expect(stack.frames.length).toBeGreaterThanOrEqual(3);
    });
  });
});
