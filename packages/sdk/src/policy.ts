/**
 * Client-side copies of the registry mint rules. The registry is authoritative.
 */

export function isSubset(requested: string[], allowed: string[]): boolean {
  if (new Set(requested).size !== requested.length) return false;
  const set = new Set(allowed);
  return requested.every((value) => set.has(value));
}

export interface HopBounds {
  scopes: string[];
  aud: string[];
  exp: number;
}

function asStringArray(value: unknown): string[] | null {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.split(/\s+/).filter(Boolean);
  }
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    const values = value.filter((item) => item.trim().length > 0);
    return values.length > 0 ? values : null;
  }
  return null;
}

export function hopBounds(hop: unknown): HopBounds | null {
  if (!hop || typeof hop !== "object") return null;
  const record = hop as Record<string, unknown>;
  const scopes = asStringArray(record.scopes ?? record.scope);
  const aud = asStringArray(record.aud ?? record.audience);
  const exp =
    typeof record.exp === "number"
      ? record.exp
      : typeof record.expires_at === "number"
        ? record.expires_at
        : null;
  if (!scopes || !aud || aud.length === 0 || exp === null) return null;
  return { scopes, aud, exp };
}

export function hopNarrows(current: unknown, previous: unknown): boolean {
  const next = hopBounds(current);
  const prior = hopBounds(previous);
  if (!next || !prior) return false;
  if (!isSubset(next.scopes, prior.scopes)) return false;
  if (!next.aud.every((value) => prior.aud.includes(value))) return false;
  if (next.exp > prior.exp) return false;
  return true;
}
