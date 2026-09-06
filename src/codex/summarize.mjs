const SOURCE_TYPES = new Set([
  'packagedDefaults',
  'mdm',
  'system',
  'enterpriseManaged',
  'user',
  'project',
  'sessionFlags',
  'legacyManagedConfigTomlFromFile',
  'legacyManagedConfigTomlFromMdm',
]);

const PRESENCE_KEYS = [
  'skills',
  'hooks',
  'memories',
  'plugins',
  'mcp_servers',
  'instructions',
  'developer_instructions',
  'model_instructions_file',
];

const SKILL_SCOPES = ['user', 'repo', 'system', 'admin'];

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function invalidResponse() {
  return { status: 'error', error: { kind: 'invalid-response' } };
}

function summarizeConfig(rawResult) {
  if (!isRecord(rawResult) || !isRecord(rawResult.config) || !isRecord(rawResult.origins)) {
    return invalidResponse();
  }
  if (!Object.hasOwn(rawResult, 'layers') || rawResult.layers === null) {
    return { status: 'ok', summary: { layers: { status: 'unknown' } } };
  }
  if (!Array.isArray(rawResult.layers)) return invalidResponse();

  const items = [];
  for (const layer of rawResult.layers) {
    if (!isRecord(layer) || !isRecord(layer.name) || !isRecord(layer.config)) return invalidResponse();
    if (Object.hasOwn(layer, 'disabledReason')
      && layer.disabledReason !== null
      && typeof layer.disabledReason !== 'string') return invalidResponse();

    const presence = {};
    for (const key of PRESENCE_KEYS) presence[key] = Object.hasOwn(layer.config, key);
    items.push({
      sourceType: SOURCE_TYPES.has(layer.name.type) ? layer.name.type : 'unknown',
      disabled: typeof layer.disabledReason === 'string',
      presence,
    });
  }

  return {
    status: 'ok',
    summary: { layers: { status: 'known', total: items.length, items } },
  };
}

function summarizeSkills(rawResult) {
  if (!isRecord(rawResult) || !Array.isArray(rawResult.data)) return invalidResponse();
  const summary = {
    total: 0,
    enabled: 0,
    disabled: 0,
    unknownEnabled: 0,
    errors: 0,
    pluginAssociated: 0,
    scopes: { user: 0, repo: 0, system: 0, admin: 0, unknown: 0 },
  };

  for (const entry of rawResult.data) {
    if (!isRecord(entry) || !Array.isArray(entry.skills) || !Array.isArray(entry.errors)) return invalidResponse();
    summary.errors += entry.errors.length;
    for (const skill of entry.skills) {
      if (!isRecord(skill)) return invalidResponse();
      summary.total += 1;
      if (skill.enabled === true) summary.enabled += 1;
      else if (skill.enabled === false) summary.disabled += 1;
      else summary.unknownEnabled += 1;
      if (typeof skill.pluginId === 'string' && skill.pluginId.length > 0) summary.pluginAssociated += 1;
      const scope = SKILL_SCOPES.includes(skill.scope) ? skill.scope : 'unknown';
      summary.scopes[scope] += 1;
    }
  }

  return { status: 'ok', summary };
}

function summarizeHooks(rawResult) {
  if (!isRecord(rawResult) || !Array.isArray(rawResult.data)) return invalidResponse();
  const summary = { total: 0, warnings: 0, errors: 0 };
  for (const entry of rawResult.data) {
    if (!isRecord(entry) || !Array.isArray(entry.hooks) || !Array.isArray(entry.warnings) || !Array.isArray(entry.errors)) {
      return invalidResponse();
    }
    summary.total += entry.hooks.length;
    summary.warnings += entry.warnings.length;
    summary.errors += entry.errors.length;
  }
  return { status: 'ok', summary };
}

function summarizeRequirements(rawResult) {
  if (!isRecord(rawResult)) return invalidResponse();
  if (!Object.hasOwn(rawResult, 'requirements')) return { status: 'ok', summary: { present: 'unknown' } };
  if (rawResult.requirements === null) return { status: 'ok', summary: { present: false } };
  if (isRecord(rawResult.requirements)) return { status: 'ok', summary: { present: true } };
  return invalidResponse();
}

export function summarizeQuery(method, rawResult) {
  if (method === 'config/read') return summarizeConfig(rawResult);
  if (method === 'skills/list') return summarizeSkills(rawResult);
  if (method === 'hooks/list') return summarizeHooks(rawResult);
  if (method === 'configRequirements/read') return summarizeRequirements(rawResult);
  return invalidResponse();
}
