import { createRequestLedger } from '../src/ai/requests.mjs';
import { saveUserFavorite } from '../src/sources/service.mjs';
const [workspace, connectionId, requestId] = process.argv.slice(2);
const ledger = await createRequestLedger({ workspace, connectionId });
await ledger.execute({ connectionId, requestId, action: 'save', input: { name: 'AI favorite' } }, async () => {
  await saveUserFavorite({ workspace, name: 'AI favorite' });
  process.stdout.write('saved\n');
  await new Promise(() => { setInterval(() => {}, 1000); });
});
