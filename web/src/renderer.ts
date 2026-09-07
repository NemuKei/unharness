import "./pixi-csp";
import { Application, Rectangle, Texture } from "pixi.js";
import backgroundUrl from "../assets/background-v2.png";
import capsuleUrl from "../assets/capsule-v2.png";
import coreUrl from "../assets/core-v2.png";
import recipe from "../assets/hangar-v2.json";
import { createReleaseMotion } from "./scene-motion";
import { createHangarRig } from "./scene-rig";
import type { RigTextures } from "./scene-rig";
import type { FixtureCase } from "./types";

export interface Scene {
  setCondition: (condition: FixtureCase, immediate?: boolean) => void;
  setEffects: (enabled: boolean) => void;
  setVisible: (visible: boolean) => void;
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
  const croppedTextures: Texture[] = [];
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
    croppedTextures.forEach(texture => texture.destroy(false));
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
    const resources = { background: backgroundUrl, capsule: capsuleUrl, core: coreUrl };
    const loaded = await Promise.all(
      Object.entries(resources).map(async ([name, url]) => {
        const image = new Image();
        image.src = url;
        await image.decode();
        return { name: name as keyof RigTextures, image };
      }),
    );
    if (signal.aborted) { dispose(); return null; }
    phase = "scene-setup";
    const textures = {} as RigTextures;
    for (const { name, image } of loaded) {
      const full = Texture.from(image);
      full.source.scaleMode = "nearest";
      sourceTextures.push(full);
      const [x0, y0, x1, y1] = recipe.assets[name].bounds;
      const cropped = new Texture({
        source: full.source,
        frame: new Rectangle(x0, y0, x1 - x0, y1 - y0),
      });
      croppedTextures.push(cropped);
      textures[name] = cropped;
    }
    rig = createHangarRig(app.stage, textures);
    const motion = createReleaseMotion("baseline");
    let elapsed = 0;
    let effects = false;
    let visible = !document.hidden;
    let lastMoving = false;

    const render = () => {
      if (disposed) return;
      const pose = motion.sample(elapsed);
      rig!.render(pose.release, elapsed, effects);
      if (pose.moving !== lastMoving) {
        lastMoving = pose.moving;
        if (!signal.aborted) onMotionChange(lastMoving);
      }
      host.dataset.motion = pose.moving ? "transition" : "idle";
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
