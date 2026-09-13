import "./pixi-csp";
import { Application, ImageSource, Rectangle, Texture } from "pixi.js";
import artworkUrl from "../assets/hangar-states-v1.png";
import emptyUrl from "../assets/hangar-empty-v4.png";
import recipe from "../assets/hangar-v4.json";
import { createReleaseMotion } from "./scene-motion";
import { createHangarRig } from "./scene-rig";
import { prepareLayerImages } from "./appearance-layers";
import type { LayerManifest, LayerImageLoader, PreparedLayerImages } from "./appearance-layers";
import type { FixtureCase } from "./types";
import type { AppearanceRecipe, AppearanceTreatment } from "./appearances";
import { ENTITY_MODES, entityPointFits, entityEmission } from '../../src/appearances/entity-profile.mjs';
import type { EntityLayout } from './entity-awakening';

export interface Scene {
  setCondition: (condition: FixtureCase, immediate?: boolean) => void;
  setAppearance: (recipe: AppearanceRecipe | null, treatment?: AppearanceTreatment) => void;
  setLayers: (manifest: LayerManifest | null, loadImage?: LayerImageLoader) => Promise<void>;
  setEffects: (enabled: boolean) => void;
  setVisible: (visible: boolean) => void;
  snapshot: () => Promise<string>;
  templateLayers: () => Promise<{ id: string; dataUrl: string }[]>;
  destroy: () => void;
}

// Each bitmap/source is owned once per asset, even when several parts use it.
// Sprites/meshes borrow these textures and never destroy their source.
function makeLayerTextures(images: PreparedLayerImages) {
  const textures = new Map<string, Texture>(), sources: ImageSource[] = [];
  const entityLayout:EntityLayout={}, emissions=new Map<string,Texture>();
  let destroyed = false;
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    try { textures.forEach(texture => texture.destroy(false)); emissions.forEach(texture=>texture.destroy(false)); }
    finally { try { sources.forEach(source => source.destroy()); } finally { images.destroy(); } }
  };
  try {
    images.images.forEach((image, id) => {
      const source = new ImageSource({ resource: image, scaleMode: 'nearest', alphaMode: 'premultiplied-alpha' });
      sources.push(source); textures.set(id, new Texture({ source }));
    });
    if(images.manifest.schemaVersion===2)for(const mode of ENTITY_MODES) {
      const bitmap=images.images.get(images.manifest.layers.entity.poses[mode].assetId)!;
      const canvas=document.createElement('canvas');canvas.width=canvas.height=724;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('appearance-image-decode-unavailable');
      ctx.drawImage(bitmap,0,0);const pixels=ctx.getImageData(0,0,724,724);
      const bounds={left:724,top:724,right:-1,bottom:-1,theme:'cyan' as 'cyan'|'amber'}, weights={cyan:0,amber:0};
      for(let y=0;y<724;y++)for(let x=0;x<724;x++) {
        const i=(y*724+x)*4,rgba=pixels.data;
        if(rgba[i+3]) {
          if(!entityPointFits(mode,x,y))throw Error('appearance-entity-poses-invalid');
          bounds.left=Math.min(bounds.left,x);bounds.right=Math.max(bounds.right,x);bounds.top=Math.min(bounds.top,y);bounds.bottom=Math.max(bounds.bottom,y);
        }
        // Palette-reserved emission follows actual painted details, never a
        // guessed eye position, and cannot illuminate ordinary white armor.
        const light=entityEmission(rgba[i],rgba[i+1],rgba[i+2]);
        weights[light.theme]+=light.strength*rgba[i+3];
        rgba[i]=light.color>>16&255;rgba[i+1]=light.color>>8&255;rgba[i+2]=light.color&255;rgba[i+3]*=light.strength;
      }
      if(bounds.right<bounds.left)throw Error('appearance-entity-poses-invalid');
      bounds.theme=weights.amber>weights.cyan?'amber':'cyan';
      entityLayout[mode]=bounds;ctx.putImageData(pixels,0,0);
      const source=new ImageSource({resource:canvas,scaleMode:'nearest'});sources.push(source);
      emissions.set('entity-emission-'+mode,new Texture({source}));
    }
    return { parts: new Map<string,Texture>([...images.replacements].map(([part, id]):[string,Texture] => [part, textures.get(id)!]).concat([...emissions])), entityLayout, destroy };
  } catch (error) { destroy(); throw error; }
}

export async function createScene(
  host: HTMLElement,
  signal: AbortSignal,
  onMotionChange: (moving: boolean) => void = () => {},
): Promise<Scene | null> {
  if (signal.aborted || !host) return null;
  const app = new Application();
  const sourceTextures: Texture[] = [];
  let rig: ReturnType<typeof createHangarRig> | undefined;
  let initialized = false;
  let disposed = false;
  let phase = "renderer-init";
  let layerEpoch = 0, layerLoad: AbortController | null = null;
  let selectedLayers: ReturnType<typeof makeLayerTextures> | null = null;
  let legacyAppearance: AppearanceRecipe | null = null, legacyTreatment: AppearanceTreatment = 'neutral';
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    ++layerEpoch; layerLoad?.abort(); layerLoad = null;
    signal.removeEventListener('abort', dispose);
    const ownedCanvasWasAttached = initialized && app.canvas.parentElement === host;
    // Other live scenes still use Pixi's shared pools. Boolean true would
    // release those pools as well as this canvas, invalidating their batches.
    try { if (initialized) app.destroy({ removeView: true, releaseGlobalResources: false }, { children: true, texture: false, textureSource: false }); }
    finally {
      try { rig?.destroy(); }
      finally {
        try { selectedLayers?.destroy(); selectedLayers = null; }
        finally { sourceTextures.forEach(texture => texture.destroy(true)); }
      }
    }
    // A late aborted load must not overwrite a newer scene's diagnostic state.
    if (ownedCanvasWasAttached) host.dataset.playback = "stopped";
  };

  try {
    await app.init({
      width: recipe.worldSize,
      height: recipe.worldSize,
      backgroundAlpha: 0,
      antialias: false,
      autoStart: false,
      preference: "webgl",
      resolution: 1,
    });
    initialized = true;
    signal.addEventListener('abort', dispose, { once: true });
    if (signal.aborted) { dispose(); return null; }
    phase = "artwork-decode";
    const images = await Promise.all([artworkUrl, emptyUrl].map(async url => {
      const image = new Image();
      image.src = url;
      await image.decode();
      return image;
    }));
    if (signal.aborted) { dispose(); return null; }
    phase = "scene-setup";
    const textures = images.map(image => {
      const texture = Texture.from(image);
      texture.source.scaleMode = "nearest";
      sourceTextures.push(texture);
      return texture;
    });
    rig = createHangarRig(app.stage, { sheet: textures[0], empty: textures[1] }, app.renderer);
    const motion = createReleaseMotion("baseline");
    let elapsed = 0;
    let effects = false;
    let visible = !document.hidden;
    let lastMoving = false;

    const render = () => {
      if (disposed) return;
      const pose = motion.sample(elapsed);
      const cel = rig!.render(pose.release, elapsed, effects);
      if (pose.moving !== lastMoving) {
        lastMoving = pose.moving;
        if (!signal.aborted) onMotionChange(lastMoving);
      }
      host.dataset.motion = pose.moving ? "transition" : "idle";
      host.dataset.release = pose.release.toFixed(3);
      host.dataset.cel = String(cel);
    };
    const syncTicker = () => {
      if (effects && visible) app.start();
      else app.stop();
      // This reports the real ticker state for local rendering diagnostics.
      host.dataset.playback = app.ticker.started ? "running" : "stopped";
    };
    const drawNow = () => {
      render();
      if (visible) app.render();
    };
    app.ticker.maxFPS = 30;
    app.ticker.add(ticker => {
      // Use active visual time so a backgrounded tab resumes without a jump.
      elapsed += Math.max(0, Math.min(ticker.deltaMS, 100)) / 1000;
      render();
    });
    app.canvas.setAttribute("aria-hidden", "true");
    host.append(app.canvas);
    const scene: Scene = {
      setAppearance(value, treatment = 'neutral') {
        if (disposed) return;
        legacyAppearance = value; legacyTreatment = treatment;
        rig!.setAppearance(value, treatment);
        if (!selectedLayers) {
          host.dataset.appearance = value?.seed ?? 'baseline';
          host.dataset.treatment = treatment;
        }
        drawNow();
      },
      async setLayers(manifest, loadImage) {
        if (disposed || signal.aborted) throw Error('appearance-render-unavailable');
        const epoch = ++layerEpoch;
        layerLoad?.abort();
        const load = new AbortController(); layerLoad = load;
        let candidate: ReturnType<typeof makeLayerTextures> | null = null;
        try {
          if (manifest !== null) candidate = makeLayerTextures(await prepareLayerImages(manifest, loadImage, load.signal));
          if (disposed || load.signal.aborted || epoch !== layerEpoch) throw new DOMException('Layer selection cancelled', 'AbortError');
          const previous = selectedLayers;
          // Commit is synchronous, after all images exist. Restore the old set
          // if installing/uploading this set throws; never manufacture success.
          try { rig!.setLayers(candidate?.parts ?? null,candidate?.entityLayout); drawNow(); }
          catch (error) {
            rig!.setLayers(previous?.parts ?? null,previous?.entityLayout);
            try { drawNow(); } catch { /* The original render failure is authoritative. */ }
            throw error;
          }
          selectedLayers = candidate; candidate = null;
          previous?.destroy();
          host.dataset.appearance = selectedLayers ? 'layered' : legacyAppearance?.seed ?? 'baseline';
          host.dataset.treatment = selectedLayers ? 'neutral' : legacyTreatment;
        } finally {
          candidate?.destroy();
          if (layerLoad === load) layerLoad = null;
        }
      },
      setCondition(condition, immediate = false) {
        if (disposed) return;
        motion.retarget(condition, elapsed);
        if (immediate || !effects) motion.finish();
        drawNow();
      },
      setEffects(enabled) {
        if (disposed || effects === enabled) return;
        effects = enabled;
        if (!effects) motion.finish();
        drawNow();
        syncTicker();
      },
      setVisible(nextVisible) {
        if (disposed || visible === nextVisible) return;
        visible = nextVisible;
        if (visible) drawNow();
        syncTicker();
      },
      async snapshot() {
        if (disposed) throw new Error('appearance-render-unavailable');
        drawNow();
        const image = await app.renderer.extract.base64({ target: app.stage, frame: new Rectangle(0, 0, recipe.worldSize, recipe.worldSize), format: 'png', resolution: 1 });
        if (disposed || signal.aborted) throw Error('appearance-render-unavailable');
        return image;
      },
      templateLayers() {
        if (disposed) throw new Error('appearance-render-unavailable');
        return rig!.exportTemplateLayers();
      },
      destroy: dispose,
    };
    drawNow();
    syncTicker();
    return scene;
  } catch (error) {
    console.warn("[Unharness graphics] " + phase + " failed; static fallback retained.");
    dispose();
    throw error;
  }
}

export async function renderAppearancePreviews(
  variants: Array<{ id: string; recipe: AppearanceRecipe }>, condition: FixtureCase, treatment: AppearanceTreatment, signal: AbortSignal,
) {
  if (variants.length < 1 || variants.length > 3) throw new Error('appearance-render-invalid');
  const host = document.createElement('div'), scene = await createScene(host, signal);
  if (!scene) return [];
  try {
    scene.setEffects(false); scene.setCondition(condition, true);
    const images: Array<{ id: string; url: string }> = [];
    for (const variant of variants) {
      if (signal.aborted) return [];
      scene.setAppearance(variant.recipe, treatment);
      const url = await scene.snapshot();
      if (signal.aborted) return [];
      images.push({ id: variant.id, url });
    }
    return images;
  } finally { scene.destroy(); }
}
