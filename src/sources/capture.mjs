import { captureFile, equal, defaultMetadata } from './platform.mjs';
import { applicationFor, applicationId } from '../apps/index.mjs';
import { hash } from './hash.mjs';
import { fail, verification } from './errors.mjs';
import { retainControlSources } from '../setup/control-sources.mjs';
export { hash };
export const retained = Object.freeze([
  'project requirements',
  'memory',
  'native continuity',
  'execution permissions',
  'managed/provider sources',
  'hooks',
  'unselected sources'
]);
export function snapshotLimit(files) {
  if (Buffer.byteLength(JSON.stringify(files)) > 768 * 1024)
    fail('snapshot-too-large');
  return files;
}
export async function discoveryCapture(input) {
  const app = applicationFor(input);
  const context = await app.contextOf(input);
  let ownedRoot = null;
  const marker = await captureFile(app.ownedMarkerPath(app.home(context)));
  if (marker) {
    try {
      ownedRoot = app.readOwnedMarker(marker, context);
    } catch {
      fail('unsupported-source');
    }
  }
  const {
    version,
    unavailableSources,
    instructions,
    skills: discoveredSkills,
    files,
    bindings,
    notices = []
  } = await app.discover(context, ownedRoot);
  const skills = retainControlSources(discoveredSkills);
  const discoveryId = hash({
    context,
    version,
    files,
    bindings,
    skills,
    unavailableSources
  });
  return {
    context,
    ownedRoot,
    unavailableSources,
    version,
    discoveryId,
    instructions,
    skills,
    files,
    bindings,
    notices
  };
}
export function discoverySummary(d) {
  const app = applicationFor(d.context);
  return {
    application: app.id,
    applicationLabel: app.label,
    discoveryId: d.discoveryId,
    context: d.context,
    registrationAvailable: !d.unavailableSources.length,
    unavailableSources: d.unavailableSources,
    instructions: d.instructions,
    skills: d.skills.map(
      ({
        identity,
        sourceDigest,
        body,
        policy,
        format,
        binding,
        policyBinding,
        formatBinding,
        ...row
      }) => row
    ),
    // Discovered user-scope sources this slice does not manage. They stay
    // visible so an absence claim is never read as covering them.
    notices: d.notices ?? [],
    retained,
    limitations: app.limitations,
    verification
  };
}
export const pathsFor = (reg) => applicationFor(reg.context).pathsFor(reg);
export async function captureRegistered(reg) {
  const files = {};
  for (const [k, p] of Object.entries(pathsFor(reg)))
    files[k] = await captureFile(p);
  return snapshotLimit(files);
}
export function validateFiles(reg, files) {
  if (
    !files ||
    !equal(Object.keys(files).sort(), Object.keys(pathsFor(reg)).sort())
  )
    fail('record-invalid');
  for (const v of Object.values(files))
    if (
      v !== null &&
      (typeof v?.text !== 'string' ||
        Buffer.byteLength(v.text) > 128 * 1024 ||
        !v.meta ||
        !Number.isInteger(v.meta.uid) ||
        !Number.isInteger(v.meta.gid) ||
        !Number.isInteger(v.meta.mode) ||
        v.meta.mode < 0 ||
        v.meta.mode > 0o777 ||
        !v.meta.xattrs ||
        Object.entries(v.meta.xattrs).some(
          ([k, v]) =>
            !/^[a-zA-Z0-9_.-]{1,128}$/.test(k) ||
            typeof v !== 'string' ||
            !/^(?:[0-9a-f]{2})*$/.test(v) ||
            v.length > 65536
        ))
    )
      fail('record-invalid');
  return snapshotLimit(files);
}
export const freshCatalog = (reg) =>
  applicationFor(reg.context).assertFreshCatalog(reg);
export async function targetFile(reg, key, text, normal) {
  const app = applicationFor(reg.context);
  return {
    text,
    meta: normal[key]?.meta ?? (await defaultMetadata(app.home(reg.context)))
  };
}

// Recheck platform-appropriate admission before creating a reservation. A
// policy retained read-only by TRUEFORM is not an ownership admission failure.
export function assertRegistrationOwnership(d, selected, instructionsOptional) {
  applicationFor(d.context).assertRegistrationOwnership(
    d,
    selected,
    instructionsOptional
  );
}
export { applicationId };
