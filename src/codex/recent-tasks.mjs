import { createRpcTransport } from './rpc-transport.mjs';
import { fail } from '../sources/errors.mjs';
import { validUuid } from '../sources/observation-record.mjs';

const sources = ['appServer', 'vscode', 'cli', 'exec'];
const metadataVersions = new Set(['0.153.4', '0.155.0-alpha.9.2']);
const date = value => Number.isSafeInteger(value) && value >= 0 && value <= 8640000000000;
const cursor = value => typeof value === 'string' && value.length > 0 && value.length <= 512
  && !/[\u0000-\u001f\u007f]/.test(value);

// Task discovery reads the native metadata index only. Transcript collection
// remains a separate explicit selection; previews and native paths never leave
// this adapter. Only the metadata contract was checked on these native versions;
// this allowlist does not qualify source writes or recorded mode loading.
export async function listRecentCodexTasks(context, taskCursor) {
  if (taskCursor !== undefined && !cursor(taskCursor)) fail('invalid-request');
  const client = createRpcTransport({ command: context.executable, args: ['app-server', '--stdio'],
    cwd: context.project, env: { ...process.env, CODEX_HOME: context.codexHome }, timeoutMs: 10000,
    maxResponseBytes: 2 * 1024 * 1024, allowedMethods: ['initialize', 'thread/list'] });
  try {
    const init = await client.request('initialize', {
      clientInfo: { name: 'unharness_recent_tasks', version: '0.0.10' }, capabilities: { experimentalApi: true }
    });
    const version = typeof init.userAgent === 'string' ? init.userAgent.match(/^Codex(?: Desktop)?\/([^\s]+)(?:\s|$)/)?.[1] : null;
    if (init.codexHome !== context.codexHome || !metadataVersions.has(version))
      fail('comparison-tasks-unavailable');
    client.initialized();
    const result = await client.request('thread/list', { cwd: context.project, limit: 20,
      sortKey: 'updated_at', sortDirection: 'desc', archived: false, sourceKinds: sources,
      useStateDbOnly: true, ...(taskCursor === undefined ? {} : { cursor: taskCursor }) });
    if (!Array.isArray(result.data) || result.data.length > 20
      || !(result.nextCursor === null || cursor(result.nextCursor))) fail('comparison-tasks-unavailable');
    const seen = new Set(), tasks = [];
    for (const item of result.data) {
      if (!item || item.cwd !== context.project || !validUuid(item.id) || seen.has(item.id.toLowerCase())
        || !sources.includes(item.source) || item.parentThreadId != null || item.ephemeral !== false
        || !Array.isArray(item.turns) || item.turns.length || !date(item.createdAt) || !date(item.updatedAt)) continue;
      seen.add(item.id.toLowerCase());
      const title = typeof item.name === 'string' ? item.name.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 120) : '';
      tasks.push({ taskId: item.id.toLowerCase(), title: title || null, createdAt: item.createdAt, updatedAt: item.updatedAt });
    }
    return { available: true, tasks, nextCursor: result.nextCursor };
  } catch { fail('comparison-tasks-unavailable'); }
  finally { await client.close(); }
}
