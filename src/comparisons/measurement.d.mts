export const USAGE_FIELDS: readonly string[];
export const MEASUREMENT_PARSERS: Readonly<Record<string, {
  parserVersion: string;
  runtimeVersions: readonly string[];
}>>;
export const MEASUREMENT_ERROR_KINDS: readonly string[];
export const MEASUREMENT_REASONS: readonly string[];
export function validateMeasurement(value: unknown): unknown;
export function sumCounters(values: unknown[]): number | null;
