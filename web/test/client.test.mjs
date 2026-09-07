import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

test('client authenticates requests and never retries an uncertain mutation', async t => {
  const { Api } = await import('../src/api.ts');
  let posts = 0;
  const server = createServer((req, res) => {
    assert.equal(req.headers['x-unharness-client'], '1');
    if (req.url === '/api/bootstrap') return res.end(JSON.stringify({ token: 'test-token' }));
    assert.equal(req.headers['x-unharness-token'], 'test-token');
    if (req.method === 'POST') { posts++; req.destroy(); return; }
    res.end(JSON.stringify({ current: null }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const api = new Api(`http://127.0.0.1:${server.address().port}`);
  await api.connect();
  assert.deepEqual(await api.get('/state'), { current: null });
  await assert.rejects(api.post('/save', { name: null }));
  assert.equal(posts, 1);
});

test('request generation rejects a late plan and invalidates an in-flight read', async () => {
  const { RequestGeneration } = await import('../src/api.ts');
  const generation = new RequestGeneration();
  const previousSelection = generation.next();
  const latestSelection = generation.next();
  assert.equal(generation.isCurrent(previousSelection), false);
  assert.equal(generation.isCurrent(latestSelection), true);
  generation.next();
  assert.equal(generation.isCurrent(latestSelection), false);
});
