// Synthetic equivalents of the two corroborated 0.153.4 desktop input routes.
export const replayTaskId = '11111111-1111-4111-8111-111111111111';
export function replayRecording({ taskId = replayTaskId, project = '/synthetic/replay', request = '  READY\n',
  createdAt = '2026-09-09T01:00:01.000Z', route = 'user', instructions = '# Optional\n\n--- project-doc ---\n\n# Required',
  catalog = '### Available skills\n', model = 'gpt-5', effort = 'high' } = {}) {
  const at = ms => new Date(Date.parse(createdAt) + ms).toISOString();
  const row = (type, payload, ms = 0) => ({ timestamp: at(ms), type, payload });
  const turnId = 'turn-1', inputId = '33333333-3333-4333-8333-333333333333';
  const id = route === 'user' ? 'msg_' + inputId : 'fco_' + inputId;
  const output = `<codex_delegation>\n  <source_thread_id>22222222-2222-4222-8222-222222222222</source_thread_id>\n  <input>${request}</input>\n</codex_delegation>`;
  const response = route === 'user'
    ? { type: 'message', id, role: 'user', content: [{ type: 'input_text', text: request }] }
    : { type: 'function_call_output', id, name: 'create_thread', namespace: 'codex_app', output };
  const item = route === 'user'
    ? { type: 'UserMessage', id: '44444444-4444-4444-8444-444444444444', client_id: 'synthetic-client', content: [{ type: 'text', text: request, text_elements: [] }] }
    : { ...response, type: 'FunctionCallOutput' };
  const totals = { total_tokens: 100, input_tokens: 80, cached_input_tokens: 20, cache_write_input_tokens: 0, output_tokens: 20, reasoning_output_tokens: 5 };
  return [
    row('session_meta', { id: taskId, timestamp: createdAt, cwd: project, originator: 'Codex Desktop', thread_source: route, cli_version: '0.153.4' }),
    row('event_msg', { type: 'task_started', turn_id: turnId }),
    row('response_item', { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'HOST CONTEXT, not the request' }] }),
    row('world_state', { full: true, state: { agents_md: { directory: project, text: instructions }, host_skills: { includeInstructions: true, body: catalog } } }),
    row('turn_context', { turn_id: turnId, cwd: project, model, effort, approval_policy: 'never', sandbox_policy: { type: 'read-only' } }),
    row('response_item', response, 10),
    row('event_msg', { type: 'item_completed', thread_id: taskId, turn_id: turnId, item,
      started_at_ms: Date.parse(at(10)), completed_at_ms: Date.parse(at(10)) }, 10),
    row('response_item', { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'READY' }] }, 20),
    row('token_usage_record', { thread_id: taskId, session_id: taskId, root_turn_id: turnId, turn_id: turnId, response_id: 'response-1', usage: totals, turn_token_usage: totals, thread_token_usage: totals }, 20),
    row('event_msg', { type: 'task_complete', turn_id: turnId, duration_ms: 20, time_to_first_token_ms: 10, last_agent_message: 'READY' }, 20),
  ];
}
