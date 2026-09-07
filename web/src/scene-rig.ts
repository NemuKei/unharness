import { Container, Graphics, Rectangle, Sprite, Texture } from "pixi.js";
import { releasePose } from "./scene-motion";
import recipe from "../assets/hangar-v2.json";

export interface RigTextures {
  background: Texture;
  capsule: Texture;
  core: Texture;
}

export function createHangarRig(stage: Container, textures: RigTextures) {
  const background = new Sprite(textures.background);
  background.width = background.height = 724;
  stage.addChild(background);

  const shadow = new Graphics().ellipse(0, 0, 100, 16).fill(0x020609);
  shadow.position.set(362, 643);
  stage.addChild(shadow);
  const tethers = new Graphics();
  stage.addChild(tethers);

  const halo = new Container();
  const rings = [110, 138, 164].map((radius, index) => {
    const ring = new Graphics();
    for (let segment = 0; segment < 36; segment++) {
      if (segment % 6 === 5) continue;
      const start = (segment / 36) * Math.PI * 2;
      const end = ((segment + 0.72) / 36) * Math.PI * 2;
      ring
        .moveTo(Math.cos(start) * radius, Math.sin(start) * radius * 0.36)
        .lineTo(Math.cos(end) * radius, Math.sin(end) * radius * 0.36);
    }
    ring.stroke({ color: index === 1 ? 0xffffff : 0x99d6ff, width: 2 });
    ring.blendMode = "add";
    halo.addChild(ring);
    return ring;
  });
  const orbitLights = Array.from({ length: 6 }, (_, index) => {
    const point = new Sprite(Texture.WHITE);
    point.tint = index % 2 ? 0xffffff : 0x80c9ff;
    point.width = point.height = index % 2 ? 3 : 4;
    point.anchor.set(0.5);
    halo.addChild(point);
    return point;
  });
  stage.addChild(halo);

  const body = new Container();
  stage.addChild(body);
  const core = new Sprite(textures.core);
  core.anchor.set(0.5, 0.538);
  core.blendMode = "add";
  body.addChild(core);

  // One closed sprite supplies both complementary halves, keeping its seam exact.
  const frame = textures.capsule.frame;
  const split = Math.floor(frame.width / 2);
  const leftFrame = new Texture({
    source: textures.capsule.source,
    frame: new Rectangle(frame.x, frame.y, split, frame.height),
  });
  const rightFrame = new Texture({
    source: textures.capsule.source,
    frame: new Rectangle(frame.x + split, frame.y, frame.width - split, frame.height),
  });
  const left = new Container();
  const right = new Container();
  const leftSprite = new Sprite(leftFrame);
  const rightSprite = new Sprite(rightFrame);
  leftSprite.anchor.set(1, 0.5);
  rightSprite.anchor.set(0, 0.5);
  // The source PNG stays unchanged. Geometry masks exclude its background and
  // move with each armor half, preserving interior highlights and the seam.
  const leftMask = new Graphics().poly(recipe.assets.capsule.leftMask).fill(0xffffff);
  const rightMask = new Graphics().poly(recipe.assets.capsule.rightMask).fill(0xffffff);
  left.addChild(leftSprite, leftMask);
  right.addChild(rightSprite, rightMask);
  leftSprite.mask = leftMask;
  rightSprite.mask = rightMask;
  body.addChild(left, right);
  const glint = new Graphics()
    .rect(-35, -1, 70, 2).fill({ color: 0xb8dfff, alpha: 0.6 })
    .rect(-2, -5, 4, 10).fill(0xffffff);
  glint.blendMode = "add";
  body.addChild(glint);

  const atmosphere = new Container();
  stage.addChild(atmosphere);
  const dust = Array.from({ length: 48 }, (_, index) => {
    const point = new Sprite(Texture.WHITE);
    point.tint = index % 5 === 0 ? 0xc2e8ff : 0xe7a64b;
    point.width = index % 7 === 0 ? 3 : 1.5;
    point.height = index % 3 === 0 ? 3 : 1.5;
    atmosphere.addChild(point);
    return point;
  });
  const charges = Array.from({ length: 6 }, () => {
    const point = new Sprite(Texture.WHITE);
    point.tint = 0xffd187;
    point.width = 7;
    point.height = 2;
    point.blendMode = "add";
    stage.addChild(point);
    return point;
  });

  const capsuleScale = 420 / frame.height;
  const coreScale = 350 / textures.core.height;
  return {
    render(release: number, time: number, effects: boolean) {
      const pose = releasePose(release);
      const bob = effects ? Math.sin(time * 0.85) * 8 : 0;
      const sway = effects ? Math.sin(time * 0.53) * 3 : 0;
      body.position.set(362 + Math.round(sway), 375 + Math.round(bob));
      core.position.set(0, pose.coreY + (effects ? Math.sin(time * 1.3) * 3 * pose.open : 0));
      core.scale.set(coreScale * pose.coreScale * (effects ? 1 + Math.sin(time * 1.1) * 0.012 : 1));
      core.alpha = pose.coreOpacity * (effects ? 0.85 + Math.sin(time * 1.5) ** 2 * 0.15 : 1);
      left.position.set(-Math.round(pose.shellX), Math.round(pose.shellY));
      right.position.set(Math.round(pose.shellX), Math.round(pose.shellY));
      left.rotation = -pose.shellRotation;
      right.rotation = pose.shellRotation;
      left.scale.set(capsuleScale * pose.shellScale);
      right.scale.set(capsuleScale * pose.shellScale);
      glint.alpha = (1 - pose.open) * (effects ? 0.35 + Math.sin(time * 1.6) ** 2 * 0.6 : 0.3);
      shadow.scale.x = 1 - pose.rise * 0.12 - bob * 0.004;
      shadow.alpha = 0.6 - pose.rise * 0.25;

      halo.position.set(body.x, body.y + pose.coreY);
      halo.alpha = pose.haloOpacity;
      halo.visible = effects && pose.open > 0.001;
      halo.scale.set(0.65 + pose.rise * 0.4);
      rings.forEach((ring, index) => {
        ring.rotation = (index * Math.PI) / 3 + time * (index % 2 ? -0.19 : 0.14);
        ring.alpha = 0.35 + index * 0.12;
      });
      orbitLights.forEach((point, index) => {
        const angle = time * (index % 2 ? -0.3 : 0.24) + index * Math.PI / 3;
        point.position.set(Math.cos(angle) * 145, Math.sin(angle) * 70);
      });

      // The links retract as the entity leaves its equipment. Moving charge marks
      // make even the closed state feel powered without moving the background.
      tethers.clear();
      const tetherAlpha = 1 - pose.rise;
      for (const side of [-1, 1]) {
        const startX = 362 + side * 270;
        const endX = body.x + side * (132 + pose.shellX);
        const endY = body.y + pose.shellY;
        const midX = (startX + endX) / 2;
        tethers.moveTo(startX, 385).lineTo(midX, 385).lineTo(endX, endY)
          .stroke({ color: 0x34434b, width: 7, alpha: tetherAlpha });
        tethers.moveTo(startX, 383).lineTo(midX, 383).lineTo(endX, endY - 2)
          .stroke({ color: 0xb37a32, width: 1.5, alpha: tetherAlpha * 0.8 });
      }
      charges.forEach((point, index) => {
        const side = index < 3 ? -1 : 1;
        const startX = 362 + side * 270;
        const endX = body.x + side * (132 + pose.shellX);
        const fraction = (time * 0.33 + (index % 3) / 3) % 1;
        point.position.set(startX + (endX - startX) * fraction,
          384 + (body.y + pose.shellY - 385) * Math.max(0, fraction * 2 - 1));
        point.visible = effects && tetherAlpha > 0.01;
        point.alpha = tetherAlpha * Math.sin(fraction * Math.PI);
      });
      atmosphere.visible = effects;
      dust.forEach((point, index) => {
        const speed = 8 + (index % 6) * 3;
        const y = ((index * 113 - time * speed) % 650 + 650) % 650;
        point.position.set(30 + (index * 137) % 665 + Math.sin(time * 0.2 + index) * 6, y + 35);
        point.alpha = 0.16 + Math.sin(time * 0.7 + index) ** 2 * 0.5;
      });
    },
    destroy() {
      leftFrame.destroy(false);
      rightFrame.destroy(false);
    },
  };
}
