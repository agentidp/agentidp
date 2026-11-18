function clampLevel(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(3, Math.max(0, Math.trunc(value)));
}

/**
 * Map `verification_level` to the integer 0–3 used by `minVerificationLevel`.
 * The claim is an integer. Numeric strings `"0"`–`"3"` are accepted.
 * Name strings are not the claim format and are not mapped.
 */
export function parseVerificationLevel(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number") return clampLevel(value);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^[0-3]$/.test(trimmed)) return Number(trimmed);
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric) && trimmed !== "") return clampLevel(numeric);
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
