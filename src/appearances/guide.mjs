import { getAppearanceTemplate } from './template.mjs';
import { fail } from '../sources/errors.mjs';

export function appearanceGuideSvg(role = 'all') {
  if (!['all', 'entity', 'restraints', 'background'].includes(role)) fail('appearance-template-invalid');
  const template = getAppearanceTemplate(), { width, height } = template.canvas;
  const points = values => values.map(point => typeof point === 'number' ? point : `${point.x},${point.y}`).join(' ');
  const shapes = [];
  if (role === 'all' || role === 'entity') {
    const b = template.entityBounds, a = template.entityAnchor;
    shapes.push(`<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" fill="#74cbe8" fill-opacity=".1" stroke="#74cbe8" stroke-dasharray="6 5"/>`,
      `<polygon points="${points(template.entityGuide)}" fill="none" stroke="#74cbe8" stroke-width="2"/>`,
      `<circle cx="${a.x}" cy="${a.y}" r="5" fill="#fff"/><path d="M${a.x-12} ${a.y}h24 M${a.x} ${a.y-12}v24" stroke="#fff"/>`,
      `<text x="362" y="30" text-anchor="middle" fill="#a1e3f7">ENTITY · anchor ${a.x}, ${a.y}</text>`);
  }
  if (role === 'all' || role === 'restraints') for (const part of template.parts.filter(part => part.role === 'restraints')) {
    if (part.kind === 'arm') {
      shapes.push(`<polygon points="${points(part.mask)}" fill="#e6b45b" fill-opacity=".15" stroke="#e6b45b" stroke-width="2"/>`,
        `<circle cx="${part.pivot.x}" cy="${part.pivot.y}" r="5" fill="#e6b45b"/>`,
        `<text x="${part.side < 0 ? 12 : 712}" y="${part.pivot.y + 20}" text-anchor="${part.side < 0 ? 'start' : 'end'}" fill="#e6b45b">${part.id}</text>`);
    } else if (part.kind === 'panel') {
      const x = part.points.reduce((sum, point) => sum + point.x, 0) / 3, y = part.points.reduce((sum, point) => sum + point.y, 0) / 3;
      shapes.push(`<polygon points="${points(part.points)}" fill="#ff826c" fill-opacity=".15" stroke="#ff826c" stroke-width="3"/>`,
        `<text x="${x}" y="${y}" text-anchor="middle" fill="#ffd0c7">${part.id}</text>`);
    } else {
      const b = part.bounds; shapes.push(`<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" fill="none" stroke="#f1efd9" stroke-dasharray="3 3"/>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><pattern id="grid" width="36.2" height="36.2" patternUnits="userSpaceOnUse"><path d="M36.2 0H0V36.2" fill="none" stroke="#203943" stroke-width="1"/></pattern></defs><rect width="724" height="724" fill="#0a1820"/><rect width="724" height="724" fill="url(#grid)"/><g font-family="sans-serif" font-size="11">${shapes.join('')}<text x="16" y="690" fill="#f2f4ef">HANGAR LAYERED v1 · ${role.toUpperCase()} · 724 × 724</text><text x="16" y="710" fill="#acc1ca">PNG layers share this canvas. Guides are not artwork.</text></g></svg>`;
}
