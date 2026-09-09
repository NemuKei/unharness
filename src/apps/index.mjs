// Application registry for the registered-source core.
//
// Both adapters are imported statically so that path layout, control keys and
// context validation stay synchronous for the Node-only transaction/recovery
// path. Every adapter therefore keeps native RPC, YAML, JSON transforms and
// desktop-record reading behind lazy imports of its own.
import { application as codex } from './codex.mjs';
import { application as claude } from './claude.mjs';
import { fail } from '../sources/errors.mjs';

const REGISTRY = Object.freeze({ codex, claude });
export const APPLICATION_IDS = Object.freeze(Object.keys(REGISTRY));

// Codex registrations predate this field and keep their exact stored context
// shape. An absent application therefore means Codex, not an invalid record.
export function applicationId(context) {
  const id =
    context !== null && typeof context === 'object' && !Array.isArray(context)
      ? (context.application ?? 'codex')
      : null;
  if (!Object.hasOwn(REGISTRY, id)) fail('invalid-request');
  return id;
}

export function applicationFor(context) {
  return REGISTRY[applicationId(context)];
}

export function applicationById(id) {
  if (typeof id !== 'string' || !Object.hasOwn(REGISTRY, id))
    fail('invalid-request');
  return REGISTRY[id];
}

export const homeOf = (context) => applicationFor(context).home(context);
