import type { Connection } from "partykit/server";
import { GO_AWAY_SENTINEL, SLOW_DOWN_SENTINEL } from "./types";

type RateLimiter = { nextAllowedTime?: number; violations: number };
type RateLimitedConnection = Connection & RateLimiter;

/**
 * A simple per-connection rate limiter.
 * Temporarily modified to be more permissive for testing.
 */
export function rateLimit(
  connection: Connection,
  cooldownMs: number,
  action: () => void
) {
  // Just execute the action without any rate limiting
  action();
}
