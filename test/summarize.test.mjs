import test from 'node:test';
import assert from 'node:assert/strict';

import { summarizeQuery } from '../src/codex/summarize.mjs';

const SECRET = 'SECRET_MARKER';

test('reports known skill counts without leaking skill or error text', () => {
  const result = summarizeQuery('skills/list', { data: [{
    cwd: '/private/synthetic-user/project',
    skills: [{ name: SECRET, path: `/private/${SECRET}`, description: SECRET, scope: 'user', enabled: false, pluginId: SECRET }],
    errors: [{ message: SECRET }],
  }] });

  assert.deepEqual(result, {
    status: 'ok',
    summary: {
      total: 1,
      enabled: 0,
      disabled: 1,
      unknownEnabled: 0,
      errors: 1,
      pluginAssociated: 1,
      scopes: { user: 1, repo: 0, system: 0, admin: 0, unknown: 0 },
    },
  });
  assert.equal(JSON.stringify(result).includes(SECRET), false);
  assert.equal(JSON.stringify(result).includes('/private/'), false);
});

test('counts only recognized skill states and scopes across all entries', () => {
  const result = summarizeQuery('skills/list', { data: [
    { skills: [{ enabled: true, scope: 'repo', pluginId: SECRET }, { enabled: 'yes', scope: 'system' }], errors: [] },
    { skills: [{ enabled: false, scope: 'admin' }, { scope: 'future', pluginId: null }], errors: [{}, {}] },
  ] });

  assert.deepEqual(result.summary, {
    total: 4,
    enabled: 1,
    disabled: 1,
    unknownEnabled: 2,
    errors: 2,
    pluginAssociated: 1,
    scopes: { user: 0, repo: 1, system: 1, admin: 1, unknown: 1 },
  });
});

test('rejects malformed skills containers instead of reporting zero counts', () => {
  for (const raw of [{}, { data: null }, { data: [{ skills: [], errors: null }] }]) {
    assert.deepEqual(summarizeQuery('skills/list', raw), {
      status: 'error', error: { kind: 'invalid-response' },
    });
  }
});

test('projects config layers from allowlisted source types and presence keys', () => {
  const result = summarizeQuery('config/read', {
    config: { instructions: SECRET },
    origins: { model: { name: { type: 'user', file: `/private/${SECRET}` }, version: SECRET } },
    layers: [
      { name: { type: 'user', file: `/private/${SECRET}` }, config: { skills: {}, instructions: SECRET }, version: SECRET, disabledReason: null },
      { name: { type: 'futureSource', marker: SECRET }, config: { hooks: [], mcp_servers: {}, developer_instructions: SECRET }, version: SECRET, disabledReason: SECRET },
    ],
  });

  assert.deepEqual(result, {
    status: 'ok',
    summary: {
      layers: {
        status: 'known',
        total: 2,
        items: [
          {
            sourceType: 'user',
            disabled: false,
            presence: {
              skills: true, hooks: false, memories: false, plugins: false,
              mcp_servers: false, instructions: true, developer_instructions: false,
              model_instructions_file: false,
            },
          },
          {
            sourceType: 'unknown',
            disabled: true,
            presence: {
              skills: false, hooks: true, memories: false, plugins: false,
              mcp_servers: true, instructions: false, developer_instructions: true,
              model_instructions_file: false,
            },
          },
        ],
      },
    },
  });
  assert.equal(JSON.stringify(result).includes(SECRET), false);
  assert.equal(JSON.stringify(result).includes('/private/'), false);
});

test('marks absent config layer inventory unknown and rejects invalid required objects', () => {
  for (const raw of [{ config: {}, origins: {} }, { config: {}, origins: {}, layers: null }]) {
    assert.deepEqual(summarizeQuery('config/read', raw), {
      status: 'ok', summary: { layers: { status: 'unknown' } },
    });
  }
  for (const raw of [{ config: null, origins: {} }, { config: {}, origins: [] }]) {
    assert.deepEqual(summarizeQuery('config/read', raw), {
      status: 'error', error: { kind: 'invalid-response' },
    });
  }
});

test('treats an omitted optional disabled reason as an enabled layer', () => {
  const result = summarizeQuery('config/read', {
    config: {},
    origins: {},
    layers: [{ name: { type: 'system' }, config: {} }],
  });
  assert.equal(result.status, 'ok');
  assert.equal(result.summary.layers.items[0].disabled, false);
});

test('counts hooks, warnings, and errors without copying their content', () => {
  const result = summarizeQuery('hooks/list', { data: [
    { hooks: [{ command: SECRET }], warnings: [{ message: SECRET }], errors: [] },
    { hooks: [{}, {}], warnings: [], errors: [{ message: SECRET }] },
  ] });
  assert.deepEqual(result, { status: 'ok', summary: { total: 3, warnings: 1, errors: 1 } });
  assert.equal(JSON.stringify(result).includes(SECRET), false);
  assert.deepEqual(summarizeQuery('hooks/list', { data: [{ hooks: [], warnings: [] }] }), {
    status: 'error', error: { kind: 'invalid-response' },
  });
});

test('distinguishes present, absent, and malformed requirements', () => {
  assert.deepEqual(summarizeQuery('configRequirements/read', { requirements: null }), {
    status: 'ok', summary: { present: false },
  });
  assert.deepEqual(summarizeQuery('configRequirements/read', { requirements: { marker: SECRET } }), {
    status: 'ok', summary: { present: true },
  });
  assert.deepEqual(summarizeQuery('configRequirements/read', {}), {
    status: 'ok', summary: { present: 'unknown' },
  });
  for (const raw of [{ requirements: false }, { requirements: SECRET }]) {
    assert.deepEqual(summarizeQuery('configRequirements/read', raw), {
      status: 'error', error: { kind: 'invalid-response' },
    });
  }
});

test('rejects unknown query methods without reflecting them', () => {
  assert.deepEqual(summarizeQuery(SECRET, { unexpected: SECRET }), {
    status: 'error', error: { kind: 'invalid-response' },
  });
});
