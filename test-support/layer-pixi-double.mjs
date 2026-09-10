// Structural/lifetime verification only: this does not render pixels or decode PNG.
import { createHash } from 'node:crypto';
export const owned = { apps: [], sources: [], textures: [] };
class Point { constructor(x = 0, y = x) { this.set(x, y); } set(x, y = x) { this.x = x; this.y = y; } }
export class Container {
  constructor(options = {}) { Object.assign(this, { children: [], position: new Point(), pivot: new Point(), scale: new Point(1),
    visible: true, alpha: 1, rotation: 0, filters: [], zIndex: 0, destroyed: false }, options); }
  get x() { return this.position.x; } set x(v) { this.position.x = v; }
  get y() { return this.position.y; } set y(v) { this.position.y = v; }
  addChild(...nodes) { nodes.forEach(n => { n.parent = this; this.children.push(n); }); return nodes[0]; }
  destroy(options) { if (this.destroyed) throw Error('double container destroy'); this.destroyed = true;
    if (options?.children) this.children.forEach(c => c.destroy(options)); }
}
export class Rectangle { constructor(x, y, width, height) { Object.assign(this, { x, y, width, height }); } }
export class ImageSource {
  constructor(options) { Object.assign(this, options); this.width = options.resource.width; this.height = options.resource.height;
    this.destroyCount = 0; owned.sources.push(this); }
  destroy() { if (++this.destroyCount !== 1) throw Error('double source destroy'); }
}
export class Texture {
  constructor({ source, frame } = {}) { this.source = source; this.frame = frame ?? new Rectangle(0, 0, source.width, source.height);
    this.width = this.frame.width; this.height = this.frame.height; this.destroyCount = 0; owned.textures.push(this); }
  static from(resource) { return new Texture({ source: new ImageSource({ resource }) }); }
  destroy(source = false) { if (++this.destroyCount !== 1) throw Error('double texture destroy'); if (source) this.source.destroy(); }
}
Texture.EMPTY = Texture.from({ width: 1, height: 1, label: 'empty' }); Texture.WHITE = Texture.from({ width: 1, height: 1, label: 'white' });
export class Sprite extends Container {
  constructor(texture) { super(); this.texture = texture; this.anchor = new Point(); this.blendMode = 'normal'; }
  get width() { return this.texture.width * this.scale.x; } set width(v) { this.scale.x = v / this.texture.width; }
  get height() { return this.texture.height * this.scale.y; } set height(v) { this.scale.y = v / this.texture.height; }
  setMask({ mask }) { this.mask = mask; }
}
export class Graphics extends Container {
  constructor() { super(); this.commands = []; }
  poly(p) { this.commands.push(['poly', [...p]]); return this; }
  rect(...p) { this.commands.push(['rect', ...p]); return this; }
  fill(v) { this.commands.push(['fill', v]); return this; }
  stroke(v) { this.commands.push(['stroke', v]); return this; }
  clear() { this.commands = []; return this; }
}
export class MeshGeometry {
  constructor(options) { Object.assign(this, options); this.destroyed = false; }
  getAttribute() { return { buffer: { update() {} } }; }
  destroy() { if (this.destroyed) throw Error('double geometry destroy'); this.destroyed = true; }
}
export class Mesh extends Container { constructor(options) { super(); Object.assign(this, options); } }
export class ColorMatrixFilter { brightness() {} destroy() {} }
export class BlurFilter { destroy() {} }
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function graph(node) {
  const texture = node.texture;
  return { kind: node.constructor.name, position: node.position, pivot: node.pivot, scale: node.scale, alpha: node.alpha,
    rotation: node.rotation, blend: node.blendMode, filters: node.filters.length, anchor: node.anchor,
    texture: texture && { label: texture.source.resource.label ?? texture.source.resource.assetId, frame: texture.frame },
    commands: node.commands, positions: node.geometry && Array.from(node.geometry.positions),
    children: node.children.filter(c => c.visible).map(graph) };
}
export class Application {
  constructor() {
    this.stage = new Container(); this.canvas = { parentElement: null, setAttribute() {} };
    this.ticker = { started: false, add: fn => { this.step = fn; } };
    this.renderer = { generateTexture: ({ target, frame }) => Texture.from({ width: frame.width, height: frame.height, label: hash(graph(target)) }),
      extract: { base64: async ({ target }) => JSON.stringify(graph(target)) } };
    owned.apps.push(this);
  }
  async init() {}
  render() { if (this.failRender) { this.failRender = false; throw Error('synthetic upload failure'); } }
  start() { this.ticker.started = true; }
  stop() { this.ticker.started = false; }
  destroy(_, options) { this.stage.destroy(options); this.canvas.parentElement = null; this.stop(); }
}
