import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  cancelRender,
  continueRender,
  delayRender,
  staticFile,
} from "remotion";
import { Application, ImageSource, Texture } from "pixi.js";
import "../../../../web/src/pixi-csp";
import { createHangarRig } from "../../../../web/src/scene-rig";
import type { EntityLayout } from "../../../../web/src/entity-awakening";
import {
  ENTITY_MOTION_FRAMES,
  ENTITY_MOTION_PROFILE_ID,
  entityEmission,
} from "../../../../src/appearances/entity-profile.mjs";

type Look = "default" | "silver-v2" | "amber-v2";
type Prepared = { map: Map<string, Texture>; layout: EntityLayout };
type Runtime = {
  app: Application;
  rig: ReturnType<typeof createHangarRig>;
  looks: Map<Look, Prepared>;
  textures: Texture[];
  look: Look;
};
const texture = async (path: string) => {
  const image = new Image();
  image.src = staticFile(path);
  await image.decode();
  const tex = Texture.from(image);
  tex.source.scaleMode = "nearest";
  return { image, tex };
};
async function character(kind: Look, textures: Texture[]): Promise<Prepared> {
  const map = new Map<string, Texture>(),
    layout: EntityLayout = { profileId: ENTITY_MOTION_PROFILE_ID };
  for (const frame of ENTITY_MOTION_FRAMES) {
    const { image, tex } = await texture(`art/${kind}/entity-${frame}.png`);
    textures.push(tex);
    map.set("entity-" + frame, tex);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 724;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, 724, 724);
    const bounds = {
      left: 724,
      top: 724,
      right: -1,
      bottom: -1,
      theme: kind === "amber-v2" ? ("amber" as const) : ("cyan" as const),
    };
    for (let y = 0; y < 724; y++)
      for (let x = 0; x < 724; x++) {
        const i = (y * 724 + x) * 4,
          d = pixels.data;
        if (d[i + 3]) {
          bounds.left = Math.min(bounds.left, x);
          bounds.right = Math.max(bounds.right, x);
          bounds.top = Math.min(bounds.top, y);
          bounds.bottom = Math.max(bounds.bottom, y);
        }
        const light = entityEmission(d[i], d[i + 1], d[i + 2]);
        d[i] = (light.color >> 16) & 255;
        d[i + 1] = (light.color >> 8) & 255;
        d[i + 2] = light.color & 255;
        d[i + 3] *= light.strength;
      }
    layout[frame] = bounds;
    ctx.putImageData(pixels, 0, 0);
    const emission = new Texture({
      source: new ImageSource({
        resource: canvas,
        scaleMode: "nearest",
        alphaMode: "premultiplied-alpha",
      }),
    });
    textures.push(emission);
    map.set("entity-emission-" + frame, emission);
  }
  return { map, layout };
}
/** Reuses the shipped geometry. Video time is the only clock; no GUI/controller. */
export function PixiHangar({
  release,
  time,
  look = "default",
}: {
  release: number;
  time: number;
  look?: Look;
}) {
  const host = useRef<HTMLDivElement>(null),
    runtime = useRef<Runtime | null>(null);
  const latest = useRef({ release, time, look });
  latest.current = { release, time, look };
  const [handle] = useState(() =>
    delayRender("Load original Unharness rig", {
      timeoutInMilliseconds: 60000,
    }),
  );
  const draw = () => {
    const r = runtime.current;
    if (!r) return;
    const value = latest.current;
    if (r.look !== value.look) {
      const selected = r.looks.get(value.look);
      r.rig.setLayers(selected?.map ?? null, selected?.layout);
      r.look = value.look;
    }
    r.rig.render(value.release, value.time, true);
    r.app.render();
  };
  useEffect(() => {
    let disposed = false;
    let value: Runtime | null = null;
    const dispose = () => {
      if (!value) return;
      value.app.destroy(
        { removeView: true, releaseGlobalResources: false },
        { children: true, texture: false, textureSource: false },
      );
      value.rig.destroy();
      value.textures.forEach((t) => t.destroy(true));
      value = null;
    };
    void (async () => {
      const app = new Application();
      await app.init({
        width: 724,
        height: 724,
        backgroundAlpha: 0,
        antialias: false,
        autoStart: false,
        preference: "webgl",
        resolution: 1,
      });
      const [sheet, empty] = await Promise.all([
        texture("art/hangar-states.png"),
        texture("art/hangar-empty.png"),
      ]);
      const textures = [sheet.tex, empty.tex];
      const rig = createHangarRig(
        app.stage,
        { sheet: sheet.tex, empty: empty.tex },
        app.renderer,
      );
      const looks = new Map<Look, Prepared>();
      for (const kind of ["silver-v2", "amber-v2"] as const)
        looks.set(kind, await character(kind, textures));
      value = { app, rig, looks, textures, look: "default" };
      if (disposed) {
        dispose();
        return;
      }
      app.canvas.style.width = "100%";
      app.canvas.style.height = "100%";
      app.canvas.style.imageRendering = "pixelated";
      host.current!.appendChild(app.canvas);
      runtime.current = value;
      draw();
      continueRender(handle);
    })().catch((error) => {
      dispose();
      if (!disposed) cancelRender(error);
    });
    return () => {
      disposed = true;
      runtime.current = null;
      dispose();
      continueRender(handle);
    };
    // One renderer per composition instance. Frame/appearance changes draw below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle]);
  useLayoutEffect(draw, [release, time, look]);
  return <div ref={host} style={{ width: "100%", height: "100%" }} />;
}
