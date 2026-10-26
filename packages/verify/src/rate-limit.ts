import type { RateLimitStore } from "./types.js";

let warnedInMemory = false;

export class MemoryRateLimitStore implements RateLimitStore {
  private readonly hits = new Map<string, number[]>();

  hit(key: string, windowMs: number, now = Date.now()): number {
    const start = now - windowMs;
    const existing = this.hits.get(key) ?? [];
    const kept = existing.filter((stamp) => stamp > start);
    kept.push(now);
    this.hits.set(key, kept);
    return kept.length;
  }
}

export function defaultRateLimitStore(): RateLimitStore {
  if (!warnedInMemory) {
    warnedInMemory = true;
    console.warn(
      "[@agentidp/verify] rateLimit has no Redis/Upstash store. Limits are in-memory on this process only. They do not enforce a global cap across instances.",
    );
  }
  return new MemoryRateLimitStore();
}

export function rateLimitKey(
  scope: "agent_id" | "owner_id" | undefined,
  agentId: string,
  ownerId?: string,
): string {
  if (scope === "owner_id" && ownerId) return `owner:${ownerId}`;
  return `agent:${agentId}`;
}
