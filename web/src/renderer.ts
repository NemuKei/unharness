import "./pixi-csp";
import { Application, Rectangle, Texture } from "pixi.js";
import artworkUrl from "../assets/hangar-states-v1.png";
import emptyUrl from "../assets/hangar-empty-v4.png";
import recipe from "../assets/hangar-v4.json";
import { createReleaseMotion } from "./scene-motion";
import { createHangarRig } from "./scene-rig";
import type { FixtureCase } from "./types";

export interface Scene {
  setCondition: (condition: FixtureCase, immediate?: boolean) => void;
  setEffects: (enabled: boolean) => void;
  setVisible: (visible: boolean) => void;
  snapshot: () => Promise<string>;
  templateLayers: () => Promise<{ id: string; dataUrl: string }[]>;
  destroy: () => void;
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
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    const ownedCanvasWasAttached = initialized && app.canvas.parentElement === host;
    if (initialized) app.destroy(true, { children: true, texture: false, textureSource: false });
    rig?.destroy();
    sourceTextures.forEach(texture => texture.destroy(true));
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
        return app.renderer.extract.base64({ target: app.stage, frame: new Rectangle(0, 0, recipe.worldSize, recipe.worldSize), format: 'png', resolution: 1 });
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
