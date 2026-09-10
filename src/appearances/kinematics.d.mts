export interface Point2 { x: number; y: number }
export interface Point3 extends Point2 { z: number }
export interface SourcePanel {
  id: string; side: -1 | 1; upper: boolean; points: readonly [Point2, Point2, Point2];
}
export interface Cel {
  index: number; release: number;
  panels: { id: string; angle: number; world: Point3[]; screen: Point2[]; backWorld: Point3[]; back: Point2[] }[];
  arms: { side: number; group: string; rotation: number; retreat: number }[];
  core: { x: number; y: number; alpha: number; scale: number };
  glint: number; lock: number;
}
export const CELS_PER_STAGE: 24;
export const sourcePanels: readonly SourcePanel[];
export function buildCels(): Cel[];
export function selectCel(cels: readonly Cel[], release: number): Cel;
