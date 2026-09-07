import { Container, MeshPlane, Rectangle, Sprite, Texture } from "pixi.js";
import recipe from "../assets/hangar-v3.json";
import { referenceField, referenceLayers, updateReferencePositions } from "./scene-reference";

/** The approved paintings are the actual textures, including armor and cables. */
export function createHangarRig(stage: Container, textures: readonly Texture[]) {
  const planes = textures.map(texture => {
    const plane = new MeshPlane({ texture, verticesX: 49, verticesY: 49 });
    plane.autoResize = false;
    stage.addChild(plane);
    return plane;
  });
  const geometries = planes.map(plane => plane.geometry);
  const buffers = geometries.map(geometry => geometry.getAttribute("aPosition").buffer);
  const fields = Array.from({ length: buffers[0].data.length / 2 }, (_, index) =>
    referenceField(buffers[0].data[index * 2], buffers[0].data[index * 2 + 1]));

  // Light is sampled from the source art, keeping its fine branching silhouette.
  const lightTextures = textures.map((texture, index) => {
    const [x, y, width, height] = recipe.frames[index].light;
    return new Texture({
      source: texture.source,
      frame: new Rectangle(texture.frame.x + x, texture.frame.y + y, width, height),
    });
  });
  const lightFields = recipe.frames.map(({ light: [x, y, width, height] }) =>
    [referenceField(x + width / 2, y + height / 2)]);
  const lightPosition = new Float32Array(2);
  const lights = lightTextures.map(texture => {
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    sprite.blendMode = "add";
    stage.addChild(sprite);
    return sprite;
  });
  const atmosphere = new Container();
  stage.addChild(atmosphere);
  const dust = Array.from({ length: 36 }, (_, index) => {
    const point = new Sprite(Texture.WHITE);
    point.tint = index % 7 === 0 ? 0xc9eaff : 0xd99436;
    point.width = index % 7 === 0 ? 2 : 1;
    point.height = index % 3 === 0 ? 2 : 1;
    atmosphere.addChild(point);
    return point;
  });

  return {
    render(release: number, time: number, effects: boolean) {
      const layers = referenceLayers(release);
      planes.forEach(plane => { plane.visible = false; });
      lights.forEach(light => { light.visible = false; });
      layers.forEach(({ frame, alpha }, index) => {
        const plane = planes[frame];
        plane.visible = true;
        plane.alpha = alpha;
        updateReferencePositions(fields, buffers[frame].data as Float32Array, frame, release, time, effects);
        buffers[frame].update();

        const contribution = index === 0 ? 1 - (layers[1]?.alpha ?? 0) : alpha;
        const light = lights[frame];
        light.visible = effects;
        light.alpha = contribution * (0.018 + Math.sin(time * 1.3) ** 2 * 0.065);
        updateReferencePositions(lightFields[frame], lightPosition, frame, release, time, effects);
        light.position.set(lightPosition[0], lightPosition[1]);
        light.scale.set(1 + (effects ? Math.sin(time * 1.25) * 0.004 : 0));
      });
      atmosphere.visible = effects;
      dust.forEach((point, index) => {
        const speed = 4 + index % 5 * 2;
        const y = ((index * 113 - time * speed) % 650 + 650) % 650;
        point.position.set(30 + index * 137 % 665 + Math.sin(time * 0.2 + index) * 3, y + 30);
        point.alpha = 0.08 + Math.sin(time * 0.65 + index) ** 2 * 0.34;
      });
    },
    destroy() {
      geometries.forEach(geometry => geometry.destroy(true));
      lightTextures.forEach(texture => texture.destroy(false));
    },
  };
}
