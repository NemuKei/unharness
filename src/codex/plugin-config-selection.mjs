// Exact managed-field partition, shared by native reconciliation and the
// offline restore guard. An ID authorizes only its enabled field, never its
// whole plugin table or neighboring dotted keys.
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export function validatePluginIds(value) {
  if (!Array.isArray(value) || value.length > 32 || new Set(value).size !== value.length
    || value.some(id => typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._@~-]{0,255}$/.test(id)))
    throw Error('Invalid registered plugin identifiers');
  return [...value];
}

export function partitionPluginEnablement(config, pluginIds) {
  const ids = validatePluginIds(pluginIds).sort(), retained = structuredClone(config), selected = [];
  if (!ids.length) return { selected, retained };
  if (!object(config) || Object.hasOwn(config, 'plugins') && !object(config.plugins)) throw Error('Invalid plugin configuration');
  for (const pluginId of ids) {
    const entry = Object.hasOwn(config.plugins ?? {}, pluginId) ? config.plugins[pluginId] : undefined;
    if (entry !== undefined && (!object(entry) || Object.hasOwn(entry, 'enabled') && typeof entry.enabled !== 'boolean'))
      throw Error('Invalid plugin configuration');
    selected.push({ pluginId, enabled: entry && Object.hasOwn(entry, 'enabled') ? entry.enabled : null });
    if (entry !== undefined) {
      delete retained.plugins[pluginId].enabled;
      if (!Object.keys(retained.plugins[pluginId]).length) delete retained.plugins[pluginId];
    }
  }
  if (retained.plugins && !Object.keys(retained.plugins).length) delete retained.plugins;
  return { selected, retained };
}
