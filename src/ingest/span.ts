/**
 * Span — a handle to a unit of work within a trace.
 *
 * Create one with `trace.startSpan(name)` (manual lifecycle) or the
 * `trace.span(name, fn)` wrapper (auto-ends on return/throw). Events recorded
 * via a span carry its span id, so the backend nests them under the span in the
 * trace timeline. Spans can nest via `span.startSpan(childName)`.
 */
import type { Trace } from './trace';
import type { SpanEndOptions, SpanOptions } from './types';
import { Severity } from '@miradorlabs/plugins';
import type { AddEventOptions } from '@miradorlabs/plugins';

export class Span {
  private trace: Trace;
  private spanId: string;
  /** Live reference to the SpanStart attributes buffered on the trace. */
  private attributes: { [key: string]: string };
  private ended: boolean = false;
  private noop: boolean;

  /** @internal Constructed by Trace.startSpan / Span.startSpan. */
  constructor(trace: Trace, spanId: string, attributes: { [key: string]: string }, noop: boolean = false) {
    this.trace = trace;
    this.spanId = spanId;
    this.attributes = attributes;
    this.noop = noop;
  }

  /** The W3C span id (16 lowercase hex chars). */
  get id(): string {
    return this.spanId;
  }

  /** The W3C span id (16 lowercase hex chars). */
  getSpanId(): string {
    return this.spanId;
  }

  /**
   * Set a span attribute. Reliably included when set synchronously, before the
   * span's first flush (objects are stringified, primitives coerced to string).
   * @returns This span for chaining
   */
  setAttribute(key: string, value: string | number | boolean | object): this {
    if (this.noop || this.ended) return this;
    this.attributes[key] = stringifyValue(value);
    this.trace._scheduleFlush();
    return this;
  }

  /**
   * Set multiple span attributes.
   * @returns This span for chaining
   */
  setAttributes(attributes: { [key: string]: string | number | boolean | object }): this {
    if (this.noop || this.ended) return this;
    for (const [key, value] of Object.entries(attributes)) {
      this.attributes[key] = stringifyValue(value);
    }
    this.trace._scheduleFlush();
    return this;
  }

  /**
   * Record an event nested under this span.
   * @returns This span for chaining
   */
  addEvent(eventName: string, details?: string | object, options?: AddEventOptions): this {
    if (this.noop || this.ended) return this;
    this.trace._spanEvent(this.spanId, eventName, details, options);
    return this;
  }

  /** Record an info-level event nested under this span. */
  info(name: string, details?: string | object, options?: Omit<AddEventOptions, 'severity'>): this {
    return this.addEvent(name, details, { ...options, severity: Severity.Info });
  }

  /** Record a warning-level event nested under this span. */
  warn(name: string, details?: string | object, options?: Omit<AddEventOptions, 'severity'>): this {
    return this.addEvent(name, details, { ...options, severity: Severity.Warn });
  }

  /** Record an error-level event nested under this span. */
  error(name: string, details?: string | object, options?: Omit<AddEventOptions, 'severity'>): this {
    return this.addEvent(name, details, { ...options, severity: Severity.Error });
  }

  /**
   * Open a child span parented to this span.
   * @returns The child Span
   */
  startSpan(name: string, options?: SpanOptions): Span {
    if (this.noop || this.ended) return new Span(this.trace, NOOP_SPAN_ID, {}, true);
    return this.trace.startSpan(name, { ...options, parentSpanId: this.spanId });
  }

  /**
   * End the span. Optionally set an OTLP status (UNSET/OK/ERROR) and message.
   * Idempotent — a second call is ignored.
   */
  end(options?: SpanEndOptions): void {
    if (this.noop || this.ended) return;
    this.ended = true;
    this.trace._endSpan(this.spanId, options);
  }

  /** Whether end() has been called. */
  isEnded(): boolean {
    return this.ended;
  }
}

/** Sentinel id for noop spans (closed/sampled-out traces). */
export const NOOP_SPAN_ID = '0'.repeat(16);

function stringifyValue(value: string | number | boolean | object): string {
  return typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);
}
