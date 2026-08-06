/**
 * API key validation for the Mirador Ingest Gateway.
 *
 * The gateway checks the key prefix *before* it resolves a tenant, so a malformed
 * key is rejected there with no project attached — it surfaces as an anonymous
 * PermissionDenied that cannot be traced back to the caller. Validating in the SDK
 * turns that into an actionable error at construction time instead.
 */

/** Publishable key, browser-side only. */
export const WEB_KEY_PREFIX = 'mir_web_';

/** Secret key, safe to use from a server. */
export const SERVER_KEY_PREFIX = 'mir_srv_';

/** Thrown when an API key is present but not usable by this SDK. */
export class MiradorApiKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MiradorApiKeyError';
    // Required for `instanceof` to work when compiled down to ES5.
    Object.setPrototypeOf(this, MiradorApiKeyError.prototype);
  }
}

/** True when a usable key was supplied. Narrows away undefined/null/blank. */
export function hasApiKey(apiKey?: string | null): apiKey is string {
  return typeof apiKey === 'string' && apiKey.trim() !== '';
}

/** Redacted description of a key — safe to put in an error message. */
function describeKey(apiKey: string): string {
  return `${apiKey.slice(0, 4)}… (${apiKey.length} chars)`;
}

/**
 * Assert that `apiKey` is a server key.
 *
 * Web keys are rejected rather than passed through: the gateway validates them
 * against the calling origin, and a server has no Origin header to present, so a
 * `mir_web_` key fails there anyway — just silently, and only at request time.
 *
 * @throws {MiradorApiKeyError} if the key is not a `mir_srv_` key.
 */
export function assertServerApiKey(apiKey: string): void {
  if (apiKey.startsWith(SERVER_KEY_PREFIX)) {
    return;
  }

  // An unset env var stringified into the key — the most common cause by far.
  if (apiKey === 'undefined' || apiKey === 'null') {
    throw new MiradorApiKeyError(
      `Mirador API key is the literal string "${apiKey}", which means an unset environment ` +
        `variable was stringified. Set your server API key (starts with "${SERVER_KEY_PREFIX}"), ` +
        `or omit the key entirely to disable tracing.`
    );
  }

  if (apiKey.startsWith(WEB_KEY_PREFIX)) {
    throw new MiradorApiKeyError(
      `Cannot use a web API key ("${WEB_KEY_PREFIX}…") from Node — the gateway validates web keys ` +
        `against the browser origin, which a server cannot supply. Use a server key ` +
        `("${SERVER_KEY_PREFIX}…") with @miradorlabs/nodejs-sdk.`
    );
  }

  throw new MiradorApiKeyError(
    `Invalid Mirador API key: expected it to start with "${SERVER_KEY_PREFIX}", got ${describeKey(apiKey)}.`
  );
}
