import type { Scene } from './renderer';
import type { ArtworkImageLoader, ArtworkItem } from './artwork';
import type { LayerManifest } from './appearance-layers';
import type { FixtureCase } from './types';

type LayerScene = Scene & { setLayers: (manifest: LayerManifest | null, loader?: ArtworkImageLoader) => Promise<void> };
function layerScene(scene: Scene): LayerScene {
  if (!('setLayers' in scene) || typeof scene.setLayers !== 'function') throw new Error('appearance-layer-renderer-unavailable');
  return scene as LayerScene;
}
export async function setSceneArtwork(scene: Scene, item: ArtworkItem | null, loader?: ArtworkImageLoader) {
  if (item?.kind === 'layered') await layerScene(scene).setLayers(item.manifest, loader);
  else {
    if ('setLayers' in scene && typeof scene.setLayers === 'function') await layerScene(scene).setLayers(null);
    scene.setAppearance(item?.recipe ?? null, 'neutral');
  }
}
export async function renderArtworkImages(item: ArtworkItem | null, loader: ArtworkImageLoader | undefined,
  conditions: FixtureCase[], signal: AbortSignal) {
  const { createScene } = await import('./renderer');
  const host = document.createElement('div'), scene = await createScene(host, signal);
  if (!scene) throw new Error('appearance-render-unavailable');
  try {
    scene.setEffects(false);
    await setSceneArtwork(scene, item, loader);
    const images: string[] = [];
    for (const condition of conditions) {
      if (signal.aborted) throw new Error('appearance-render-cancelled');
      scene.setCondition(condition, true);
      images.push(await scene.snapshot());
    }
    return images;
  } finally { scene.destroy(); }
}
export async function renderArtworkCollection(ids: string[], readItem: (id: string) => Promise<ArtworkItem>,
  loaderFor: (id: string) => ArtworkImageLoader, signal: AbortSignal, onImage: (id: string, url: string) => void,
  onFailure: (id: string) => void) {
  const { createScene } = await import('./renderer');
  const host = document.createElement('div'), scene = await createScene(host, signal);
  if (!scene) throw Error('appearance-render-unavailable');
  const stop = () => scene.destroy();
  signal.addEventListener('abort', stop, { once: true });
  try {
    scene.setEffects(false);
    for (const id of ids) {
      if (signal.aborted) return;
      try {
        const item = await readItem(id);
        if (signal.aborted) return;
        await setSceneArtwork(scene, item, item.kind === 'layered' ? loaderFor(id) : undefined);
        if (signal.aborted) return;
        scene.setCondition('fixed-only', true);
        const url = await scene.snapshot();
        if (!signal.aborted) onImage(id, url);
      } catch { if (!signal.aborted) onFailure(id); }
    }
  } finally { signal.removeEventListener('abort', stop); scene.destroy(); }
}
