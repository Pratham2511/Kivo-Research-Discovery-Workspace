/**
 * Security utilities shared by all API routes.
 *
 * Provides:
 *  - In-memory IP-based rate limiter (sliding window)
 *  - Request body size guard
 *  - SSRF guard for outbound fetches (e.g. user-supplied PDF URLs)
 *  - JSON parse helper that caps content-length
 */

import { NextRequest, NextResponse } from "next/server";

// ──────────────────────────────────────────────────────────────────────────
// Rate limiting (in-memory, sliding window per IP)
// ──────────────────────────────────────────────────────────────────────────

interface RateBucket {
  /** timestamps of requests within the window */
  hits: number[];
}

const RATE_BUCKETS = new Map<string, RateBucket>();

/** Prune buckets older than 2× window to avoid memory leak */
const PRUNE_INTERVAL_MS = 60_000;
let lastPrune = Date.now();

function pruneOldBuckets(windowMs: number) {
  const now = Date.now();
  if (now - lastPrune < PRUNE_INTERVAL_MS) return;
  lastPrune = now;
  const cutoff = now - windowMs * 2;
  for (const [key, bucket] of RATE_BUCKETS) {
    bucket.hits = bucket.hits.filter((t) => t > cutoff);
    if (bucket.hits.length === 0) RATE_BUCKETS.delete(key);
  }
}

export interface RateLimitOptions {
  /** Maximum requests allowed in the window */
  max: number;
  /** Window duration in milliseconds */
  windowMs: number;
}

export interface RateLimitResult {
  ok: boolean;
  /** Remaining requests in current window */
  remaining: number;
  /** Seconds until the oldest request in the window expires (retry-after) */
  retryAfterSec: number;
}

/**
 * Check whether the calling IP has exceeded the rate limit.
 * Call this at the top of every expensive API route (AI calls, search, etc.)
 */
export function checkRateLimit(
  req: NextRequest,
  opts: RateLimitOptions,
): RateLimitResult {
  const ip = getClientIP(req);
  const key = `${ip}:${req.nextUrl.pathname}:${req.method}`;
  const now = Date.now();
  const windowStart = now - opts.windowMs;

  pruneOldBuckets(opts.windowMs);

  const bucket = RATE_BUCKETS.get(key) || { hits: [] };
  bucket.hits = bucket.hits.filter((t) => t > windowStart);
  bucket.hits.push(now);
  RATE_BUCKETS.set(key, bucket);

  if (bucket.hits.length > opts.max) {
    const oldest = bucket.hits[0];
    const retryAfterSec = Math.ceil((oldest + opts.windowMs - now) / 1000);
    return { ok: false, remaining: 0, retryAfterSec: Math.max(1, retryAfterSec) };
  }

  return {
    ok: true,
    remaining: Math.max(0, opts.max - bucket.hits.length),
    retryAfterSec: 0,
  };
}

/** Build a 429 NextResponse for rate-limited requests */
export function rateLimitedResponse(res: RateLimitResult): NextResponse {
  return NextResponse.json(
    {
      error: "Rate limit exceeded. Please slow down.",
      retryAfterSec: res.retryAfterSec,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(res.retryAfterSec),
        "X-RateLimit-Remaining": "0",
      },
    },
  );
}

export function getClientIP(req: NextRequest): string {
  // Standard headers used by reverse proxies (Caddy, Nginx, Cloudflare)
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

// ──────────────────────────────────────────────────────────────────────────
// Body size guard
// ──────────────────────────────────────────────────────────────────────────

export const DEFAULT_MAX_BODY_BYTES = 256 * 1024; // 256 KB

/**
 * Reads the request body as JSON, but rejects payloads larger than maxBytes.
 * Also rejects malformed JSON gracefully.
 */
export async function readJsonBody<T = unknown>(
  req: NextRequest,
  maxBytes: number = DEFAULT_MAX_BODY_BYTES,
): Promise<{ ok: true; data: T } | { ok: false; response: NextResponse }> {
  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > maxBytes) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `Request body too large (max ${maxBytes} bytes)` },
        { status: 413 },
      ),
    };
  }

  let text: string;
  try {
    // Read the body as a stream and abort if it exceeds maxBytes.
    const reader = req.body?.getReader();
    if (!reader) {
      // No body — try the legacy .text() method
      text = await req.text();
    } else {
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          total += value.byteLength;
          if (total > maxBytes) {
            try {
              await reader.cancel();
            } catch {
              /* ignore */
            }
            return {
              ok: false,
              response: NextResponse.json(
                { error: `Request body too large (max ${maxBytes} bytes)` },
                { status: 413 },
              ),
            };
          }
          chunks.push(value);
        }
      }
      text = new TextDecoder().decode(
        chunks.reduce((acc, c) => {
          const merged = new Uint8Array(acc.byteLength + c.byteLength);
          merged.set(acc, 0);
          merged.set(c, acc.byteLength);
          return merged;
        }, new Uint8Array(0)),
      );
    }
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Failed to read request body" },
        { status: 400 },
      ),
    };
  }

  try {
    const data = JSON.parse(text) as T;
    return { ok: true, data };
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Invalid JSON in request body" },
        { status: 400 },
      ),
    };
  }
}

// ──────────────────────────────────────────────────────────────────────────
// SSRF guard for outbound fetches
// ──────────────────────────────────────────────────────────────────────────

/** List of hostnames that must never be fetched from the server */
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "ip6-localhost",
  "ip6-loopback",
  "metadata.google.internal", // GCP metadata endpoint
  "metadata", // Azure
  "169.254.169.254", // AWS / GCP / Azure metadata IP
]);

/** Check if a string is a private/loopback IPv4 or IPv6 address */
function isPrivateIp(ip: string): boolean {
  // IPv4
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // 127.0.0.0/8 (loopback)
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local + cloud metadata)
    if (a >= 224) return true; // multicast / reserved
  }
  // IPv6 — loopback, link-local, unique-local
  if (ip === "::1") return true;
  if (ip.startsWith("fe80:")) return true;
  if (ip.startsWith("fc00:") || ip.startsWith("fd00:")) return true;
  return false;
}

export interface SsrfCheckResult {
  ok: boolean;
  reason?: string;
  url?: URL;
}

/**
 * Validate that an outbound URL is safe to fetch from the server.
 * - Must be http(s)
 * - Must NOT point at localhost / loopback / private IP ranges / cloud metadata
 */
export function validateOutboundUrl(rawUrl: string): SsrfCheckResult {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "Malformed URL" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: `Disallowed protocol: ${url.protocol}` };
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { ok: false, reason: `Blocked hostname: ${hostname}` };
  }

  if (isPrivateIp(hostname)) {
    return { ok: false, reason: `Blocked private/loopback IP: ${hostname}` };
  }

  // Block common username:password tricks (e.g. http://evil.com@127.0.0.1)
  if (url.username || url.password) {
    return { ok: false, reason: "URL must not contain credentials" };
  }

  return { ok: true, url };
}

// ──────────────────────────────────────────────────────────────────────────
// Input sanitization helpers
// ──────────────────────────────────────────────────────────────────────────

/** Max length for any user-supplied free-text string field (queries, abstracts, etc.) */
export const MAX_QUERY_LENGTH = 1000;
export const MAX_ABSTRACT_LENGTH = 16_000;
export const MAX_TITLE_LENGTH = 1000;
export const MAX_AUTHOR_NAME_LENGTH = 300;

/** Truncate a string to N chars (defensive — never trust client sizes) */
export function truncate(value: string | undefined | null, max: number): string {
  if (!value) return "";
  return value.length > max ? value.slice(0, max) : value;
}

/** Validate that a string is non-empty after trimming and within max length */
export function isValidQuery(value: unknown, max = MAX_QUERY_LENGTH): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= max
  );
}
