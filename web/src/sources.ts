import type { FixtureCase } from "./types";
export type SourceMode = "normal" | "unseal" | "trueform";
export const sourceModes: SourceMode[] = ["normal", "unseal", "trueform"];
export const modePresentation: Record<
  SourceMode,
  { title: string; label: string; description: string; scene: FixtureCase }
> = {
  normal: {
    title: "Normal",
    label: "通常装備",
    description: "保存した追加指示とSkillを使う。",
    scene: "baseline",
  },
  unseal: {
    title: "UNSEAL",
    label: "限定解除",
    description: "選んだ追加指示を最小ガイドへ。Skillは手動で呼び出す。",
    scene: "manual-only",
  },
  trueform: {
    title: "TRUEFORM",
    label: "零式",
    description: "選んだ追加指示とSkillを外す。",
    scene: "fixed-only",
  },
};
export type SourceMetadata = {
  kind: "user-sources";
  launchId: string;
  contextId: string;
  context: { codexHome: string; project: string; executable: string };
  workspace: string | null;
};
export type SourceRow = {
  id: string;
  label: string;
  path: string;
  eligible?: boolean;
  reason?: string | null;
  effective?: string | null;
  enabled?: boolean;
  availability: Record<SourceMode, boolean>;
};
export type SourceVerification = {
  runtimeStateVerified: false;
  modeSwitchingVerified: false;
  sourceCoverage: "unknown";
  nextTaskRequired: true;
};
export type SourceState = {
  context: SourceMetadata["context"];
  registration: { scopeId: string; normalId: string; sources: SourceRow[] };
  preparedMode: SourceMode;
  revision: number;
  conflict: null | { kind: string };
  recovery: {
    pending: boolean;
    lastCheckpointId: string | null;
    argv: string[];
  };
  verification: SourceVerification;
};
export type Guide = {
  id: string;
  text: string;
  digest: string;
  reviewedOn: string;
  references: string[];
};
export type SourceView = {
  metadata: SourceMetadata;
  source: SourceState | null;
  guide: Guide;
};
export type Discovery = {
  discoveryId: string;
  instructions: SourceRow;
  skills: SourceRow[];
  registrationAvailable: boolean;
  unavailableSources: { id: string; reason: string }[];
  retained: string[];
  limitations: string[];
};
export type SourcePlan = {
  planId: string;
  scopeId: string;
  mode: SourceMode | "favorite" | "checkpoint";
  preparedMode: SourceMode;
  revision: number;
  selectedIds: string[];
  changedFiles: { id: string; label: string }[];
  skillStates: { id: string; enabled: boolean; manualOnly: boolean }[];
  guide: Omit<Guide, "text"> | null;
  retained: string[];
  verification: SourceVerification;
};
export type SourceFavorite = {
  favoriteId: string;
  name: string;
  preparedMode: SourceMode;
  revision: number;
};
export type SourceFavoritePage = {
  favorites: SourceFavorite[];
  nextCursor: string | null;
};
