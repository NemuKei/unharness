import stock from '../../assets/appearance-templates/hangar-layered-v1/stock.json' with { type: 'json' };

export type LayerAsset = { assetId: string; format: 'png'; width: 724; height: 724; bytes: number };
export type LayerManifest = { kind: 'unharness-layered-appearance'; schemaVersion: 1; templateId: string;
  assets: LayerAsset[]; layers: { entity: { assetId: string }; background: { assetId: string };
    restraints: Array<{ partId: string; assetId: string }> } };
export const stockLayerManifest = stock.manifest as LayerManifest;
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value: unknown, keys: string[]): value is Record<string, unknown> => object(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export function validLayerManifest(value: unknown): value is LayerManifest {
  if (!exact(value, ['kind', 'schemaVersion', 'templateId', 'assets', 'layers']) || value.kind !== 'unharness-layered-appearance'
    || value.schemaVersion !== 1 || value.templateId !== stock.manifest.templateId || !Array.isArray(value.assets)
    || !value.assets.length || value.assets.length > 64 || !exact(value.layers, ['entity', 'background', 'restraints'])) return false;
  const ids = new Set<string>(); let bytes = 0;
  for (const asset of value.assets) {
    if (!exact(asset, ['assetId', 'format', 'width', 'height', 'bytes']) || !hash(asset.assetId) || ids.has(asset.assetId)
      || asset.format !== 'png' || asset.width !== 724 || asset.height !== 724 || typeof asset.bytes !== 'number'
      || !Number.isSafeInteger(asset.bytes) || asset.bytes < 1 || asset.bytes > 8 * 1024 * 1024) return false;
    ids.add(asset.assetId); bytes += asset.bytes;
  }
  if (bytes > 64 * 1024 * 1024) return false;
  const used = new Set<string>();
  for (const role of ['entity', 'background']) {
    const part = value.layers[role];
    if (!exact(part, ['assetId']) || !hash(part.assetId) || !ids.has(part.assetId)) return false;
    used.add(part.assetId);
  }
  const expected = stock.manifest.layers.restraints.map(part => part.partId), seen = new Set<string>();
  if (!Array.isArray(value.layers.restraints) || value.layers.restraints.length !== expected.length) return false;
  for (const part of value.layers.restraints) {
    if (!exact(part, ['partId', 'assetId']) || typeof part.partId !== 'string' || !expected.includes(part.partId) || seen.has(part.partId)
      || !hash(part.assetId) || !ids.has(part.assetId)) return false;
    seen.add(part.partId); used.add(part.assetId);
  }
  return used.size === ids.size;
}
