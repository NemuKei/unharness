import { applyUserPlan, recoverUserSources } from '../src/sources/service.mjs';
import { setSourceTransactionTestHook } from '../src/sources/transaction.mjs';
const [workspace, planId, phase] = process.argv.slice(2);
if (!workspace) process.exit(0);
setSourceTransactionTestHook((p) => {
  if (p === phase) process.exit(86);
});
if (planId === 'recover') await recoverUserSources({ workspace });
else await applyUserPlan({ workspace, planId });
