import { exactKeys, boundedText } from '../comparisons/assessment.mjs';
import { fail } from '../sources/errors.mjs';
import { validateComparisonRule } from '../appearances/comparison-rule.mjs';

const kind = 'starting-declaration-invalid';
const id = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value);
function text(value, limit, multiline = false) {
  boundedText(value, limit, multiline, kind);
  if (Buffer.from(value, 'utf8').toString('utf8') !== value) fail(kind);
  return value;
}
export function validateDeclaration(value) {
  exactKeys(value, ['request', 'requirements', 'ratings', 'budget'], ['title', 'comparisonRule'], kind);
  const request = text(value.request, 16384, true);
  if (Buffer.byteLength(request) > 65536) fail(kind);
  if (!Array.isArray(value.requirements) || !value.requirements.length || value.requirements.length > 24
    || !Array.isArray(value.ratings) || value.ratings.length > 8) fail(kind);
  const requirements = value.requirements.map(r => {
    exactKeys(r, ['id', 'label', 'critical'], [], kind);
    if (!id(r.id) || typeof r.critical !== 'boolean') fail(kind);
    return { id: r.id, label: text(r.label, 160), critical: r.critical };
  });
  const ratings = value.ratings.map(r => {
    exactKeys(r, ['id', 'label', 'lowAnchor', 'highAnchor'], [], kind);
    if (!id(r.id)) fail(kind);
    const lowAnchor = text(r.lowAnchor, 160), highAnchor = text(r.highAnchor, 160);
    if (lowAnchor.trim() === highAnchor.trim()) fail(kind);
    return { id: r.id, label: text(r.label, 160), lowAnchor, highAnchor };
  });
  if (!requirements.some(r => r.critical)
    || new Set([...requirements, ...ratings].map(r => r.id)).size !== requirements.length + ratings.length) fail(kind);
  exactKeys(value.budget, ['maxAttempts', 'maxTurnsPerAttempt', 'maxRecordedTokens'], [], kind);
  const { maxAttempts, maxTurnsPerAttempt, maxRecordedTokens } = value.budget;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 20
    || !Number.isInteger(maxTurnsPerAttempt) || maxTurnsPerAttempt < 1 || maxTurnsPerAttempt > 100
    || (maxRecordedTokens !== null && (!Number.isSafeInteger(maxRecordedTokens) || maxRecordedTokens < 1))) fail(kind);
  return { request, requirements, ratings, budget: { maxAttempts, maxTurnsPerAttempt, maxRecordedTokens },
    ...(Object.hasOwn(value, 'comparisonRule') ? { comparisonRule: validateComparisonRule(value.comparisonRule, value.budget) } : {}),
    ...(Object.hasOwn(value, 'title') ? { title: text(value.title, 120) } : {}) };
}
