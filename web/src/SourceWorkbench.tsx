import { useEffect, useRef, useState } from "react";
import { Hangar } from "./Hangar";
import { ComparisonWorkbench } from "./ComparisonWorkbench";
import {
  RestoreAdaptationNotice,
  RetainedReview,
} from "./components/RetainedReview";
import { useSourceController } from "./useSourceController";
import { comparisonContextKey } from "./useComparisonController";
import {
  canObserveTask,
  currentTaskObservation,
  isClaudeContext,
  modePresentation,
  observationIssueText,
  sourceHomeOf,
  sourceModes,
  sourceRuntimeOf,
  taskObservationLabel,
  validTaskId,
} from "./sources";
import type {
  SourceMode,
  SourceRow,
  SourcePlan,
  TaskObservation,
} from "./sources";
import "./sources.css";

function displayPreference() {
  try {
    return localStorage.getItem("unharness.effects.v1") !== "off";
  } catch {
    return false;
  }
}
export function SourceWorkbench() {
  const c = useSourceController();
  const [effects, setEffects] = useState(displayPreference);
  const [activeTab, setActiveTab] = useState<"equipment" | "comparison">(
    "equipment",
  );
  const [comparisonTask, setComparisonTask] = useState<{
    taskId: string;
    contextKey: string;
  } | null>(null);
  const presentation = modePresentation[c.selected];
  const source = c.view?.source;
  const comparisonKey = comparisonContextKey(c.view);
  const usable =
    !!source &&
    c.confirmed &&
    !source.conflict &&
    !source.recovery.pending &&
    !c.busy;
  return (
    <div className="app-shell source-workbench">
      <header className="topbar">
        <a className="wordmark" href="#main">
          UNHARNESS<span>装備を見直す。</span>
        </a>
        <div className="header-right">
          <span className="scope-label">
            {source ? "登録した追加設定" : "追加設定の確認"}
          </span>
          <label className="effects">
            <input
              type="checkbox"
              checked={effects}
              onChange={(e) => {
                setEffects(e.target.checked);
                try {
                  localStorage.setItem(
                    "unharness.effects.v1",
                    e.target.checked ? "on" : "off",
                  );
                } catch {}
              }}
            />
            演出 <span>{effects ? "ON" : "OFF"}</span>
          </label>
        </div>
      </header>
      <nav className="workbench-tabs" aria-label="ワークベンチ">
        <button
          aria-current={activeTab === "equipment" ? "page" : undefined}
          onClick={() => setActiveTab("equipment")}
        >
          装備
        </button>
        <button
          aria-current={activeTab === "comparison" ? "page" : undefined}
          onClick={() => setActiveTab("comparison")}
        >
          比較
        </button>
      </nav>
      {c.syncNotice && <p className={`source-sync-notice muted${c.syncIssue ? "" : " quiet"}`} role="status">{c.syncNotice}</p>}
      <main id="main">
        <div hidden={activeTab !== "comparison"}>
          <ComparisonWorkbench
            key={comparisonKey}
            sourceController={c}
            taskHandoff={
              comparisonTask?.contextKey === comparisonKey
                ? comparisonTask
                : undefined
            }
          />
          <footer>
            <span>UNHARNESS</span>
            <span className="muted">通常利用の観測記録をローカルで比較</span>
          </footer>
        </div>
        <div hidden={activeTab !== "equipment"}>
        <div className="hangar-layout">
          <section className="visual-column" aria-label="選択したモード">
            <div className="scene-heading">
              <p className="eyebrow">
                装備変更 <span>／ 選択中</span>
              </p>
              <h1>{presentation.title}</h1>
              <p className="scene-subtitle">{presentation.label}</p>
              <p className="scene-description">{presentation.description}</p>
            </div>
            <Hangar
              condition={presentation.scene}
              effects={effects && activeTab === "equipment"}
            />
            <p className="scene-caption">
              姿は選択プレビューです。実行中のタスクの状態を表すものではありません。
            </p>
            <ModeChoices
              key={
                c.selectionKey +
                ":" +
                (source?.registration.normalId ?? "setup")
              }
              controller={c}
              usable={usable}
            />
          </section>
          <aside className="control-column" aria-label="設定と保存">
            <section className="control-section">
              <div className="section-heading">
                <h2>現在の準備</h2>
                <span>
                  {source &&
                  c.confirmed &&
                  !source.conflict &&
                  !source.recovery.pending
                    ? "準備済み"
                    : source
                      ? "要確認"
                      : "未登録"}
                </span>
              </div>
              <p className="selected-name">
                {source?.recovery.pending
                  ? "変更が中断しています"
                  : source
                    ? `${!c.confirmed || source.conflict ? "最後に確認した保存状態：" : ""}${modePresentation[source.preparedMode].title}`
                    : "通常装備はまだ保存されていません"}
              </p>
              <p className="boundary">
                {source?.recovery.pending
                  ? "現在のファイル状態は未確認です。下の「中断した変更を復旧」で、記録に基づく復旧を行ってください。"
                  : source
                    ? "ファイルの準備と、タスクへの読み込みは別です。使用時は新しいタスクを作成してください。"
                    : "対象を確認し、追加した任意の指示・Skillだけを選んで保存します。"}
              </p>
              <button
                className="text-button"
                disabled={c.busy}
                onClick={() => void c.refresh()}
              >
                状態を再取得
              </button>
              {source?.conflict &&
                (source.recovery.pending ? (
                  <details>
                    <summary>現在の確認結果</summary>
                    <p>
                      確認できない状態：{source.conflict.kind}
                      。独立した編集がある場合、復旧は上書きせず停止します。
                    </p>
                  </details>
                ) : (
                  <div className="retained-conflict">
                    <p role="alert">
                      外部の変更を確認してください（{source.conflict.kind}）。
                    </p>
                    <button
                      className="secondary"
                      disabled={c.busy || !c.confirmed}
                      onClick={() =>
                        void c.run("plan-retained", {}, c.setRetainedPlan)
                      }
                    >
                      変更を確認
                    </button>
                    {c.retainedPlan && (
                      <RetainedReview
                        plan={c.retainedPlan}
                        disabled={c.busy || !c.confirmed}
                        onAccept={() =>
                          void c.run("accept-retained", {
                            planId: c.retainedPlan!.planId,
                          })
                        }
                      />
                    )}
                  </div>
                ))}
              {source && (
                <TaskObservationSection
                  controller={c}
                  usable={usable}
                  onCompareTask={(taskId) => {
                    setComparisonTask({ taskId, contextKey: comparisonKey });
                    setActiveTab("comparison");
                  }}
                />
              )}
            </section>
            {!source ? (
              <Setup key={c.selectionKey} controller={c} />
            ) : (
              <>
                <section className="control-section plan-section">
                  <div className="section-heading">
                    <h2>変更計画</h2>
                    <span>選択中</span>
                  </div>
                  {c.plan ? (
                    <>
                      <p>
                        {modePresentation[c.plan.preparedMode].title}{" "}
                        を次のタスク用に準備
                      </p>
                      {c.plan.adaptation && (
                        <RestoreAdaptationNotice
                          adaptation={c.plan.adaptation}
                        />
                      )}
                      <ul className="source-changes">
                        {c.plan.changedFiles.map((file) => (
                          <li key={file.id}>{file.label}</li>
                        ))}
                      </ul>
                      {!c.plan.changedFiles.length && (
                        <p className="muted">
                          ファイル内容の変更はありません。
                        </p>
                      )}
                      <p className="boundary">
                        このCodex
                        homeを使う今後のタスクで共有する設定です。元に戻すまで準備した内容が続きます。
                      </p>
                      <p className="muted">
                        変更するファイル {c.plan.changedFiles.length}{" "}
                        件。未選択の設定は通常装備の内容を維持します。
                      </p>
                      <details>
                        <summary>計画の詳細</summary>
                        <code>{c.plan.planId}</code>
                        {c.plan.skillStates.map((row) => (
                          <p key={row.id}>
                            {
                              source.registration.sources.find(
                                (s) => s.id === row.id,
                              )?.label
                            }
                            :{" "}
                            {row.enabled
                              ? row.manualOnly
                                ? "手動のみ"
                                : "有効"
                              : "無効"}
                          </p>
                        ))}
                      </details>
                    </>
                  ) : (
                    <p className="muted">
                      モードまたは保存版を選び、変更計画を確認してください。
                    </p>
                  )}
                  <button
                    className="primary"
                    disabled={!usable || !c.plan}
                    onClick={() =>
                      c.plan && void c.run("apply", { planId: c.plan.planId })
                    }
                  >
                    この計画で準備する
                  </button>
                </section>
                <Save controller={c} usable={usable} />
              </>
            )}
          </aside>
        </div>
        <div className="status-strip">
          <span className="status-symbol" aria-hidden="true">
            ◇
          </span>
          <div role="status" aria-live="polite">
            {c.notice}
          </div>
          <span className="evidence-status">
            実行中の状態・モード切替：未検証
          </span>
        </div>
        {c.error && (
          <div className="global-error" role="alert">
            {c.error}
          </div>
        )}
        <div className="records-grid">
          <section className="control-section">
            <div className="section-heading">
              <h2>お気に入り</h2>
              <span>内容を保存した版</span>
            </div>
            <button
              className="secondary"
              disabled={!source || c.busy}
              onClick={() => c.loadFavorites()}
            >
              保存版を表示
            </button>
            <ul className="source-favorites">
              {c.favorites.map((f) => (
                <li key={f.favoriteId}>
                  <button
                    className="secondary"
                    disabled={!usable}
                    onClick={() =>
                      void c.run<SourcePlan>(
                        "favorite",
                        { favoriteId: f.favoriteId },
                        c.setPlan,
                      )
                    }
                  >
                    {f.name} · {modePresentation[f.preparedMode].title}
                    {source &&
                    f.normalId !== source.registration.activeNormalId
                      ? " · 現在の共通設定を維持"
                      : ""}
                  </button>
                </li>
              ))}
            </ul>
            {c.cursor && (
              <button
                className="text-button"
                disabled={c.busy}
                onClick={() => c.loadFavorites(c.cursor!)}
              >
                続きを表示
              </button>
            )}
          </section>
          <section className="control-section" aria-label="復帰">
            <div className="section-heading">
              <h2>元に戻す</h2>
              <span>変更前の記録</span>
            </div>
            <p className="muted">
              独立した編集は上書きしません。復帰も計画を確認してから準備します。
            </p>
            <div className="source-actions">
              <button
                className="secondary"
                disabled={!source?.recovery.lastCheckpointId || c.busy}
                onClick={() =>
                  void c.run<SourcePlan>(
                    "checkpoint",
                    { checkpointId: source!.recovery.lastCheckpointId },
                    c.setPlan,
                  )
                }
              >
                変更前への復帰を確認
              </button>
              <button
                className="secondary"
                disabled={!source || c.busy}
                onClick={() => void c.run("recover", {})}
              >
                中断した変更を復旧
              </button>
            </div>
            {c.recoveryResult && (
              <details>
                <summary>復旧結果の詳細</summary>
                <pre>{JSON.stringify(c.recoveryResult, null, 2)}</pre>
              </details>
            )}
            {source && (
              <details>
                <summary>AIや画面が使えないときの復旧</summary>
                <p className="muted">
                  Nodeに渡す引数です。シェル文字列として実行せず、各引数を個別に渡してください。リポジトリ外では
                  CLI の絶対パスを指定します。
                </p>
                <pre>{JSON.stringify(source.recovery.argv, null, 2)}</pre>
                <p>中断した変更：{source.recovery.pending ? "あり" : "なし"}</p>
                <p>
                  復帰点：
                  <code>
                    {source.recovery.lastCheckpointId ?? "まだありません"}
                  </code>
                </p>
              </details>
            )}
          </section>
        </div>
        <details className="developer-details">
          <summary>対象・保持する設定・対応状況</summary>
          <Context controller={c} />
          <p>
            メモリ、タスク継続、実行権限、プロジェクト要件、提供元・管理者の設定、未選択のソースは保持します。
          </p>
          <p>
            フックは変更しません。Windowsの実設定書き込みとデスクトップ読み込みは未検証です。
          </p>
          {source?.registration.sources.map((row) => (
            <SourceDetail key={row.id} row={row} controller={c} />
          ))}
        </details>
        <footer>
          <span>UNHARNESS</span>
          <span className="muted">次のタスク用の設定をローカルで準備</span>
        </footer>
        </div>
      </main>
    </div>
  );
}
type Controller = ReturnType<typeof useSourceController>;

const expectedLabels: Record<TaskObservation["sources"][number]["expected"], string> = {
  "saved-instructions": "保存した指示",
  "minimal-guide": "最小ガイド",
  "inert-instructions": "無効化した指示",
  "automatic-catalog": "自動選択の一覧に表示",
  "manual-only": "手動のみ",
  disabled: "無効",
  unknown: "不明",
};
const recordedLabels: Record<TaskObservation["sources"][number]["recorded"], string> = {
  "matching-prefix": "指示の先頭が一致",
  "different-prefix": "指示の先頭が不一致",
  present: "一覧にあり",
  absent: "一覧になし",
  unknown: "不明",
};
const sourceStatusLabels: Record<TaskObservation["sources"][number]["status"], string> = {
  matched: "一致",
  "not-matched": "不一致",
  unknown: "不明",
};

function TaskObservationSection({
  controller: c,
  usable,
  onCompareTask,
}: {
  controller: Controller;
  usable: boolean;
  onCompareTask: (taskId: string) => void;
}) {
  const [taskId, setTaskId] = useState("");
  const source = c.view?.source ?? null;
  const observation = currentTaskObservation(source);
  const taskIdValid = validTaskId(taskId);
  return (
    <div className="task-observation">
      {observation ? (
        <div
          className={`task-observation-result ${observation.status}`}
          role="status"
        >
          <strong>{taskObservationLabel(observation.status)}</strong>
          <span>
            {modePresentation[observation.preparedMode].title} ／{" "}
            <time dateTime={observation.observedAt}>
              {new Date(observation.observedAt).toLocaleString("ja-JP")}
            </time>
          </span>
        </div>
      ) : (
        <p className="task-observation-empty">
          {observationIssueText(source?.observationIssue ?? null)}
        </p>
      )}
      <details>
        <summary>タスク記録で確認</summary>
        <p className="muted">
          この準備の後に、同じプロジェクトで新しいCodex Desktopタスクを作成してください。そのタスクのUUIDだけを確認します。
        </p>
        <label className="source-name" htmlFor="source-task-id">
          タスクUUID
          <input
            id="source-task-id"
            name="taskId"
            type="text"
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            value={taskId}
            aria-invalid={taskId.length > 0 && !taskIdValid}
            onChange={(event) => setTaskId(event.target.value)}
          />
        </label>
        <button
          className="secondary"
          disabled={!usable || !canObserveTask(source) || !taskIdValid}
          onClick={() =>
            void c.run<TaskObservation>("observe", { taskId: taskId.trim() })
          }
        >
          このタスクの記録を確認
        </button>
        {observation && (
          <div className="task-observation-details">
            <p>
              準備モード：{modePresentation[observation.preparedMode].title}
            </p>
            <p>
              確認日時：
              <time dateTime={observation.observedAt}>
                {new Date(observation.observedAt).toLocaleString("ja-JP")}
              </time>
            </p>
            <ul>
              {observation.sources.map((recordedSource) => {
                const registeredSource = source?.registration.sources.find(
                  (candidate) => candidate.id === recordedSource.sourceId,
                );
                return (
                  <li key={recordedSource.sourceId}>
                    <strong>
                      {registeredSource?.label ?? recordedSource.category}
                    </strong>
                    ：期待 {expectedLabels[recordedSource.expected]} ／ 記録{" "}
                    {recordedLabels[recordedSource.recorded]} ／{" "}
                    {sourceStatusLabels[recordedSource.status]}
                  </li>
                );
              })}
            </ul>
            {observation.reasons.length > 0 && (
              <p className="muted">
                理由：{observation.reasons.join("、")}
              </p>
            )}
            <p className="muted">
              選んだソースの最初の記録だけを確認します。実行中の状態、モード切替、すべてのソースの読み込みは未検証です。
            </p>
            <button
              className="text-button"
              onClick={() => onCompareTask(observation.taskId)}
            >
              このUUIDを比較で使う
            </button>
          </div>
        )}
      </details>
    </div>
  );
}

function Context({ controller: c }: { controller: Controller }) {
  if (!c.view) return false;
  const { application, applicationLabel, context, workspace } = c.view.metadata;
  const claude = isClaudeContext(context);
  return (
    <dl className="source-context">
      <div>
        <dt>アプリ</dt>
        <dd>{applicationLabel}</dd>
      </div>
      <div>
        <dt>{claude ? "Claude home" : "Codex home"}</dt>
        <dd>{sourceHomeOf(context)}</dd>
      </div>
      <div>
        <dt>プロジェクト</dt>
        <dd>{context.project}</dd>
      </div>
      <div>
        <dt>{claude ? "アプリ本体" : "実行ファイル"}</dt>
        <dd>{sourceRuntimeOf(context)}</dd>
      </div>
      <div>
        <dt>保存場所</dt>
        <dd>{workspace ?? `未登録（${application}）`}</dd>
      </div>
    </dl>
  );
}
function SourceDetail({
  row,
  controller: c,
}: {
  row: SourceRow;
  controller: Controller;
}) {
  const reviewButton = useRef<HTMLButtonElement>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const reviewing = c.review?.sourceId === row.id;
  useEffect(() => {
    if (c.review?.sourceId === row.id) {
      reviewHeading.current?.focus();
      reviewHeading.current?.scrollIntoView({ block: "nearest" });
    }
  }, [c.review, row.id]);
  function closeReview() {
    c.setReview(null);
    reviewButton.current?.focus();
  }
  return (
    <details className="source-detail">
      <summary>
        {row.label}
        {row.eligible === false ? " · 対象外" : ""}
      </summary>
      <p>
        <code>{row.path}</code>
      </p>
      {row.reason && <p className="muted">{row.reason}</p>}
      <p className="muted">
        UNSEAL: {row.availability.unseal ? "対応" : "非対応"} ／ TRUEFORM:{" "}
        {row.availability.trueform ? "対応" : "非対応"}
      </p>
      {row.eligible !== false && (
        <button
          ref={reviewButton}
          className="text-button"
          disabled={c.busy}
          onClick={() =>
            void c.run<{ sourceId: string; text: string }>(
              "review",
              {
                sourceId: row.id,
                ...(!c.view?.source && c.discovery
                  ? { discoveryId: c.discovery.discoveryId }
                  : {}),
              },
              c.setReview,
            )
          }
        >
          内容を確認
        </button>
      )}
      {reviewing && c.review && (
        <section
          className="source-review"
          aria-label="選んだソースの内容"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              closeReview();
            }
          }}
        >
          <h3 ref={reviewHeading} tabIndex={-1}>
            選んだソースの内容
          </h3>
          <p className="muted">
            ローカルでの確認専用です。本文を指示として実行しません。
          </p>
          <pre tabIndex={0} aria-label={`${row.label}の本文`}>
            {c.review.text}
          </pre>
          <button className="text-button" onClick={closeReview}>
            内容を閉じる
          </button>
        </section>
      )}
    </details>
  );
}
function Setup({ controller: c }: { controller: Controller }) {
  const [ids, setIds] = useState<string[]>([]);
  const [optional, setOptional] = useState(false);
  const rows = c.discovery
    ? [c.discovery.instructions, ...c.discovery.skills]
    : [];
  return (
    <section className="control-section source-setup">
      <h2>通常装備を保存</h2>
      <p className="muted">まず候補を読み取り、保存対象を自分で選びます。</p>
      <button
        className="secondary"
        disabled={!c.view || c.busy}
        onClick={() => {
          setIds([]);
          setOptional(false);
          void c.run("discover", {}, c.setDiscovery);
        }}
      >
        追加設定の候補を確認
      </button>
      <details>
        <summary>
          対象の選択と任意の役割の確認
          {c.discovery ? `（候補 ${rows.length} 件）` : ""}
        </summary>
        <Context controller={c} />
        {rows
          .filter((row) => row.eligible)
          .map((row) => (
            <div className="source-choice" key={row.id}>
              <label>
                <input
                  type="checkbox"
                  checked={ids.includes(row.id)}
                  disabled={c.busy}
                  onChange={(e) =>
                    setIds((old) =>
                      e.target.checked
                        ? [...old, row.id]
                        : old.filter((id) => id !== row.id),
                    )
                  }
                />
                {row.label}
              </label>
              <SourceDetail row={row} controller={c} />
            </div>
          ))}
        {c.discovery && (
          <details>
            <summary>
              利用できない候補（{rows.filter((row) => !row.eligible).length}{" "}
              件）
            </summary>
            {rows
              .filter((row) => !row.eligible)
              .map((row) => (
                <SourceDetail key={row.id} row={row} controller={c} />
              ))}
            {c.discovery.unavailableSources.map((row) => (
              <p key={row.id}>
                {row.id}: {row.reason}
              </p>
            ))}
            {/* Sources no mode manages. Shown so "selected extras absent"
                is never read as covering more than it does. */}
            {(c.discovery.notices ?? []).map((notice) => (
              <div className="source-notice" key={notice.id + notice.path}>
                <p>
                  {notice.label}
                  {notice.count > 0 ? `（${notice.count}）` : ""}
                </p>
                <p>
                  <code>{notice.path}</code>
                </p>
                <p className="muted">{notice.detail}</p>
              </div>
            ))}
          </details>
        )}
        <label className="source-declaration">
          <input
            type="checkbox"
            checked={optional}
            disabled={c.busy}
            onChange={(e) => setOptional(e.target.checked)}
          />
          選んだ指示・Skillは自分が追加した任意の設定です。必須要件や管理者・提供元の設定は含めていません。
        </label>
        <p className="muted">
          配置場所だけでは任意と判断できません。必須と任意が混在する指示は選ばないでください。Skillは最大32件です。
        </p>
      </details>
      <button
        className="primary"
        disabled={
          c.busy ||
          !c.confirmed ||
          !c.discovery?.registrationAvailable ||
          !optional ||
          !ids.length ||
          ids.filter((id) => id.startsWith("skill-")).length > 32
        }
        onClick={() =>
          c.discovery &&
          void c.run("register", {
            discoveryId: c.discovery.discoveryId,
            instructionsOptional: ids.includes(c.discovery.instructions.id),
            selectedSkillIds: ids.filter(
              (id) => id !== c.discovery!.instructions.id,
            ),
            userAddedOptional: optional,
          })
        }
      >
        選んだ対象で通常装備を保存
      </button>
    </section>
  );
}
function ModeChoices({
  controller: c,
  usable,
}: {
  controller: Controller;
  usable: boolean;
}) {
  const rows = c.view?.source?.registration.sources ?? [];
  const [custom, setCustom] = useState<Partial<Record<SourceMode, string[]>>>(
    {},
  );
  return (
    <div
      className="mode-selector source-mode-selector"
      aria-label="モードを選択"
    >
      {sourceModes.map((mode) => (
        <div className="source-mode" key={mode}>
          <button
            aria-pressed={c.selected === mode}
            disabled={!usable}
            onClick={() => c.choose(mode, custom[mode])}
          >
            <span className="mode-icon" aria-hidden="true">
              {mode === "normal" ? "▣" : mode === "unseal" ? "◇" : "✧"}
            </span>
            <span>
              <strong>{modePresentation[mode].title}</strong>
              <small>{modePresentation[mode].label}</small>
            </span>
          </button>
          {mode !== "normal" && c.view?.source && (
            <details>
              <summary>対象を調整</summary>
              <p className="muted">
                登録した対象から、このモードで外すものを選べます。
              </p>
              {rows.map((row) =>
                row.availability[mode] ? (
                  <label className="source-target" key={row.id}>
                    <input
                      type="checkbox"
                      checked={(
                        custom[mode] ??
                        rows
                          .filter((r) => r.availability[mode])
                          .map((r) => r.id)
                      ).includes(row.id)}
                      disabled={c.busy}
                      onChange={(e) => {
                        const old =
                          custom[mode] ??
                          rows
                            .filter((r) => r.availability[mode])
                            .map((r) => r.id);
                        setCustom({
                          ...custom,
                          [mode]: e.target.checked
                            ? [...old, row.id]
                            : old.filter((id) => id !== row.id),
                        });
                        c.invalidatePlan();
                      }}
                    />
                    {row.label}
                  </label>
                ) : (
                  <p className="muted" key={row.id}>
                    {row.label}：このモードでは変更できません。
                  </p>
                ),
              )}
              <p className="muted">
                変更後はモードを選び直し、計画を確認してください。
              </p>
              {mode === "unseal" && c.view && (
                <details>
                  <summary>固定の最小ガイド</summary>
                  <p className="muted">
                    公式ガイドを参考にUnharnessが作成した比較用の文章です。
                  </p>
                  <pre>{c.view.guide.text}</pre>
                  <p>
                    <code>{c.view.guide.id}</code> · {c.view.guide.reviewedOn}
                  </p>
                  <code>{c.view.guide.digest}</code>
                  {c.view.guide.references.map((url) => (
                    <p key={url}>{url}</p>
                  ))}
                </details>
              )}
              <p className="muted">
                フックは変更非対応。メモリ・タスク継続・権限は保持します。
              </p>
            </details>
          )}
        </div>
      ))}
    </div>
  );
}
function Save({
  controller: c,
  usable,
}: {
  controller: Controller;
  usable: boolean;
}) {
  const [name, setName] = useState("");
  return (
    <section className="control-section">
      <h2>お気に入りに保存</h2>
      <p className="muted">
        {c.view?.source &&
        c.confirmed &&
        !c.view.source.conflict &&
        !c.view.source.recovery.pending
          ? `現在準備した ${modePresentation[c.view.source.preparedMode].title} の内容を保存します。`
          : "ファイル状態を確認してから保存できます。"}
      </p>
      <label className="source-name">
        名前（任意）
        <input
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <button
        className="secondary"
        disabled={!usable}
        onClick={() => void c.run("save", { name })}
      >
        現在の準備を保存
      </button>
    </section>
  );
}
