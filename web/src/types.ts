export type FixtureCase = "baseline" | "manual-only" | "fixed-only";
export interface Favorite {
  favoriteId: string;
  name: string | null;
  case: FixtureCase;
  configurationDigest: string;
  sourceCount: number;
}
export interface Checkpoint {
  checkpointId: string;
  case: FixtureCase;
  configurationDigest: string;
  capturedPreparation: number;
}
export interface Plan {
  planId: string;
  case: FixtureCase;
  target: { type: string; id: string };
  changedSources: string[];
}
export interface Application {
  applicationId: string;
  checkpointId: string;
  case: FixtureCase;
  taskBoundary: string;
}
export interface Observation {
  fixtureMarkerCheck:
    | "matched-record"
    | "not-matched-record"
    | "unqualified-record";
  observationId: string;
}
export interface State {
  scopeId: string;
  controlScope: "owned-fixture-only";
  project: string;
  fixture: string;
  store: string;
  current: {
    case: FixtureCase;
    revision: number;
    configurationDigest: string;
  } | null;
  conflict: string | null;
  application: Application | null;
  applicationCurrent: boolean;
  observation: Observation | null;
  runtimeStateVerified: false;
  modeSwitchingVerified: false;
}
export interface FavoritePage {
  favorites: Favorite[];
  nextCursor: string | null;
}
export interface CheckpointPage {
  checkpoints: Checkpoint[];
  nextCursor: string | null;
}
export interface Envelope<T> {
  result: T;
  state: State;
}
export const conditions: Record<
  FixtureCase,
  {
    title: string;
    label: string;
    description: string;
    skill: string;
    procedure: string;
  }
> = {
  baseline: {
    title: "Normal",
    label: "通常の確認条件",
    description: "検証用の指示とSkillを備えた状態。",
    skill: "自動選択の対象",
    procedure: "維持",
  },
  "manual-only": {
    title: "Manual only",
    label: "Skillを手動のみ",
    description: "指示を保ち、検証用Skillを手動選択に。",
    skill: "手動のみ",
    procedure: "維持",
  },
  "fixed-only": {
    title: "Fixed only",
    label: "固定指示のみ",
    description: "検証環境の固定指示だけを読み込む条件。",
    skill: "手動のみ",
    procedure: "固定指示で置換",
  },
};
export const caseOrder: FixtureCase[] = [
  "baseline",
  "manual-only",
  "fixed-only",
];
export const shortId = (id: string) => id.slice(0, 10);
