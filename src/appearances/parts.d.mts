export interface Point2 { x: number; y: number }
export const WORLD: 724;
export const sourceArms: readonly {
  id: string; group: "upper" | "middle" | "lower"; side: number;
  pivot: Point2; polygon: number[]; solid: number[];
}[];
export const capsuleMask: number[];
export const coreBounds: { x: number; y: number; width: number; height: number };
export const coreNucleus: Point2;
export const coreMask: number[];
