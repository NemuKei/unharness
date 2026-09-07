import { BlurFilter, ColorMatrixFilter, Container, Graphics, Mesh, MeshGeometry, Rectangle, Sprite, Texture } from "pixi.js";
import type { Renderer, Filter } from "pixi.js";
import { buildCels, selectCel, sourcePanels } from "./scene-cels";
import { coreBounds, coreMask, coreNucleus, sourceArms, WORLD } from "./scene-parts";
import recipe from "../assets/hangar-v4.json";

export interface RigTextures { sheet: Texture; empty: Texture }

export function createHangarRig(stage: Container, textures: RigTextures, renderer: Renderer) {
  const cropped: Texture[] = [];
  const baked: Texture[] = [];
  const geometries: MeshGeometry[] = [];
  const filters: Filter[] = [];
  let disposed = false;
  const destroy = () => {
    if (disposed) return;
    disposed = true;
    geometries.forEach(geometry => geometry.destroy(true));
    baked.forEach(texture => texture.destroy(true));
    cropped.forEach(texture => texture.destroy(false));
    filters.forEach(filter => filter.destroy());
  };
  try {
    const sourceTexture = (x: number, y: number, width: number, height: number) => {
      const texture = new Texture({ source: textures.sheet.source, frame: new Rectangle(x, y, width, height) });
      cropped.push(texture);
      return texture;
    };
    const bake = (target: Container, frame: Rectangle) => {
      try {
        const texture = renderer.generateTexture({ target, frame, resolution: 1, clearColor: [0, 0, 0, 0], antialias: false, textureSourceOptions: { scaleMode: "nearest" } });
        baked.push(texture);
        return texture;
      } finally { target.destroy({ children: true, texture: false, textureSource: false }); }
    };
    const normal = sourceTexture(0, 0, WORLD, WORLD);
    const finalReference = sourceTexture(WORLD * 2, 0, WORLD, WORLD);
    const base = new Sprite(textures.empty);
    base.width = base.height = WORLD;
    stage.addChild(base);
    const floorTop = recipe.emptyPlate.originalFloorFromY;
    const originalFloor = new Sprite(sourceTexture(0, floorTop, WORLD, WORLD - floorTop));
    originalFloor.y = floorTop;
    stage.addChild(originalFloor);

    // Baked once: the dark wall inside a tight cable mask must not travel with it.
    const hardwareSeed = new ColorMatrixFilter();
    hardwareSeed.matrix = [1,0,0,0,0, 0,1,0,0,0, 0,0,1,0,0, 4,4,4,0,-3];
    const hardwareFill = new BlurFilter({ strength: 3, quality: 2 });
    const hardwareAlpha = new ColorMatrixFilter();
    hardwareAlpha.matrix = [0,0,0,0,1, 0,0,0,0,1, 0,0,0,0,1, 0,0,0,18,-0.5];
    filters.push(hardwareSeed, hardwareFill, hardwareAlpha);
    const arms = sourceArms.map(source => {
      const xs = source.polygon.filter((_, index) => index % 2 === 0);
      const ys = source.polygon.filter((_, index) => index % 2 === 1);
      const bounds = new Rectangle(Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
      const seed = new Container();
      const highlights = new Sprite(normal);
      const mask = new Graphics().poly(source.polygon).fill(0xffffff);
      highlights.filters = [hardwareSeed, hardwareFill, hardwareAlpha];
      seed.addChild(highlights, mask);
      highlights.mask = mask;
      seed.addChild(new Graphics().poly(source.solid).fill(0xffffff));
      const silhouette = bake(seed, bounds);
      const cutout = new Container();
      const sprite = new Sprite(normal);
      const matte = new Sprite(silhouette);
      matte.position.set(bounds.x, bounds.y);
      cutout.addChild(sprite, matte);
      sprite.setMask({ mask: matte, channel: "alpha" });
      const texture = bake(cutout, bounds);
      const mount = new Container();
      const painted = new Sprite(texture);
      painted.position.set(bounds.x, bounds.y);
      mount.addChild(painted);
      mount.pivot.set(source.pivot.x, source.pivot.y);
      stage.addChild(mount);
      return mount;
    });

    const lightAlpha = new ColorMatrixFilter();
    lightAlpha.matrix = [1,0,0,0,0, 0,1,0,0,0, 0,0,1,0,0, 0,0,1.19047619,0,-0.19047619];
    filters.push(lightAlpha);
    const coreCutout = new Container();
    const coreSource = new Sprite(finalReference);
    const coreClip = new Graphics().poly(coreMask).fill(0xffffff);
    coreSource.filters = [lightAlpha];
    coreCutout.addChild(coreSource, coreClip);
    coreSource.mask = coreClip;
    const coreTexture = bake(coreCutout, new Rectangle(coreBounds.x, coreBounds.y, coreBounds.width, coreBounds.height));
    const entity = new Container();
    const core = new Sprite(coreTexture);
    core.anchor.set((coreNucleus.x - coreBounds.x) / coreBounds.width, (coreNucleus.y - coreBounds.y) / coreBounds.height);
    core.blendMode = "add";
    const blur = new BlurFilter({ strength: 3, quality: 2 });
    filters.push(blur);
    const glowSource = new Sprite(coreTexture);
    glowSource.tint = 0x54a5ff;
    glowSource.filters = [blur];
    const margin = 12;
    const glowTexture = bake(glowSource, new Rectangle(-margin, -margin, coreBounds.width + margin * 2, coreBounds.height + margin * 2));
    const glow = new Sprite(glowTexture);
    glow.anchor.set((coreNucleus.x - coreBounds.x + margin) / glowTexture.width, (coreNucleus.y - coreBounds.y + margin) / glowTexture.height);
    glow.blendMode = "add";
    glow.alpha = 0.7;
    entity.addChild(glow, core);
    stage.addChild(entity);

    const hardware = new Container({ sortableChildren: true });
    const panels = sourcePanels.map(source => {
      const group = new Container();
      const positions = new Float32Array(source.points.flatMap(point => [point.x, point.y]));
      const uvs = new Float32Array(source.points.flatMap(point => [point.x / WORLD, point.y / WORLD]));
      const geometry = new MeshGeometry({ positions, uvs, indices: new Uint32Array([0, 1, 2]) });
      geometries.push(geometry);
      const backGeometry = new MeshGeometry({ positions: positions.slice(), uvs: uvs.slice(), indices: new Uint32Array([0, 1, 2]) });
      geometries.push(backGeometry);
      const back = new Mesh({ texture: normal, geometry: backGeometry });
      back.tint = 0x586774;
      group.addChild(back);
      const center = { x: source.points.reduce((sum, point) => sum + point.x, 0) / 3, y: source.points.reduce((sum, point) => sum + point.y, 0) / 3 };
      const sides = [0, 1, 2].map(edge => {
        const a = source.points[edge];
        const b = source.points[(edge + 1) % 3];
        const inset = (point: { x: number; y: number }) => {
          const d = Math.hypot(center.x - point.x, center.y - point.y);
          return { x: point.x + (center.x - point.x) * 5 / d, y: point.y + (center.y - point.y) * 5 / d };
        };
        const sideGeometry = new MeshGeometry({ positions: new Float32Array(8), uvs: new Float32Array([a, b, inset(b), inset(a)].flatMap(point => [point.x / WORLD, point.y / WORLD])), indices: new Uint32Array([0,1,2,0,2,3]) });
        geometries.push(sideGeometry);
        const side = new Mesh({ texture: normal, geometry: sideGeometry });
        side.tint = 0x788b9a;
        group.addChild(side);
        return sideGeometry;
      });
      const mesh = new Mesh({ texture: normal, geometry });
      group.addChild(mesh);
      hardware.addChild(group);
      return { group, geometry, backGeometry, sides };
    });
    stage.addChild(hardware);

    const glintSource = new Sprite(normal);
    glintSource.filters = [lightAlpha];
    const glint = new Sprite(bake(glintSource, new Rectangle(198, 354, 330, 40)));
    glint.anchor.set(0.5);
    glint.position.set(363, 374);
    glint.blendMode = "add";
    stage.addChild(glint);
    const atmosphere = new Container();
    const particles = Array.from({ length: 32 }, (_, index) => {
      const point = new Sprite(Texture.WHITE);
      point.tint = index % 7 === 0 ? 0xc1e7ff : 0xe4aa50;
      point.width = 1;
      point.height = index % 5 === 0 ? 2 : 1;
      atmosphere.addChild(point);
      return point;
    });
    stage.addChild(atmosphere);
    const cels = buildCels();
    let shownCel = -1;
    const updateGeometry = (geometry: MeshGeometry, points: readonly { x: number; y: number }[]) => {
      points.forEach((point, index) => { geometry.positions[index * 2] = point.x; geometry.positions[index * 2 + 1] = point.y; });
      geometry.getAttribute("aPosition").buffer.update();
    };
    return {
      render(release: number, time: number, effects: boolean) {
        const cel = selectCel(cels, release);
        if (cel.index !== shownCel) {
          panels.forEach((panel, index) => {
            const pose = cel.panels[index];
            updateGeometry(panel.geometry, pose.screen);
            updateGeometry(panel.backGeometry, pose.back);
            panel.sides.forEach((side, edge) => {
              const next = (edge + 1) % 3;
              updateGeometry(side, [pose.screen[edge], pose.screen[next], pose.back[next], pose.back[edge]]);
            });
            panel.group.zIndex = -pose.world.reduce((sum, point) => sum + point.z, 0) / 3;
          });
          arms.forEach((arm, index) => {
            const source = sourceArms[index];
            const pose = cel.arms[index];
            arm.position.set(source.pivot.x + pose.side * pose.retreat, source.pivot.y);
            arm.rotation = pose.rotation;
          });
          shownCel = cel.index;
        }
        const bob = effects ? Math.sin(time * 0.85) * 2.5 * (1 - Math.min(1, Math.max(0, release - 1))) : 0;
        hardware.y = bob;
        entity.position.set(cel.core.x, cel.core.y + (effects ? Math.sin(time * 0.85) * 3.5 : 0));
        entity.scale.set(cel.core.scale);
        entity.alpha = cel.core.alpha * (effects ? 0.90 + Math.sin(time * 1.1) ** 2 * 0.10 : 1);
        glint.y = 374 + bob;
        glint.alpha = cel.glint * (effects ? 0.80 + Math.sin(time * 1.3) ** 2 * 0.20 : 1);
        atmosphere.visible = effects;
        particles.forEach((point, index) => {
          point.position.set(30 + index * 137 % 665, ((index * 113 - time * (4 + index % 5)) % 650 + 650) % 650 + 30);
          point.alpha = 0.08 + Math.sin(time * 0.65 + index) ** 2 * 0.3;
        });
        return cel.index;
      },
      destroy,
    };
  } catch (error) { destroy(); throw error; }
}
