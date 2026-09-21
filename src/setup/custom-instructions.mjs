import { createHash } from 'node:crypto';
import { fail } from '../sources/errors.mjs';

export const MAX_CUSTOM_INSTRUCTION_BYTES = 8192;
export function validateCustomInstructions(text) {
  if (typeof text !== 'string' || !text.trim() || !text.isWellFormed()
    || Buffer.byteLength(text, 'utf8') > MAX_CUSTOM_INSTRUCTION_BYTES
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(text))
    fail('setup-proposal-invalid');
  return text;
}

// Immutable setup proposals carry the exact body. Public plan metadata omits it.
export function getCustomGuide(value) {
  const text = validateCustomInstructions(value);
  return { id: 'unharness-custom-v1', text,
    digest: createHash('sha256').update(text, 'utf8').digest('hex'),
    reviewedOn: null, references: [] };
}
