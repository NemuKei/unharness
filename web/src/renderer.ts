import { Application, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import recipe from '../assets/hangar-v1.json';
import artwork from '../assets/hangar-states-v1.png';
import type { FixtureCase } from './types';

export interface Scene { setCondition: (condition: FixtureCase) => void; setEffects: (enabled: boolean) => void; destroy: () => void }
export async function createScene(host: HTMLElement, signal: AbortSignal): Promise<Scene | null> {
  const app = new Application();
  let initialized = false;
  let disposed = false;
  let texture: Texture | undefined;
  const frames: Partial<Record<FixtureCase, Texture>> = {};
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (initialized) app.destroy(true, { children: true, texture: false, textureSource: false });
    Object.values(frames).forEach(frame => frame.destroy(false));
    texture?.destroy(true);
  };
  try {
    await app.init({ width: recipe.frameWidth, height: recipe.frameHeight, backgroundAlpha: 0, antialias: false, autoStart: false, preference: 'webgl', resolution: 1 });
    initialized = true;
    if (signal.aborted) { dispose(); return null; }
    const image = new Image(); image.src = artwork; await image.decode();
    if (signal.aborted) { dispose(); return null; }
    texture = Texture.from(image); texture.source.scaleMode = 'nearest';
    for (const [key, origin] of Object.entries(recipe.frames)) frames[key as FixtureCase] = new Texture({ source: texture.source, frame: new Rectangle(origin.x, origin.y, recipe.frameWidth, recipe.frameHeight) });
    const sprite = new Sprite(frames.baseline!); app.stage.addChild(sprite);
    const light = new Graphics().circle(362, 366, 8).fill({ color: 0xc2e6ff, alpha: 0.7 }); app.stage.addChild(light);
    const particles = Array.from({ length: 18 }, (_, index) => {
      const particle = new Graphics().rect(0, 0, index % 3 === 0 ? 2 : 1, 2).fill(index % 4 ? 0xe7a64b : 0xb8dbff);
      particle.position.set(70 + (index * 137) % 580, 90 + (index * 79) % 580); particle.alpha = 0.28;
      app.stage.addChild(particle); return particle;
    });
    let time = 0;
    app.ticker.maxFPS = 24;
    app.ticker.add(ticker => {
      time += ticker.deltaMS / 1000;
      light.alpha = 0.22 + Math.sin(time * 1.3) * 0.1;
      particles.forEach((particle, index) => { particle.y -= ticker.deltaMS * (0.002 + index % 3 * 0.001); if (particle.y < 70) particle.y = 655; });
    });
    app.canvas.setAttribute('aria-hidden', 'true'); host.append(app.canvas);
    const scene: Scene = {
      setCondition(condition) { if (disposed) return; sprite.texture = frames[condition]!; app.render(); },
      setEffects(enabled) { if (disposed) return; particles.forEach(particle => { particle.visible = enabled; }); light.visible = enabled; if (enabled) app.start(); else { app.stop(); app.render(); } },
      destroy: dispose,
    };
    scene.setEffects(false); return scene;
  } catch (error) { dispose(); throw error; }
}
