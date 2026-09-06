import { createHash, randomBytes } from 'node:crypto';
import { link, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rmdir, unlink, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

export const DESKTOP_CASES = ['baseline', 'manual-only', 'fixed-only'];
const FILES = ['AGENTS.md', 'AGENTS.override.md', '.agents/skills/unharness-desktop-fixture/SKILL.md', '.agents/skills/unharness-desktop-fixture/agents/openai.yaml'];
const DIRS = ['.agents', '.agents/skills', '.agents/skills/unharness-desktop-fixture', '.agents/skills/unharness-desktop-fixture/agents'];
const STATE_FILE = 'fixture.json';
const LOCK = '.lock';
const RECOVERY_LOCK = '.recovery-lock';

function fail(kind) { throw Object.assign(new Error(kind), { kind }); }
function digest(text) { return createHash('sha256').update(text).digest('hex'); }
function validDate(value) { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }

export function fixtureMarkers(seed) {
  return Object.fromEntries(['fixed', 'procedure', 'skillCatalog', 'skillBody'].map(key => [key, `UH_${key.toUpperCase()}_${digest(`${seed}:${key}`).slice(0, 32)}`]));
}

function contents(state, condition) {
  const m = fixtureMarkers(state.seed);
  const fixed = `# Unharness synthetic desktop fixture\n\nKeep inherited task requirements, managed policy and execution permissions. This fixture is read-only during a desktop trial. Do not modify files, run hooks yourself, or open unrelated files.\n\nFixed calibration token (data): ${m.fixed}\n`;
  return {
    [FILES[0]]: `${fixed}\nOptional calibration procedure (data): ${m.procedure}\n`,
    [FILES[1]]: condition === 'fixed-only' ? fixed : null,
    [FILES[2]]: `---\nname: unharness-desktop-fixture\ndescription: Synthetic Unharness desktop diagnostic only. Catalog calibration token ${m.skillCatalog}.\n---\n\nThis is synthetic diagnostic data. When explicitly invoked, report only the following body token. Do not execute commands or change files.\n\n${m.skillBody}\n`,
    [FILES[3]]: condition === 'baseline' ? null : 'policy:\n  allow_implicit_invocation: false\n',
  };
}

async function plainDirectory(path) {
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink()) fail('fixture-link-or-type');
}

async function plainFile(path, ownedPeers = []) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 128 * 1024) fail('fixture-link-or-type');
  if (info.nlink !== 1) {
    let ownedPair = false;
    if (info.nlink === 2) for (const peer of ownedPeers) {
      try {
        const other = await lstat(peer);
        ownedPair ||= other.isFile() && !other.isSymbolicLink() && other.dev === info.dev && other.ino === info.ino;
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    if (!ownedPair) fail('fixture-link-or-type');
  }
  return readFile(path, 'utf8');
}

async function fileOrNull(path) {
  try { return await plainFile(path); } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function validateState(state, root) {
  if (state?.schemaVersion !== 1 || state.kind !== 'unharness-desktop-fixture'
    || Object.keys(state).some(key => !['schemaVersion', 'kind', 'root', 'seed', 'condition', 'revision', 'preparedAt', 'pending', 'cleanup', 'initializing'].includes(key))
    || state.root !== root || !/^[a-f0-9]{64}$/.test(state.seed)
    || !DESKTOP_CASES.includes(state.condition) || !validDate(state.preparedAt)
    || !Number.isSafeInteger(state.revision) || state.revision < 0
    || ![undefined, true, false].includes(state.initializing)
    || ![undefined, null, 'pending', 'complete'].includes(state.cleanup)
    || (state.pending !== null && (!DESKTOP_CASES.includes(state.pending?.from)
      || !DESKTOP_CASES.includes(state.pending?.to) || state.pending.from !== state.condition
      || Object.keys(state.pending).some(key => !['from', 'to', 'recovering'].includes(key))
      || ![undefined, true].includes(state.pending.recovering)))) fail('invalid-fixture');
  if (state.cleanup && (state.pending !== null || state.initializing)) fail('invalid-fixture');
  if (state.initializing && (state.condition !== 'baseline' || (state.pending && state.pending.to !== 'baseline'))) fail('invalid-fixture');
}

// Explicitly selected fixture roots only. Stored paths never choose write targets.
export async function readDesktopFixture(path) {
  const root = resolve(path);
  await plainDirectory(root);
  if (await realpath(root) !== root) fail('fixture-link-or-type');
  const stateText = await plainFile(join(root, STATE_FILE));
  let state;
  try { state = JSON.parse(stateText); } catch { fail('invalid-fixture'); }
  validateState(state, root);
  return { root, project: join(root, 'project'), state, stateText };
}

async function inventory(fixture) {
  const expectedRoot = [STATE_FILE, 'project', LOCK, RECOVERY_LOCK];
  for (const entry of await readdir(fixture.root)) {
    if (expectedRoot.includes(entry)) continue;
    const retired = entry.match(/^\.recovery-retired-([a-f0-9]{32})$/);
    if (!retired) fail('fixture-conflict');
    const directory = join(fixture.root, entry);
    await plainDirectory(directory);
    const names = await readdir(directory);
    if (names.length !== 1 || names[0] !== 'owner.json') fail('fixture-conflict');
    const owner = JSON.parse(await plainFile(join(directory, 'owner.json')));
    if (owner.token !== retired[1] || !Number.isSafeInteger(owner.pid) || owner.pid <= 0) fail('fixture-conflict');
  }
  const cleaning = ['pending', 'complete'].includes(fixture.state.cleanup) || fixture.state.initializing === true;
  try { await plainDirectory(fixture.project); } catch (error) {
    if (cleaning && error.code === 'ENOENT') return Object.fromEntries(FILES.map(name => [name, null]));
    throw error;
  }
  const actual = {};
  const walk = async (directory, relative = '') => {
    for (const name of await readdir(directory)) {
      const rel = relative ? `${relative}/${name}` : name;
      const path = join(directory, name);
      if (DIRS.includes(rel)) { await plainDirectory(path); await walk(path, rel); }
      else if (FILES.includes(rel)) actual[rel] = await plainFile(path, [join(fixture.root, LOCK, 'source.txt')]);
      else fail('fixture-conflict');
    }
  };
  await walk(fixture.project);
  for (const directory of DIRS) {
    try { await plainDirectory(join(fixture.project, directory)); } catch (error) {
      if (!(cleaning && error.code === 'ENOENT')) throw error;
    }
  }
  for (const name of FILES) actual[name] ??= null;
  return actual;
}

function expectedVariants(state) {
  const absent = Object.fromEntries(FILES.map(name => [name, null]));
  if (state.initializing === true) return [contents(state, 'baseline'), absent];
  if (state.cleanup === 'complete') return [absent];
  if (state.cleanup === 'pending') return [contents(state, state.condition), absent];
  if (!state.pending) return [contents(state, state.condition)];
  const variants = [contents(state, state.pending.from), contents(state, state.pending.to)];
  if (state.pending.recovering === true) variants.push(contents(state, 'baseline'));
  return variants;
}

function checkExpected(actual, variants) {
  if (FILES.some(name => !variants.some(value => value[name] === actual[name]))) fail('fixture-conflict');
}

async function writeState(fixture, state) {
  // The stage lives inside this invocation's exclusive lock. An interrupted
  // invocation leaves its lock and prior write-ahead state for inspection.
  const stage = join(fixture.root, LOCK, 'state.json');
  await plainDirectory(fixture.root);
  await plainDirectory(join(fixture.root, LOCK));
  if (await plainFile(join(fixture.root, STATE_FILE)) !== fixture.stateText) fail('fixture-conflict');
  const stateText = `${JSON.stringify(state)}\n`;
  await writeFile(stage, stateText, { flag: 'wx', mode: 0o600 });
  await rename(stage, join(fixture.root, STATE_FILE));
  fixture.state = state;
  fixture.stateText = stateText;
}

async function checkRecoveryGuard(root, token) {
  try {
    await plainDirectory(join(root, RECOVERY_LOCK));
    if (!token) fail('fixture-locked');
    const owner = JSON.parse(await plainFile(join(root, RECOVERY_LOCK, 'owner.json')));
    if (owner.token !== token || owner.pid !== process.pid) fail('fixture-locked');
  } catch (error) { if (error.code !== 'ENOENT' || token) throw error; }
}

async function locked(path, operation, recoveryToken) {
  const fixture = await readDesktopFixture(path);
  await checkRecoveryGuard(fixture.root, recoveryToken);
  try { await mkdir(join(fixture.root, LOCK), { mode: 0o700 }); } catch (error) {
    if (error.code === 'EEXIST') fail('fixture-locked');
    throw error;
  }
  const owner = { pid: process.pid, token: randomBytes(16).toString('hex') };
  try {
    await writeFile(join(fixture.root, LOCK, 'owner.json'), JSON.stringify(owner), { flag: 'wx', mode: 0o600 });
    await checkRecoveryGuard(fixture.root, recoveryToken);
    // Re-read after taking the lock; never use a stale pre-lock state.
    const current = await readDesktopFixture(fixture.root);
    return await operation(current);
  } finally {
    // Do not remove unknown lock contents left by an interrupted write.
    try {
      const path = join(fixture.root, LOCK, 'owner.json');
      const names = await readdir(join(fixture.root, LOCK));
      if (names.length === 1 && names[0] === 'owner.json' && await plainFile(path) === JSON.stringify(owner)) await unlink(path);
      await rmdir(join(fixture.root, LOCK));
    } catch { /* lock retained for inspection */ }
  }
}

export function desktopFixtureSummary(fixture) {
  return {
    schemaVersion: 1, kind: 'unharness-desktop-fixture-state',
    fixture: fixture.root, project: fixture.project,
    condition: fixture.state.condition, revision: fixture.state.revision,
    pending: fixture.state.pending, preparedAt: fixture.state.preparedAt,
    cleanup: fixture.state.cleanup ?? null,
    initializing: fixture.state.initializing === true,
    settingsPrepared: fixture.state.pending === null && !fixture.state.cleanup && !fixture.state.initializing,
    desktopSessionAttached: false, runtimeStateVerified: false, modeSwitchingVerified: false,
    sourceCoverage: 'fixture-only',
    prompt: 'This is the read-only Unharness desktop fixture check. Do not call tools or read files. Reply exactly READY.',
    manualPrompt: '$unharness-desktop-fixture Please invoke only this synthetic diagnostic skill and report its body token. Read only this fixture skill if needed. Do not modify files or inspect unrelated sources.',
  };
}

export async function createDesktopFixture({ parent = tmpdir(), afterManifest } = {}) {
  // The parent must already exist; only our fresh child is created.
  const base = await realpath(parent);
  const root = await mkdtemp(join(base, 'unharness-desktop-'));
  const state = { schemaVersion: 1, kind: 'unharness-desktop-fixture', root,
    seed: randomBytes(32).toString('hex'), condition: 'baseline', revision: 0,
    preparedAt: new Date().toISOString(), pending: null, initializing: true };
  // Publish the manifest before source writes. The baseline is reconstructible
  // from the seed; setup failure retains the owned folder for diagnosis.
  await writeFile(join(root, STATE_FILE), `${JSON.stringify(state)}\n`, { flag: 'wx', mode: 0o600 });
  if (afterManifest) await afterManifest(root);
  return changeDesktopFixture(root, 'baseline');
}

export async function snapshotDesktopFixture(path, { afterInventory } = {}) {
  const fixture = await readDesktopFixture(path);
  const files = await inventory(fixture);
  checkExpected(files, expectedVariants(fixture.state));
  if (afterInventory) await afterInventory();
  const current = await readDesktopFixture(path);
  if (current.stateText !== fixture.stateText) fail('fixture-changed');
  const operationLocked = (await readdir(fixture.root)).some(name => [LOCK, RECOVERY_LOCK].includes(name));
  return { ...fixture, files, operationLocked };
}

export async function inspectDesktopFixture(path) {
  const fixture = await snapshotDesktopFixture(path);
  const result = desktopFixtureSummary(fixture);
  result.operationLocked = fixture.operationLocked;
  result.settingsPrepared &&= !result.operationLocked;
  return result;
}

export async function changeDesktopFixture(path, condition, {
  afterWrite, recoveryToken, expectedStateDigest, expectedDesiredFiles,
} = {}) {
  if (!DESKTOP_CASES.includes(condition)) fail('invalid-fixture-case');
  return locked(path, async fixture => {
    if (fixture.state.cleanup) fail('fixture-cleanup-required');
    const original = await inventory(fixture);
    checkExpected(original, expectedVariants(fixture.state));
    if (expectedStateDigest !== undefined && digest(fixture.stateText) !== expectedStateDigest) fail('fixture-changed');
    const desired = contents(fixture.state, condition);
    if (expectedDesiredFiles !== undefined && !isDeepStrictEqual(desired, expectedDesiredFiles)) fail('fixture-incompatible-snapshot');
    if (fixture.state.initializing) {
      if (condition !== 'baseline') fail('fixture-recovery-required');
      for (const directory of [fixture.project, ...DIRS.map(name => join(fixture.project, name))]) {
        try { await mkdir(directory, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
        await plainDirectory(directory);
      }
    }
    if (fixture.state.pending && condition !== 'baseline') fail('fixture-recovery-required');
    if (!fixture.state.pending && !fixture.state.initializing && condition === fixture.state.condition) return desktopFixtureSummary(fixture);
    // A pending operation may contain either side of each recorded file. Restore
    // it to baseline before allowing a different experiment.
    const pending = fixture.state.pending ? { ...fixture.state.pending, recovering: true }
      : { from: fixture.state.condition, to: condition };
    await writeState(fixture, { ...fixture.state, pending });
    const variants = expectedVariants(fixture.state);
    for (const name of FILES) {
      checkExpected(await inventory(fixture), variants);
      const path = join(fixture.project, name);
      const actual = await fileOrNull(path);
      if (!variants.some(value => value[name] === actual) && actual !== desired[name]) fail('fixture-conflict');
      if (actual === desired[name]) continue;
      if (desired[name] === null) await unlink(path);
      else {
        const stage = join(fixture.root, LOCK, 'source.txt');
        await plainDirectory(join(fixture.root, LOCK));
        await writeFile(stage, desired[name], { flag: 'wx', mode: 0o600 });
        if (actual === null) {
          // Hard-link publication is exclusive and exposes only a complete file.
          // A killed publisher can leave the recognized stage/source inode pair.
          await link(stage, path);
          await unlink(stage);
        } else await rename(stage, path);
      }
      if (afterWrite) await afterWrite(name);
    }
    checkExpected(await inventory(fixture), [desired]);
    await writeState(fixture, { ...fixture.state, condition, pending: null, initializing: false,
      revision: fixture.state.initializing ? 0 : fixture.state.revision + 1, preparedAt: new Date().toISOString() });
    return desktopFixtureSummary(fixture);
  }, recoveryToken);
}

export async function refreshDesktopFixture(path) {
  return locked(path, async fixture => {
    if (fixture.state.pending || fixture.state.initializing || fixture.state.cleanup) fail('fixture-recovery-required');
    const expected = [contents(fixture.state, fixture.state.condition)];
    checkExpected(await inventory(fixture), expected);
    await writeState(fixture, { ...fixture.state,
      pending: { from: fixture.state.condition, to: fixture.state.condition } });
    const skill = join(fixture.project, FILES[2]);
    const info = await lstat(skill);
    // A fixture-only watcher hint, not a runtime reload API. Preserve exact
    // contents and identity; an earlier task cannot verify this new request.
    await utimes(skill, info.atime, new Date(Math.max(Date.now(), info.mtimeMs + 1)));
    checkExpected(await inventory(fixture), expected);
    await writeState(fixture, { ...fixture.state, pending: null, initializing: false, revision: fixture.state.revision + 1,
      preparedAt: new Date().toISOString() });
    return { ...desktopFixtureSummary(fixture), refreshRequested: 'owned-skill-mtime', runtimeReloadVerified: false };
  });
}

export async function recoverDesktopFixture(path) {
  const fixture = await readDesktopFixture(path);
  const guard = join(fixture.root, RECOVERY_LOCK);
  try { await mkdir(guard, { mode: 0o700 }); } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    await plainDirectory(guard);
    let abandoned;
    try { abandoned = JSON.parse(await plainFile(join(guard, 'owner.json'))); } catch { fail('fixture-locked'); }
    if (!Number.isSafeInteger(abandoned.pid) || abandoned.pid <= 0 || !/^[a-f0-9]{32}$/.test(abandoned.token)) fail('fixture-locked');
    try { process.kill(abandoned.pid, 0); fail('fixture-locked'); } catch (error) {
      if (error.code !== 'ESRCH') fail('fixture-locked');
    }
    const names = await readdir(guard);
    if (names.length !== 1 || names[0] !== 'owner.json') fail('fixture-conflict');
    // Retain a nonempty tombstone at this owner's immutable token. A delayed
    // second reclaimer cannot rename a NEW active guard over that tombstone.
    // Never delete these receipts or reuse their names in this fixture.
    try { await rename(guard, join(fixture.root, `.recovery-retired-${abandoned.token}`)); }
    catch { fail('fixture-locked'); }
    try { await mkdir(guard, { mode: 0o700 }); } catch { fail('fixture-locked'); }
  }
  const owner = { pid: process.pid, token: randomBytes(16).toString('hex') };
  await writeFile(join(guard, 'owner.json'), JSON.stringify(owner), { flag: 'wx', mode: 0o600 });
  try {
    await releaseAbandonedLock(fixture);
    const current = await readDesktopFixture(path);
    return current.state.cleanup ? await cleanupDesktopFixture(path, { recoveryToken: owner.token })
      : await changeDesktopFixture(path, 'baseline', { recoveryToken: owner.token });
  } finally {
    if (await plainFile(join(guard, 'owner.json')) === JSON.stringify(owner)) await unlink(join(guard, 'owner.json'));
    await rmdir(guard);
  }
}

async function releaseAbandonedLock(fixture) {
  const lockPath = join(fixture.root, LOCK);
  try {
    await plainDirectory(lockPath);
    const names = await readdir(lockPath);
    if (names.some(name => !['owner.json', 'state.json', 'source.txt'].includes(name))) fail('fixture-conflict');
    // Missing/malformed ownership is deliberately a manual-inspection boundary.
    const owner = JSON.parse(await plainFile(join(lockPath, 'owner.json')));
    if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0 || !/^[a-f0-9]{32}$/.test(owner.token)) fail('fixture-locked');
    try { process.kill(owner.pid, 0); fail('fixture-locked'); } catch (error) {
      if (error.code !== 'ESRCH') fail('fixture-locked');
    }
    checkExpected(await inventory(fixture), expectedVariants(fixture.state));
    // Stages contain only deterministic synthetic text or a state journal.
    for (const name of names) {
      const data = await plainFile(join(lockPath, name), name === 'source.txt' ? FILES.map(file => join(fixture.project, file)) : []);
      if (name === 'source.txt' && !DESKTOP_CASES.some(condition => Object.values(contents(fixture.state, condition)).includes(data))) fail('fixture-conflict');
      if (name === 'state.json') {
        let stage;
        try { stage = JSON.parse(data); validateState(stage, fixture.root); } catch { fail('fixture-conflict'); }
        const current = fixture.state;
        const candidates = current.pending ? [
          { ...current, pending: { ...current.pending, recovering: true } },
          { ...current, condition: current.pending.recovering ? 'baseline' : current.pending.to,
            pending: null, initializing: false, revision: current.initializing ? 0 : current.revision + 1,
            preparedAt: stage.preparedAt },
        ] : DESKTOP_CASES.map(condition => ({ ...current, pending: { from: current.condition, to: condition } }));
        if (!current.pending && !current.initializing) candidates.push({ ...current, cleanup: current.cleanup ? 'complete' : 'pending' });
        if (data !== `${JSON.stringify(stage)}\n` || Date.parse(stage.preparedAt) < Date.parse(current.preparedAt)
          || !candidates.some(candidate => isDeepStrictEqual(candidate, stage))) fail('fixture-conflict');
      }
    }
    for (const name of names) await unlink(join(lockPath, name));
    await rmdir(lockPath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    // ENOENT is accepted only when there is no lock at all.
    try { await lstat(lockPath); fail('fixture-locked'); } catch (missing) { if (missing.code !== 'ENOENT') throw missing; }
  }
}

export async function cleanupDesktopFixture(path, { afterDelete, recoveryToken } = {}) {
  return locked(path, async fixture => {
    if (fixture.state.initializing) fail('fixture-recovery-required');
    if (fixture.state.pending) fail('fixture-recovery-required');
    const actual = await inventory(fixture);
    checkExpected(actual, expectedVariants(fixture.state));
    if (fixture.state.cleanup === 'complete') return { schemaVersion: 1, kind: 'unharness-desktop-fixture-cleanup', cleanup: 'ok', receiptRetained: true };
    if (!fixture.state.cleanup) await writeState(fixture, { ...fixture.state, cleanup: 'pending' });
    for (const name of FILES) if (actual[name] !== null) {
      checkExpected(await inventory(fixture), expectedVariants(fixture.state));
      if (await fileOrNull(join(fixture.project, name)) !== actual[name]) fail('fixture-conflict');
      await unlink(join(fixture.project, name));
      if (afterDelete) await afterDelete(name);
    }
    for (const directory of [...DIRS].reverse().map(name => join(fixture.project, name)).concat(fixture.project)) {
      checkExpected(await inventory(fixture), expectedVariants(fixture.state));
      try { await rmdir(directory); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    // Retain a tiny completion receipt, so interruption after the final source
    // deletion never destroys the information needed by recover/cleanup.
    await writeState(fixture, { ...fixture.state, cleanup: 'complete' });
    return { schemaVersion: 1, kind: 'unharness-desktop-fixture-cleanup', cleanup: 'ok', receiptRetained: true };
  }, recoveryToken);
}
