import { createHash } from 'node:crypto';

const text = "# Minimal working guide\n\n- Follow the user's goal and the project's documented requirements.\n- Inspect the relevant code and project information before changing behavior.\n- Keep changes focused and preserve unrelated work.\n- Verify results with checks appropriate to the change, and identify what remains unverified.\n";
const guide = Object.freeze({
  id: 'unharness-minimal-v1',
  text,
  digest: createHash('sha256').update(text, 'utf8').digest('hex'),
  reviewedOn: '2026-09-08',
  references: Object.freeze([
    'https://learn.chatgpt.com/guides/best-practices',
    'https://code.claude.com/docs/en/best-practices',
  ]),
});

export function getMinimalGuide() {
  return guide;
}
