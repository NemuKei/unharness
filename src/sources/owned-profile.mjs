import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { canonical, captureFile } from './platform.mjs';
export async function createOwnedSourceProfile({
  parent,
  executable = 'codex'
}) {
  await canonical(parent);
  const root = await mkdtemp(join(parent, 'unharness-owned-profile-'));
  const codexHome = join(root, 'codex'),
    project = join(root, 'project');
  await mkdir(codexHome, { mode: 0o700 });
  await mkdir(project, { mode: 0o700 });
  await mkdir(join(codexHome, 'skills', 'example'), {
    recursive: true,
    mode: 0o700
  });
  await writeFile(
    join(codexHome, 'AGENTS.md'),
    '# PRIVATE_TEST optional user guide\n',
    { mode: 0o600 }
  );
  await writeFile(
    join(codexHome, 'config.toml'),
    'model = "gpt-5"\napproval_policy = "never"\nsandbox_mode = "read-only"\n\n[memories]\nuse_memories = false\n',
    { mode: 0o600 }
  );
  await writeFile(
    join(project, 'AGENTS.md'),
    '# Required project instructions\n',
    { mode: 0o600 }
  );
  await writeFile(
    join(codexHome, 'skills', 'example', 'SKILL.md'),
    '---\nname: example\ndescription: Synthetic optional example\n---\n\nPRIVATE_TEST Skill body.\n',
    { mode: 0o600 }
  );
  await writeFile(
    join(codexHome, '.unharness-owned-profile.json'),
    JSON.stringify({ root, codexHome, project }),
    { mode: 0o600, flag: 'wx' }
  );
  const context = { codexHome, project, executable };
  return { context, originalFiles: await readSourceProfileFiles(context) };
}
export async function readSourceProfileFiles(context) {
  const result = {};
  for (const [id, path] of Object.entries({
    instructions: join(context.codexHome, 'AGENTS.md'),
    override: join(context.codexHome, 'AGENTS.override.md'),
    config: join(context.codexHome, 'config.toml'),
    skill: join(context.codexHome, 'skills', 'example', 'SKILL.md'),
    policy: join(
      context.codexHome,
      'skills',
      'example',
      'agents',
      'openai.yaml'
    ),
    format: join(context.codexHome, 'skills', 'example', 'SKILL.json'),
    project: join(context.project, 'AGENTS.md')
  }))
    result[id] = await captureFile(path);
  return result;
}
