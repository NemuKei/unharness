// Reuse the deterministic source operations through a deliberately small
// authority. Copying the package must not broaden its manager-Skill identity.
import { randomUUID } from 'node:crypto';
import { createSourceController, sourceRequestShape } from '../sources/session.mjs';

const forbidden = () => { throw Object.assign(Error('gui-recovery-operation-forbidden'), { kind: 'gui-recovery-operation-forbidden' }); };
export async function createRecoveryController(binding, { launchId = randomUUID() } = {}) {
  const target = await binding.read();
  const controller = await createSourceController(target.context, { workspace: target.workspace ?? undefined, launchId });
  const normalPlans = new Set(), retainedPlans = new Set();
  async function metadata() {
    await binding.read();
    return { ...await controller.metadata(), kind: 'recovery' };
  }
  async function state() {
    const meta = await metadata(), value = await controller.state();
    return { ...value, metadata: meta, recoveryOnly: true };
  }
  return { metadata, state,
    async updates() { forbidden(); },
    async execute(action, input) {
      if (!(action === 'plan' && input?.mode === 'normal' && !Object.hasOwn(input, 'selectedIds')
        || action === 'apply' && normalPlans.has(input?.planId)
        || action === 'accept-retained' && retainedPlans.has(input?.planId)
        || ['recover', 'plan-retained'].includes(action))) forbidden();
      await binding.read();
      sourceRequestShape({ requestId: randomUUID(), ...input }, action);
      const result = await controller.execute(action, input);
      if (action === 'plan') normalPlans.add(result.planId);
      if (action === 'plan-retained') retainedPlans.add(result.planId);
      return result;
    },
  };
}
