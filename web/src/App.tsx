import { Hangar } from "./Hangar";
import { caseOrder, conditions, shortId } from "./types";
import { useFixtureController } from "./useFixtureController";
import { PreparedState } from "./components/PreparedState";
import { PlanSection } from "./components/PlanSection";
import { SaveSection } from "./components/SaveSection";
import { FavoritesSection } from "./components/FavoritesSection";
import { RecoverySection } from "./components/RecoverySection";
import { ObservationSection } from "./components/ObservationSection";
import { RecoveryDetails } from "./components/RecoveryDetails";

export function App() {
  const controller = useFixtureController();
  const {
    condition,
    shownCase,
    effects,
    setDisplayEffects,
    favorites,
    connected,
    busy,
    choose,
    notice,
    error,
    recoveryId,
  } = controller;
  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="wordmark" href="#main">
          UNHARNESS<span>装備を見直す。</span>
        </a>
        <div className="header-right">
          <span className="scope-label">専用の検証環境</span>
          <label className="effects">
            <input
              type="checkbox"
              checked={effects}
              onChange={(event) => setDisplayEffects(event.target.checked)}
            />
            演出 <span>{effects ? "ON" : "OFF"}</span>
          </label>
        </div>
      </header>
      <main id="main">
        <div className="hangar-layout">
          <section className="visual-column" aria-label="選択した確認条件">
            <div className="scene-heading">
              <p className="eyebrow">
                装備変更 <span>／ 選択プレビュー</span>
              </p>
              <h1>{condition.title}</h1>
              <p className="scene-subtitle">{condition.label}</p>
              <p className="scene-description">{condition.description}</p>
            </div>
            <Hangar condition={shownCase} effects={effects} />
            <p className="scene-caption">
              姿は選択条件のプレビューです。実行中のタスクの状態を表すものではありません。
            </p>
            <div className="mode-selector" aria-label="確認条件の選択">
              {caseOrder.map((key, index) => {
                const favorite = favorites.find((item) => item.case === key);
                return (
                  <button
                    key={key}
                    aria-pressed={shownCase === key}
                    disabled={!favorite || !connected || !!busy}
                    onClick={() => favorite && void choose(favorite)}
                  >
                    <span className="mode-icon" aria-hidden="true">
                      {["▣", "◇", "✧"][index]}
                    </span>
                    <span>
                      <strong>{conditions[key].title}</strong>
                      <small>{conditions[key].label}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
          <aside className="control-column" aria-label="設定と保存">
            <PreparedState controller={controller} />
            <PlanSection controller={controller} />
            <SaveSection controller={controller} />
          </aside>
        </div>
        <div className="status-strip">
          <span className="status-symbol" aria-hidden="true">
            ◇
          </span>
          <div role="status" aria-live="polite">
            {notice}
          </div>
          <span className="evidence-status">
            実行中の状態・モード切替：未検証
          </span>
        </div>
        {error && (
          <div className="global-error" role="alert">
            {error}
            {recoveryId && (
              <span>
                {" "}
                復帰点：<code>{shortId(recoveryId)}</code>
              </span>
            )}
          </div>
        )}
        <div className="records-grid">
          <FavoritesSection controller={controller} />
          <RecoverySection controller={controller} />
        </div>
        <ObservationSection controller={controller} />
        <RecoveryDetails controller={controller} />
      </main>
    </div>
  );
}
