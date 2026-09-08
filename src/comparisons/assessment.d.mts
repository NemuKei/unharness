export function validateAssessment(value: unknown, kind?: string): unknown;
export function deriveAcceptance(value: unknown): Record<string, unknown>;
export function exactKeys(value: unknown, required: string[], optional?: string[], kind?: string): void;
export function boundedText(value: unknown, limit: number, multiline?: boolean, kind?: string, empty?: boolean): string;
