type Query<T> =
  | { status: "ok"; summary: T }
  | { status: "error"; error: { kind: string } }
  | { status: "not-run" };

export interface InstructionCandidate {
  scope: "user" | "project";
  depth: number;
  name: "AGENTS.md" | "AGENTS.override.md";
  state: "present" | "empty" | "absent" | "link" | "not-file" | "too-large" | "changed" | "unreadable";
  bytes?: number;
  digest?: string;
}
export interface ConfigLayer {
  sourceType: string;
  disabled: boolean;
  presence: Record<string, boolean>;
}
export interface SourceInventoryReport {
  observedAt: string;
  instructions: {
    status: "ok" | "partial";
    boundary: string;
    coverage: "standard-candidates-only";
    loadedState: "unknown";
    classification: "not-reviewed";
    files: InstructionCandidate[];
  };
  probe: {
    codexCli: { status: string; version?: string };
    queries: {
      config: Query<{ layers: { status: "known"; total: number; items: ConfigLayer[] } | { status: "unknown" } }>;
      skills: Query<{ total: number; enabled: number; disabled: number; unknownEnabled: number; errors: number; pluginAssociated: number }>;
      hooks: Query<{ total: number; warnings: number; errors: number }>;
      requirements: Query<{ present: boolean | "unknown" }>;
    };
  };
}
export interface InventoryState {
  launchId: string;
  enabled: boolean;
  cwd: string | null;
  report: SourceInventoryReport | null;
}
export interface SourceRow {
  id: string;
  name: string;
  count: number | null;
  status: "read" | "partial" | "unknown";
  group: "review" | "keep";
  detail: string;
  limit: string;
}

export function sourceRows(report: SourceInventoryReport): SourceRow[] {
  const { instructions, probe } = report;
  const { skills, hooks, config, requirements } = probe.queries;
  const filesKnown = instructions.files.length > 0;
  const fileCount = instructions.files.filter(file => file.state === "present").length;
  const emptyCount = instructions.files.filter(file => file.state === "empty").length;
  const rows: SourceRow[] = [
    {
      id: "instructions", name: "指示ファイル", count: filesKnown ? fileCount : null,
      group: "review",
      status: !filesKnown ? "unknown" : instructions.status === "ok" ? "read" : "partial",
      detail: filesKnown ? `${fileCount}候補に内容あり${emptyCount ? `・空ファイル ${emptyCount}件` : ""}` : "候補を確認できていません",
      limit: "主にグローバルの追加指示を確認します。必須要件と任意の手順を分ける必要があります。",
    },
    {
      id: "skills", name: "Skill", count: skills.status === "ok" ? skills.summary.total : null,
      group: "review",
      status: skills.status !== "ok" ? "unknown" : skills.summary.errors || skills.summary.unknownEnabled ? "partial" : "read",
      detail: skills.status === "ok"
        ? `${skills.summary.total}件・有効 ${skills.summary.enabled}／無効 ${skills.summary.disabled}${skills.summary.unknownEnabled ? `／不明 ${skills.summary.unknownEnabled}` : ""}`
        : "一覧を取得できていません",
      limit: "解除候補は自作・自分で追加したSkillの自動選択です。標準提供のものとは分けて確認します。",
    },
    {
      id: "hooks", name: "hook", count: hooks.status === "ok" ? hooks.summary.total : null,
      group: "review",
      status: hooks.status !== "ok" ? "unknown" : hooks.summary.warnings || hooks.summary.errors ? "partial" : "read",
      detail: hooks.status === "ok" ? `${hooks.summary.total}件を検出${hooks.summary.warnings ? `・警告 ${hooks.summary.warnings}件` : ""}${hooks.summary.errors ? `・エラー ${hooks.summary.errors}件` : ""}` : "一覧を取得できていません",
      limit: "任意の補助処理だけが候補です。必須の検証や権限を守る処理は保持します。",
    },
  ];
  const layers = config.status === "ok" && config.summary.layers.status === "known" ? config.summary.layers.items : null;
  for (const [id, name, keys, limit] of [
    ["memories", "メモリ", ["memories"], "メモリと標準の作業継続機能の設定は維持します。利用状況は比較条件として扱います。"],
    ["connections", "プラグイン・MCP", ["plugins", "mcp_servers"], "連携設定自体は解除対象にしません。追加されたSkillはSkillの一覧で確認します。"],
  ] as const) {
    const present = layers?.filter(layer => !layer.disabled && keys.some(key => layer.presence[key])).length ?? null;
    const excluded = layers?.filter(layer => layer.disabled && keys.some(key => layer.presence[key])).length ?? 0;
    rows.push({
      id, name, group: "keep", count: present, status: present === null ? "unknown" : "read",
      detail: present === null ? "設定層を取得できていません"
        : `${present ? `設定項目あり（${present}層）` : "取得した有効な設定層に項目なし"}${excluded ? `・除外された${excluded}層に項目あり` : ""}`,
      limit,
    });
  }
  const managed = requirements.status === "ok" ? requirements.summary.present : "unknown";
  rows.push({
    id: "managed", name: "管理ポリシー", count: managed === "unknown" ? null : Number(managed),
    group: "keep",
    status: managed === "unknown" ? "unknown" : "read",
    detail: managed === "unknown" ? "管理上の要求を確認できていません" : managed ? "管理上の要求が報告されています" : "この読取では要求が報告されていません",
    limit: "必須指示と実行権限は、モードを変えても保持する対象です。",
  });
  return rows;
}

export function configurationLayers(report: SourceInventoryReport) {
  const config = report.probe.queries.config;
  return config.status === "ok" && config.summary.layers.status === "known" ? config.summary.layers.items : null;
}

export const layerNames: Record<string, string> = {
  packagedDefaults: "標準設定", mdm: "端末管理", system: "システム設定", enterpriseManaged: "組織の管理設定",
  user: "個人設定", project: "プロジェクト設定", sessionFlags: "起動時の指定",
  legacyManagedConfigTomlFromFile: "従来の管理設定", legacyManagedConfigTomlFromMdm: "従来の端末管理", unknown: "種類未確認の設定",
};
export const candidateStates: Record<InstructionCandidate["state"], string> = {
  present: "内容あり", empty: "空ファイル", absent: "候補なし", link: "リンク先は未確認",
  "not-file": "通常ファイルではありません", "too-large": "サイズ上限で未確認", changed: "読取中に変更", unreadable: "取得できません",
};
