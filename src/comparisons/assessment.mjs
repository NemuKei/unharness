import { fail } from '../sources/errors.mjs';
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export function exactKeys(value, required, optional = [], kind = 'comparison-record-invalid') {
  if (!object(value) || required.some(key => !Object.hasOwn(value, key)) || Reflect.ownKeys(value).some(key => ![...required, ...optional].includes(key))) fail(kind);
}
export function boundedText(value, limit, multiline = false, kind = 'invalid-request', empty = false) {
  if (typeof value !== 'string' || value.length > limit || (!empty && !value.trim()) || (multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/ : /[\u0000-\u001f\u007f-\u009f]/).test(value)) fail(kind);
  return value;
}
const id = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value);
export function validateAssessment(value, kind = 'comparison-assessment-invalid') {
  exactKeys(value, ['outcome', 'requirements', 'ratings', 'provenance'], ['note'], kind);
  if (!['accepted', 'failed', 'abandoned', 'unknown'].includes(value.outcome) || !['user', 'agent'].includes(value.provenance)) fail(kind);
  const entries = (values, max, fields, project) => {
    if (!Array.isArray(values) || values.length > max || new Set(values.map(v => v?.id)).size !== values.length) fail(kind);
    return values.map(v => {
      exactKeys(v, fields, [], kind);
      if (!id(v.id)) fail(kind);
      const common = { id: v.id, label: boundedText(v.label, 160, false, kind) };
      return { ...common, ...project(v) };
    });
  };
  const requirements = entries(value.requirements, 24, ['id', 'label', 'critical', 'result'], v => {
    if (typeof v.critical !== 'boolean' || !['pass', 'fail', 'unknown'].includes(v.result)) fail(kind);
    return { critical: v.critical, result: v.result };
  });
  const ratings = entries(value.ratings, 8, ['id', 'label', 'score', 'lowAnchor', 'highAnchor', 'reason'], v => {
    if (!Number.isInteger(v.score) || v.score < 1 || v.score > 5) fail(kind);
    return { score: v.score, lowAnchor: boundedText(v.lowAnchor, 160, false, kind), highAnchor: boundedText(v.highAnchor, 160, false, kind), reason: boundedText(v.reason, 500, true, kind) };
  });
  if (new Set([...requirements, ...ratings].map(v => v.id)).size !== requirements.length + ratings.length) fail(kind);
  return { outcome: value.outcome, requirements, ratings, provenance: value.provenance,
    ...(Object.hasOwn(value, 'note') ? { note: boundedText(value.note, 2000, true, kind, true) } : {}) };
}
export function deriveAcceptance(assessment) {
  const { requirements } = assessment;
  const criticalFailed = requirements.filter(r => r.critical && r.result === 'fail').length;
  const criticalUnknown = requirements.filter(r => r.critical && r.result === 'unknown').length;
  const accepted = assessment.outcome === 'accepted' && criticalFailed === 0 && criticalUnknown === 0;
  return { accepted, basis: accepted ? requirements.length ? 'requirements-and-report' : 'reported-only' : 'not-accepted',
    fulfilledRequirements: requirements.filter(r => r.result === 'pass').length, totalRequirements: requirements.length, criticalFailed, criticalUnknown };
}
