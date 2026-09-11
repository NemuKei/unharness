import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { validUuid } from '../sources/observation-record.mjs';
import { exactKeys } from '../comparisons/assessment.mjs';
import { fail } from '../sources/errors.mjs';
import { recordedDesktopOrigin } from './desktop-origin.mjs';

const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const digest = text => createHash('sha256').update(text).digest('hex');
const bounded = (x, limit = 65536) => typeof x === 'string' && Buffer.byteLength(x) <= limit && Buffer.from(x).toString() === x;
// This is a versioned native-input projection, not a search through chat prose.
// The initial input must follow the native world/context, precede any model
// activity and have the matching native item-completed event for this task/turn.
export function projectReplayRequest(records, options) {
  exactKeys(options, ['taskId', 'request'], [], 'invalid-request');
  if (!Array.isArray(records) || !validUuid(options.taskId) || !bounded(options.request)) fail('invalid-request');
  const result = (status, reason, route = null, text = null) => ({ status, reason, route,
    bytes: text === null ? null : Buffer.byteLength(text), digest: text === null ? null : digest(text) });
  const metas = records.filter(r => r?.type === 'session_meta');
  const meta = metas.length === 1 ? metas[0].payload : null;
  if (!object(meta) || meta.id !== options.taskId || meta.cli_version !== '0.153.4'
    || !recordedDesktopOrigin(meta) || !['user', 'agent_created_thread'].includes(meta.thread_source)
    || meta.forked_from_id != null || meta.forked_from_thread_id != null) return result('unknown', 'request-route-unavailable');
  const route = meta.thread_source === 'user' ? 'user-created' : 'agent-created';
  let world = false, turnId = null, invalid = false;
  const responses = [], events = [];
  const append = (list, value) => { if (!list.some(x => isDeepStrictEqual(x, value))) list.push(value); };
  for (const r of records) {
    const p = r?.payload;
    if (!object(p)) continue;
    if (r.type === 'world_state' && p.full === true) world = true;
    if (r.type === 'turn_context') {
      if (!world || typeof p.turn_id !== 'string' || turnId !== null && turnId !== p.turn_id) invalid = true;
      turnId ??= p.turn_id;
    }
    if (r.type === 'response_item') {
      if (p.type === 'message' && ['user', 'developer', 'system'].includes(p.role)) {
        if (turnId !== null && p.role === 'user') append(responses, r);
      } else if (p.type === 'function_call_output' && turnId !== null) {
        append(responses, r);
        if (p.name !== 'create_thread' || p.namespace !== 'codex_app') break;
      } else break;
    }
    if (r.type === 'event_msg') {
      if (['agent_message', 'agent_reasoning', 'exec_command_begin', 'task_complete', 'turn_aborted'].includes(p.type)) break;
      if (p.type === 'item_completed') {
        if (!['UserMessage', 'FunctionCallOutput'].includes(p.item?.type)) break;
        append(events, r);
      }
    }
  }
  if (invalid || turnId === null || responses.length !== 1 || events.length !== 1) return result('unknown', 'request-evidence-unavailable', route);
  const input = responses[0].payload, event = events[0].payload, item = event.item;
  if (event.thread_id !== options.taskId || event.turn_id !== turnId || typeof input.id !== 'string'
    || !input.id) return result('unknown', 'request-evidence-conflict', route);
  let text;
  if (route === 'user-created') {
    // Native UserMessage and response message have different IDs. Their first
    // unique input pair is tied by task/turn, exact text and native input time.
    if (input.type !== 'message' || input.role !== 'user' || item.type !== 'UserMessage'
      || !input.id.startsWith('msg_') || !validUuid(input.id.slice(4)) || !validUuid(item.id)
      || typeof responses[0].timestamp !== 'string' || responses[0].timestamp !== events[0].timestamp
      || !Number.isFinite(Date.parse(responses[0].timestamp))
      || event.started_at_ms !== Date.parse(responses[0].timestamp) || event.completed_at_ms !== event.started_at_ms
      || !Array.isArray(input.content) || input.content.length !== 1 || input.content[0]?.type !== 'input_text'
      || !Array.isArray(item.content) || item.content.length !== 1 || item.content[0]?.type !== 'text'
      || !Array.isArray(item.content[0].text_elements) || item.content[0].text_elements.length
      || input.content[0].text !== item.content[0].text) return result('unknown', 'request-evidence-conflict', route);
    text = input.content[0].text;
  } else {
    if (input.type !== 'function_call_output' || item.type !== 'FunctionCallOutput' || item.id !== input.id
      || [input, item].some(x => x.namespace !== 'codex_app' || x.name !== 'create_thread')
      || !bounded(input.output, 65536 + 512) || item.output !== input.output) return result('unknown', 'request-evidence-conflict', route);
    const match = input.output.match(/^<codex_delegation>\n  <source_thread_id>([0-9a-f-]{36})<\/source_thread_id>\n  <input>([\s\S]*)<\/input>\n<\/codex_delegation>$/);
    if (!match || !validUuid(match[1]) || match[1] === options.taskId
      || match[2].includes('</input>') || match[2].includes('<codex_delegation>')) return result('unknown', 'request-envelope-unavailable', route);
    text = match[2];
  }
  if (!bounded(text)) return result('unknown', 'request-evidence-unavailable', route);
  return result(text === options.request ? 'matched' : 'not-matched', text === options.request ? null : 'request-mismatch', route, text);
}
