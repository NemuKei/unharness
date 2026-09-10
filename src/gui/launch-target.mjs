import { join } from 'node:path';
import { applicationFor } from '../apps/index.mjs';
import { openWorkspace } from '../sources/records.mjs';
import { hash } from '../sources/hash.mjs';
import { launchFail } from './launch-records.mjs';

// A launcher may precede source registration, but its home/project/executable
// are selected locally. Browser requests cannot supply a different context.
export async function resolveWorkbenchTarget(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== 1) launchFail('gui-launch-target-invalid');
  let context, workspace = null, rootScopeId = null;
  if (Object.hasOwn(input, 'workspace')) {
    const w = await openWorkspace(input.workspace);
    ({ workspace, rootScopeId } = w); context = w.reg.context;
  } else if (Object.hasOwn(input, 'context')) {
    context = await applicationFor(input.context).contextOf(input.context);
    const { locateUserSources } = await import('../sources/service.mjs');
    const located = await locateUserSources({ context });
    if (located) ({ workspace, rootScopeId } = located);
  } else launchFail('gui-launch-target-invalid');
  const app = applicationFor(context);
  const contextKey = hash(context);
  return { context, contextKey, workspace, rootScopeId, application: app.id,
    directory: join(app.home(context), '.unharness-workbench') };
}
