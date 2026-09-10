// Owned fixture harness for operator-assisted native Claude Code qualification.
//
// Everything it touches lives under a freshly created directory in the
// gitignored `.unharness/` workspace: its own Claude configuration directory,
// its own project, and its own registered store. It never reads, writes or
// registers the maintainer's real ~/.claude, and it never launches an
// application or calls a model. The operator drives the desktop app; this
// prepares the state beforehand and projects the recording afterwards.
//
//   node test-support/claude-native-fixture.mjs create
//   node test-support/claude-native-fixture.mjs prepare <normal|unseal|trueform>
//   node test-support/claude-native-fixture.mjs sessions
//   node test-support/claude-native-fixture.mjs observe <task-uuid>
//   node test-support/claude-native-fixture.mjs status
//   node test-support/claude-native-fixture.mjs remove
import { mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as service from '../src/sources/service.mjs';
import { createOwnedClaudeProfile } from '../src/claude/owned-profile.mjs';
import { getMinimalGuide } from '../src/sources/guide.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HOME = join(ROOT, '.unharness', 'claude-native');
const STATE = join(HOME, 'fixture.json');
const APP = '/Applications/Claude.app';

// One fixed request per mode. It must not itself constrain the reply's shape,
// or an absent marker would prove nothing about whether the instruction loaded.
// The recording stays the primary evidence; the marker is a second signal.
export const NATIVE_REQUEST = 'Give a one-line greeting without using tools.';

const readState = async () => JSON.parse(await readFile(STATE, 'utf8'));

async function create() {
  await mkdir(HOME, { recursive: true, mode: 0o700 });
  const parent = await realpath(HOME);
  const owned = await createOwnedClaudeProfile({
    parent,
    // Bound to the installed application, whose version this plan depends on.
    appBundle: APP,
    // A distinctive optional instruction and one real (non-symlinked) Skill,
    // so both selected source kinds are observable in a recording.
    instructions:
      '# Fixture user guide\n\n- Always end your reply with the marker UNHARNESS-FIXTURE-GUIDE.\n',
    settings:
      '{\n  "autoMemoryEnabled": false,\n  "enableAllProjectMcpServers": true\n}\n'
  });
  // A project MCP entry so the same operator session can also drive the
  // deterministic operations through the native AI connection.
  await mkdir(join(owned.context.project, '.claude'), { recursive: true, mode: 0o700 });
  const discovered = await service.discoverUserSources(owned.context);
  const eligible = discovered.skills.filter((s) => s.eligible);
  if (!discovered.instructions.eligible || !eligible.length)
    throw Error('the fixture did not produce a selectable source');
  const registered = await service.registerUserSources({
    context: owned.context,
    discoveryId: discovered.discoveryId,
    instructionsOptional: true,
    selectedSkillIds: eligible.map((s) => s.id),
    // The fixture's own sources are authored here, so the declaration is this
    // harness's own. It never stands in for a decision about a real source.
    userAddedOptional: true
  });
  await writeFile(
    join(owned.context.project, '.mcp.json'),
    JSON.stringify(
      {
        mcpServers: {
          unharness: {
            command: process.execPath,
            args: [
              join(ROOT, 'bin', 'unharness.mjs'),
              'mcp',
              '--workspace',
              registered.workspace
            ]
          }
        }
      },
      null,
      2
    ) + '\n',
    { mode: 0o600 }
  );
  const state = {
    context: owned.context,
    workspace: registered.workspace,
    createdAt: new Date().toISOString()
  };
  await writeFile(STATE, JSON.stringify(state, null, 1) + '\n', { mode: 0o600 });
  return { ...state, selected: registered.sources.map((s) => s.label) };
}

async function prepare(mode) {
  const { workspace, context } = await readState();
  const plan = await service.planUserMode({ workspace, mode });
  const applied = await service.applyUserPlan({ workspace, planId: plan.planId });
  const state = await service.userSourceState({ workspace });
  return {
    mode,
    changedFiles: plan.changedFiles.map((f) => f.id),
    skillStates: plan.skillStates,
    guide: plan.guide,
    readback: applied.readback,
    preparedMode: state.preparedMode,
    preparedAt: state.preparation?.preparedAt ?? null,
    verification: state.verification,
    // The documented control: the Code tab's own local environment editor.
    // It applies to newly started local sessions, so nothing needs restarting
    // and the current session is not disturbed.
    setEnvironment: {
      where: 'prompt box environment dropdown > hover Local > gear icon',
      variable: 'CLAUDE_CONFIG_DIR',
      value: context.claudeHome,
      appliesTo: 'every local session and preview server started afterwards',
      restore: 'remove this variable, or return it to its recorded prior value'
    },
    fallbackLaunch: `CLAUDE_CONFIG_DIR=${context.claudeHome} ${APP}/Contents/MacOS/Claude`,
    openProject: context.project,
    request: NATIVE_REQUEST,
    expected: expectationFor(mode)
  };
}

function expectationFor(mode) {
  // `observation` and the two recorded fields are the evidence. `marker` is a
  // secondary behavioral signal: the request does not constrain reply shape, so
  // a disagreement between the two is itself worth reporting.
  const shared = { observation: 'matched-record', primaryEvidence: 'recorded' };
  if (mode === 'unseal')
    return {
      ...shared,
      instructions: `the recorded user CLAUDE.md equals the fixed guide (${getMinimalGuide().id})`,
      skill: 'the Skill name is absent from the recorded skill listing',
      marker: 'secondary: the reply is not expected to carry UNHARNESS-FIXTURE-GUIDE'
    };
  if (mode === 'trueform')
    return {
      ...shared,
      instructions: 'the recorded user CLAUDE.md is the inert comment or absent',
      skill: 'the Skill name is absent from the recorded skill listing',
      marker: 'secondary: the reply is not expected to carry UNHARNESS-FIXTURE-GUIDE'
    };
  return {
    ...shared,
    instructions: 'the recorded user CLAUDE.md is the saved fixture guide',
    skill: 'the Skill name is present in the recorded skill listing',
    marker: 'secondary: the reply is expected to carry UNHARNESS-FIXTURE-GUIDE'
  };
}

async function sessions() {
  const { context } = await readState();
  const root = join(context.claudeHome, 'projects');
  const found = [];
  let projects = [];
  try {
    projects = await readdir(root, { withFileTypes: true });
  } catch {
    return { root, sessions: [] };
  }
  for (const project of projects) {
    if (!project.isDirectory()) continue;
    for (const entry of await readdir(join(root, project.name)))
      if (entry.endsWith('.jsonl')) found.push(entry.slice(0, -'.jsonl'.length));
  }
  return { root, sessions: found };
}

async function observe(taskId) {
  const { workspace } = await readState();
  return service.observeUserTask({ workspace, taskId });
}

async function status() {
  const { workspace, context } = await readState();
  const state = await service.userSourceState({ workspace });
  return {
    context,
    workspace,
    preparedMode: state.preparedMode,
    revision: state.revision,
    conflict: state.conflict,
    recovery: state.recovery,
    observation: state.observation,
    verification: state.verification
  };
}

async function remove() {
  const { workspace } = await readState();
  const state = await service.userSourceState({ workspace });
  if (state.preparedMode !== 'normal')
    throw Error(`prepare normal before removing (currently ${state.preparedMode})`);
  if (state.recovery.pending) throw Error('recover before removing');
  await rm(HOME, { recursive: true, force: true });
  return { removed: HOME };
}

const commands = { create, prepare, sessions, observe, status, remove };

const [command, ...rest] = process.argv.slice(2);
if (!Object.hasOwn(commands, command)) {
  process.stderr.write(
    'Usage: create | prepare <normal|unseal|trueform> | sessions | observe <task-uuid> | status | remove\n'
  );
  process.exitCode = 2;
} else {
  try {
    process.stdout.write(
      JSON.stringify(await commands[command](...rest), null, 1) + '\n'
    );
  } catch (error) {
    process.stderr.write(
      JSON.stringify({ error: error.kind ?? error.message }) + '\n'
    );
    process.exitCode = 1;
  }
}
