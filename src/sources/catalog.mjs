import { createReadOnlyClient } from '../codex/rpc-client.mjs';
import { canonical } from './platform.mjs';
import { fail } from './errors.mjs';
export async function contextOf(context) {
  if (
    !context ||
    Object.keys(context).some(
      (k) => !['codexHome', 'project', 'executable'].includes(k)
    )
  )
    fail('invalid-request');
  const { codexHome, project, executable = 'codex' } = context;
  await canonical(codexHome);
  await canonical(project);
  if (
    typeof executable !== 'string' ||
    !executable ||
    /\.(cmd|bat)$/i.test(executable)
  )
    fail('invalid-request');
  return { codexHome, project, executable };
}
export async function catalog(context) {
  const c = createReadOnlyClient({
    command: context.executable,
    args: ['app-server', '--stdio'],
    cwd: context.project,
    env: { ...process.env, CODEX_HOME: context.codexHome }
  });
  try {
    const init = await c.request('initialize', {
      clientInfo: { name: 'unharness_sources', version: '0.1.0' },
      capabilities: { experimentalApi: true }
    });
    c.initialized();
    if (
      init.codexHome !== context.codexHome ||
      typeof init.userAgent !== 'string' ||
      !init.userAgent.match(/\d+\.\d+\.\d+/)
    )
      fail('discovery-failed');
    const raw = await c.request('skills/list', {
      cwds: [context.project],
      forceReload: true
    });
    if (
      !Array.isArray(raw.data) ||
      raw.data.length !== 1 ||
      raw.data[0].cwd !== context.project ||
      !Array.isArray(raw.data[0].skills) ||
      raw.data[0].errors?.length
    )
      fail('discovery-failed');
    if (raw.data[0].skills.length > 2048) fail('discovery-failed');
    const skills = raw.data[0].skills
      .map((s) => {
        if (
          typeof s.path !== 'string' ||
          typeof s.name !== 'string' ||
          typeof s.enabled !== 'boolean'
        )
          fail('discovery-failed');
        return {
          path: s.path,
          name: s.name.slice(0, 256),
          scope: s.scope,
          pluginId: s.pluginId ?? null,
          enabled: s.enabled
        };
      })
      .sort((a, b) => a.path.localeCompare(b.path));
    return { version: init.userAgent.match(/\d+\.\d+\.\d+/)[0], skills };
  } catch {
    fail('discovery-failed');
  } finally {
    await c.close();
  }
}
export const catalogIdentity = (s) => ({
  path: s.path,
  name: s.name,
  scope: s.scope,
  pluginId: s.pluginId
});
