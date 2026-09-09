// A freshly created synthetic Claude Code profile used by tests and by owned
// diagnostics. Nothing here reads or writes the maintainer's real ~/.claude,
// and the fake application bundle is only an Info.plist that the adapter reads
// for a version string; no application is installed or launched.
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { canonical, captureFile } from '../sources/platform.mjs';

export const OWNED_DESKTOP_VERSION = '1.49585.0';
export const OWNED_BUNDLE_IDENTIFIER = 'com.anthropic.claudefordesktop';

const INFO_PLIST = (version, identifier) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>CFBundleIdentifier</key>
\t<string>${identifier}</string>
\t<key>CFBundleShortVersionString</key>
\t<string>${version}</string>
\t<key>CFBundleVersion</key>
\t<string>${version}</string>
</dict>
</plist>
`;

export async function createOwnedClaudeProfile({
  parent,
  version = OWNED_DESKTOP_VERSION,
  settings = '{\n  "autoMemoryEnabled": true,\n  "cleanupPeriodDays": 30\n}\n',
  instructions = '# PRIVATE_TEST optional user guide\n\n- Prefer the synthetic fixture path.\n',
  extraSkills = [],
  rules = false,
  projectSettings = null,
  projectLocalSettings = null,
  worktreeOf = null,
  // Native qualification binds the fixture to the installed application, since
  // the desktop version is the freshness key and that app runs the task.
  appBundle: installedBundle = null
} = {}) {
  await canonical(parent);
  const root = await mkdtemp(join(parent, 'unharness-owned-claude-'));
  const claudeHome = join(root, 'claude'),
    project = join(root, 'project'),
    appBundle = installedBundle ?? join(root, 'Claude.app');
  await mkdir(claudeHome, { mode: 0o700 });
  await mkdir(project, { mode: 0o700 });
  if (installedBundle === null) {
    await mkdir(join(appBundle, 'Contents'), { recursive: true, mode: 0o700 });
    await writeFile(
      join(appBundle, 'Contents', 'Info.plist'),
      INFO_PLIST(version, OWNED_BUNDLE_IDENTIFIER),
      { mode: 0o600 }
    );
  }
  await mkdir(join(claudeHome, 'skills', 'example'), {
    recursive: true,
    mode: 0o700
  });
  if (instructions !== null)
    await writeFile(join(claudeHome, 'CLAUDE.md'), instructions, { mode: 0o600 });
  if (settings !== null)
    await writeFile(join(claudeHome, 'settings.json'), settings, { mode: 0o600 });
  await writeFile(join(project, 'CLAUDE.md'), '# Required project instructions\n', {
    mode: 0o600
  });
  await writeFile(
    join(claudeHome, 'skills', 'example', 'SKILL.md'),
    '---\nname: example\ndescription: Synthetic optional example\n---\n\nPRIVATE_TEST Skill body.\n',
    { mode: 0o600 }
  );
  for (const skill of extraSkills) {
    const directory = join(
      skill.scope === 'repo' ? join(project, '.claude', 'skills') : join(claudeHome, 'skills'),
      skill.name
    );
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(join(directory, 'SKILL.md'), skill.body, { mode: 0o600 });
  }
  for (const [name, content] of [
    ['settings.json', projectSettings],
    ['settings.local.json', projectLocalSettings]
  ]) {
    if (content === null) continue;
    await mkdir(join(project, '.claude'), { recursive: true, mode: 0o700 });
    await writeFile(join(project, '.claude', name), content, { mode: 0o600 });
  }
  // A synthetic git worktree: `.git` is a file naming a git directory under the
  // main checkout's `.git/worktrees/<name>`, which is where Claude Code reads
  // this project's local settings from.
  if (worktreeOf !== null) {
    await mkdir(join(worktreeOf, '.git', 'worktrees', 'owned'), {
      recursive: true,
      mode: 0o700
    });
    await writeFile(
      join(project, '.git'),
      `gitdir: ${join(worktreeOf, '.git', 'worktrees', 'owned')}\n`,
      { mode: 0o600 }
    );
  }
  if (rules) {
    await mkdir(join(claudeHome, 'rules'), { recursive: true, mode: 0o700 });
    await writeFile(
      join(claudeHome, 'rules', 'preferences.md'),
      '# PRIVATE_TEST personal rule\n',
      { mode: 0o600 }
    );
  }
  await writeFile(
    join(claudeHome, '.unharness-owned-profile.json'),
    JSON.stringify({ root, claudeHome, project }),
    { mode: 0o600, flag: 'wx' }
  );
  const context = { application: 'claude', claudeHome, project, appBundle };
  return { root, context, originalFiles: await readClaudeProfileFiles(context) };
}

export async function readClaudeProfileFiles(context) {
  const result = {};
  for (const [id, path] of Object.entries({
    instructions: join(context.claudeHome, 'CLAUDE.md'),
    settings: join(context.claudeHome, 'settings.json'),
    skill: join(context.claudeHome, 'skills', 'example', 'SKILL.md'),
    project: join(context.project, 'CLAUDE.md')
  }))
    result[id] = await captureFile(path);
  return result;
}

/**
 * Write a synthetic Claude Code session recording into the owned profile.
 * The grammar mirrors what Claude Code 2.1.260 writes at startup; it is a
 * fixture, not a captured transcript.
 */
export async function writeOwnedClaudeSession(
  context,
  {
    sessionId,
    version = '2.1.260',
    entrypoint = 'claude-desktop',
    userType = 'external',
    permissionMode = 'default',
    cwd = context.project,
    timestamp = new Date().toISOString(),
    instructionFiles = [],
    skillNames = [],
    modelId = 'claude-opus-5',
    effort = 'high',
    isSidechain = false,
    completed = true,
    projectSlug = 'owned-project'
  }
) {
  const directory = join(context.claudeHome, 'projects', projectSlug);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const base = {
    isSidechain,
    userType,
    entrypoint,
    cwd,
    sessionId,
    version,
    gitBranch: 'main'
  };
  const lines = [
    {
      ...base,
      parentUuid: null,
      type: 'attachment',
      uuid: '00000000-0000-4000-8000-000000000001',
      timestamp,
      attachment: {
        type: 'model',
        identity: { modelId, marketingName: 'Synthetic', knowledgeCutoff: 'May 2026' },
        text: 'synthetic'
      }
    },
    {
      ...base,
      parentUuid: null,
      type: 'attachment',
      uuid: '00000000-0000-4000-8000-000000000002',
      timestamp,
      attachment: { type: 'instructions', files: instructionFiles }
    },
    {
      ...base,
      parentUuid: null,
      type: 'attachment',
      uuid: '00000000-0000-4000-8000-000000000003',
      timestamp,
      attachment: {
        type: 'skill_listing',
        content: skillNames.map((n) => `- ${n}: synthetic`).join('\n'),
        skillCount: skillNames.length,
        isInitial: true,
        names: skillNames
      }
    },
    {
      ...base,
      parentUuid: null,
      type: 'user',
      uuid: '00000000-0000-4000-8000-000000000004',
      timestamp,
      permissionMode,
      promptSource: 'sdk',
      message: { role: 'user', content: 'PRIVATE_TEST synthetic prompt' }
    },
    {
      ...base,
      parentUuid: '00000000-0000-4000-8000-000000000004',
      type: 'assistant',
      uuid: '00000000-0000-4000-8000-000000000005',
      timestamp,
      effort,
      requestId: 'req_synthetic',
      apiBlockIndex: 0,
      message: {
        id: 'msg_synthetic',
        role: 'assistant',
        model: modelId,
        content: [{ type: 'text', text: 'PRIVATE_TEST synthetic reply' }],
        stop_reason: completed ? 'end_turn' : 'tool_use',
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 5 }
      }
    }
  ];
  const path = join(directory, `${sessionId}.jsonl`);
  await writeFile(path, lines.map((l) => JSON.stringify(l)).join('\n') + '\n', {
    mode: 0o600
  });
  return path;
}
