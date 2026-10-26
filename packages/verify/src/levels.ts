const NAMES: Record<string, number> = {
  unverified: 0,
  email: 1,
  phone: 1,
  domain: 2,
  organisation: 3,
  organization: 3,
  kyb: 3,
};

function clampLevel(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(3, Math.max(0, Math.trunc(value)));
}

/**
 * Map the site/spec claim (`"domain"` or `2`) to the integer 0–3 used by
 * `minVerificationLevel`.
 */
export function parseVerificationLevel(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number") return clampLevel(value);
  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    if (trimmed in NAMES) return NAMES[trimmed]!;
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) return clampLevel(numeric);
  }
  return 0;
}

export function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function optionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  if (!value.every((item) => typeof item === "string")) return undefined;
  return value;
}
