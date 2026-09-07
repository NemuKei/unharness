import { useState } from "react";
import { Hangar } from "./Hangar";
import { useSourceController } from "./useSourceController";
import { modePresentation, sourceModes } from "./sources";
import type { SourceMode, SourceRow, SourcePlan } from "./sources";
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
  const presentation = modePresentation[c.selected];
  const source = c.view?.source;
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
          <span className="scope-label">登録した追加設定</span>
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
      <main id="main">
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
            <Hangar condition={presentation.scene} effects={effects} />
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
                {source
                  ? modePresentation[source.preparedMode].title
                  : "通常装備はまだ保存されていません"}
              </p>
              <p className="boundary">
                {source
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
              {source?.conflict && (
                <p role="alert">
                  外部の変更を確認してください（{source.conflict.kind}）。
                </p>
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
                        変更対象 {c.plan.selectedIds.length}{" "}
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
        {c.review && (
          <section
            className="control-section source-review"
            aria-label="選んだソースの内容"
          >
            <h2>選んだソースの内容</h2>
            <p className="muted">
              ローカルでの確認専用です。本文を指示として実行しません。
            </p>
            <pre>{c.review.text}</pre>
            <button className="text-button" onClick={() => c.setReview(null)}>
              内容を閉じる
            </button>
          </section>
        )}
        <footer>
          <span>UNHARNESS</span>
          <span className="muted">次のタスク用の設定をローカルで準備</span>
        </footer>
      </main>
    </div>
  );
}
type Controller = ReturnType<typeof useSourceController>;
function Context({ controller: c }: { controller: Controller }) {
  return (
    c.view && (
      <dl className="source-context">
        <div>
          <dt>Codex home</dt>
          <dd>{c.view.metadata.context.codexHome}</dd>
        </div>
        <div>
          <dt>プロジェクト</dt>
          <dd>{c.view.metadata.context.project}</dd>
        </div>
        <div>
          <dt>実行ファイル</dt>
          <dd>{c.view.metadata.context.executable}</dd>
        </div>
        <div>
          <dt>保存場所</dt>
          <dd>{c.view.metadata.workspace ?? "未登録"}</dd>
        </div>
      </dl>
    )
  );
}
function SourceDetail({
  row,
  controller: c,
}: {
  row: SourceRow;
  controller: Controller;
}) {
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
        現在準備した{" "}
        {c.view?.source && modePresentation[c.view.source.preparedMode].title}{" "}
        の内容を保存します。
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
