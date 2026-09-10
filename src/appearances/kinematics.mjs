export const CELS_PER_STAGE = 24;
export const sourcePanels                         = [
  { id: "upper-left", side: -1, upper: true,
    points: [{ x: 355, y: 169 }, { x: 193, y: 356 }, { x: 355, y: 356 }] },
  { id: "upper-right", side: 1, upper: true,
    points: [{ x: 366, y: 169 }, { x: 529, y: 356 }, { x: 366, y: 356 }] },
  { id: "lower-left", side: -1, upper: false,
    points: [{ x: 193, y: 394 }, { x: 355, y: 566 }, { x: 355, y: 394 }] },
  { id: "lower-right", side: 1, upper: false,
    points: [{ x: 531, y: 394 }, { x: 366, y: 566 }, { x: 366, y: 394 }] },
];

const clamp = (value        ) => Math.max(0, Math.min(1, value));
const ease = (value        ) => { const t = clamp(value); return t * t * (3 - 2 * t); };
const phase = (value        , from        , to        ) => ease((value - from) / (to - from));
const mix = (a        , b        , t        ) => a + (b - a) * t;
const radians = (degrees        ) => degrees * Math.PI / 180;
const lens = 900;

/** Fold around the physical outer seam; edge lengths remain unchanged in 3D. */
function fold(point        , a        , b        , angle        )         {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const ux = (b.x - a.x) / length;
  const uy = (b.y - a.y) / length;
  const x = point.x - a.x;
  const y = point.y - a.y;
  const parallel = ux * x + uy * y;
  const cosine = Math.cos(angle);
  return {
    x: a.x + x * cosine + ux * parallel * (1 - cosine),
    y: a.y + y * cosine + uy * parallel * (1 - cosine),
    z: (ux * y - uy * x) * Math.sin(angle),
  };
}

function panelAt(panel             , release        ) {
  const [a, b, c] = panel.points;
  const opening = phase(release, panel.upper ? 0.20 : 0.32, panel.upper ? 0.78 : 0.92);
  const unlock = phase(release, 0, 0.16);
  const fall = phase(release, panel.upper ? 1.14 : 1.28, panel.upper ? 1.79 : 1.92);
  const area = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const angle = radians(74 * opening) * Math.sign(area);
  const pivot = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const openX = pivot.x + panel.side * (2 * unlock + 8 * opening);
  const openY = pivot.y + (panel.upper ? -1 : 1) * (unlock + 55 * opening);
  const finalX = panel.upper ? 362 + panel.side * 120 : 362 + panel.side * 67;
  const finalY = panel.upper ? 488 : 606;
  const mountX = mix(openX, finalX, fall);
  const mountY = mix(openY, finalY, fall);
  const depth = (panel.upper ? 80 : 420) * fall;
  const rotation = radians(panel.side * (panel.upper ? 80 : 12)) * fall;
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  const world = panel.points.map(point => {
    const folded = fold(point, a, b, angle);
    const x = folded.x - pivot.x;
    const y = folded.y - pivot.y;
    return {
      x: (mountX - 362) * (1 + depth / lens) + x * cosine - y * sine,
      y: (mountY - 375) * (1 + depth / lens) + x * sine + y * cosine,
      z: depth + folded.z,
    };
  });
  const project = (point        ) => ({
    x: 362 + point.x * lens / (lens + point.z),
    y: 375 + point.y * lens / (lens + point.z),
  });
  const ab = { x: world[1].x - world[0].x, y: world[1].y - world[0].y, z: world[1].z - world[0].z };
  const ac = { x: world[2].x - world[0].x, y: world[2].y - world[0].y, z: world[2].z - world[0].z };
  const normal = { x: ab.y * ac.z - ab.z * ac.y, y: ab.z * ac.x - ab.x * ac.z, z: ab.x * ac.y - ab.y * ac.x };
  const thickness = 16 * Math.sign(area) / Math.hypot(normal.x, normal.y, normal.z);
  const backWorld = world.map(point => ({ x: point.x + normal.x * thickness, y: point.y + normal.y * thickness, z: point.z + normal.z * thickness }));
  return { id: panel.id, angle: Math.abs(angle), world, screen: world.map(project), backWorld, back: backWorld.map(project) };
}

function celAt(index        ) {
  const release = index / CELS_PER_STAGE;
  const opening = phase(release, 0.2, 0.92);
  const rise = phase(release, 1.38, 1.96);
  const retreat = phase(release, 1.04, 1.57) * 215;
  return {
    index,
    release,
    panels: sourcePanels.map(panel => panelAt(panel, release)),
    arms: [-1, 1].flatMap(side => [
      { side, group: "upper", rotation: side * radians(9) * opening, retreat },
      { side, group: "middle", rotation: -side * radians(12) * opening, retreat },
      { side, group: "lower", rotation: -side * radians(23) * opening, retreat },
    ]),
    core: { x: 362, y: 375 - 60 * rise, alpha: phase(release, 0.29, 0.78), scale: mix(0.57, 1, opening) },
    glint: 1 - phase(release, 0.22, 0.68),
    lock: phase(release, 0, 0.16),
  };
}

/** A deterministic sequence of actual poses, not blended full-scene paintings. */
export function buildCels() {
  return Array.from({ length: CELS_PER_STAGE * 2 + 1 }, (_, index) => celAt(index));
}
export function selectCel(cels                , release        ) {
  return cels[Math.max(0, Math.min(cels.length - 1, Math.round(release * CELS_PER_STAGE)))];
}
