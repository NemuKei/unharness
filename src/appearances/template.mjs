import { isDeepStrictEqual } from 'node:util';
import { recordId } from '../core/local-store.mjs';
import { exactKeys } from '../comparisons/assessment.mjs';
import { fail } from '../sources/errors.mjs';
import { WORLD, sourceArms, coreBounds, coreNucleus, coreMask } from './parts.mjs';
import { buildCels, sourcePanels } from './kinematics.mjs';

const error = () => fail('appearance-template-invalid');
const exact = (value, keys) => exactKeys(value, keys, [], 'appearance-template-invalid');
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export const LAYER_IMAGE_LIMIT = 8 * 1024 * 1024;
export const LAYER_SET_LIMIT = 64 * 1024 * 1024;
export const LAYER_COUNT_LIMIT = 64;
export const APPEARANCE_UPLOAD_BODY_LIMIT = Math.ceil(LAYER_SET_LIMIT * 4 / 3) + 64 * 1024;
const definition = {
  kind: 'unharness-layer-template', schemaVersion: 1, name: 'hangar-layered-v1',
  rendererVersion: 'mechanical-layers/v1', canvas: { width: WORLD, height: WORLD },
  entityAnchor: { ...coreNucleus }, entityBounds: { ...coreBounds }, entityGuide: [...coreMask],
  order: ['background', 'rear-restraints', 'entity', 'front-restraints'],
  parts: [
    { id: 'background', role: 'background', kind: 'background', order: 'background' },
    ...sourceArms.map(arm => ({ id: 'arm-' + arm.id, role: 'restraints', kind: 'arm', order: 'rear-restraints',
      side: arm.side, group: arm.group, pivot: { ...arm.pivot }, mask: [...arm.polygon], solid: [...arm.solid] })),
    { id: 'entity', role: 'entity', kind: 'entity', order: 'entity', anchor: { ...coreNucleus } },
    ...sourcePanels.map(panel => ({ id: 'panel-' + panel.id, role: 'restraints', kind: 'panel', order: 'front-restraints',
      side: panel.side, points: panel.points.map(point => ({ ...point })) })),
    { id: 'glint', role: 'restraints', kind: 'glint', order: 'front-restraints', bounds: { x: 198, y: 354, width: 330, height: 40 } },
  ],
  poses: buildCels(),
};
// JSON cannot preserve negative zero. Normalize once so saved definitions and
// fresh in-memory definitions have the same exact data representation.
const persistedDefinition = JSON.parse(JSON.stringify(definition));
const TEMPLATE = { id: recordId('appearance', persistedDefinition), ...persistedDefinition };
export function getAppearanceTemplate() { return structuredClone(TEMPLATE); }

// Data validation only. Import/storage separately decode each PNG and verify
// actual byte identity, dimensions, ownership and metadata before publication.
export function validateLayeredAppearance(manifest, template = TEMPLATE) {
  try {
    recordId('appearance', manifest); recordId('appearance', template);
    if (!isDeepStrictEqual(template, TEMPLATE)) error();
    exact(manifest, ['kind', 'schemaVersion', 'templateId', 'assets', 'layers']);
    if (manifest.kind !== 'unharness-layered-appearance' || manifest.schemaVersion !== 1 || manifest.templateId !== template.id
      || !Array.isArray(manifest.assets) || !manifest.assets.length || manifest.assets.length > LAYER_COUNT_LIMIT) error();
    const ids = new Set(); let size = 0;
    for (const asset of manifest.assets) {
      exact(asset, ['assetId', 'format', 'width', 'height', 'bytes']);
      if (!hash(asset.assetId) || ids.has(asset.assetId) || asset.format !== 'png' || asset.width !== WORLD || asset.height !== WORLD
        || !Number.isSafeInteger(asset.bytes) || asset.bytes < 1 || asset.bytes > LAYER_IMAGE_LIMIT) error();
      ids.add(asset.assetId); size += asset.bytes;
    }
    if (size > LAYER_SET_LIMIT) error();
    exact(manifest.layers, ['entity', 'background', 'restraints']);
    for (const role of ['entity', 'background']) {
      exact(manifest.layers[role], ['assetId']);
      if (!ids.has(manifest.layers[role].assetId)) error();
    }
    const expected = template.parts.filter(part => part.role === 'restraints').map(part => part.id);
    if (!Array.isArray(manifest.layers.restraints) || manifest.layers.restraints.length !== expected.length) error();
    const parts = new Set(), used = new Set([manifest.layers.entity.assetId, manifest.layers.background.assetId]);
    for (const part of manifest.layers.restraints) {
      exact(part, ['partId', 'assetId']);
      if (!expected.includes(part.partId) || parts.has(part.partId) || !ids.has(part.assetId)) error();
      parts.add(part.partId); used.add(part.assetId);
    }
    if (used.size !== ids.size) error();
    return structuredClone(manifest);
  } catch { error(); }
}
export function resolveAppearanceLayers(manifest, template, mode) {
  const value = validateLayeredAppearance(manifest, template);
  if (!['normal', 'unseal', 'trueform'].includes(mode)) error();
  const parts = new Map(value.layers.restraints.map(part => [part.partId, part.assetId]));
  return { templateId: template.id, canvas: { ...template.canvas }, mode, order: [...template.order],
    entity: { ...value.layers.entity, anchor: { ...template.entityAnchor } }, background: { ...value.layers.background },
    restraints: template.parts.filter(part => part.role === 'restraints').map(part => ({ ...structuredClone(part), assetId: parts.get(part.id) })),
    pose: structuredClone(template.poses[{ normal: 0, unseal: 24, trueform: 48 }[mode]]) };
}
