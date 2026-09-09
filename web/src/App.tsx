import { useEffect, useState } from "react";
import { Api, errorMessage } from "./api";
import { SourceWorkbench } from "./SourceWorkbench";
import { RecoveryWorkbench } from "./RecoveryWorkbench";
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
import { SourceInventory } from "./components/SourceInventory";

function FixtureApp() {
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
          <a className="inventory-link" href="#source-inventory">Codex設定を確認</a>
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
        <SourceInventory />
        <p className="fixture-note">
          ここにある保存版は、操作を確かめるための検証用データです。
        </p>
        <div className="records-grid">
          <FavoritesSection controller={controller} />
          <RecoverySection controller={controller} />
        </div>
        <details className="developer-details">
          <summary>
            <span>開発用の確認</span>
            <small>タスク記録との照合・保存場所・手動の復旧</small>
          </summary>
          <p className="developer-intro">
            以下はCodexのタスク記録と照合するための検証項目です。
            お気に入りの保存や呼び出しには、入力する必要はありません。
          </p>
          <ObservationSection controller={controller} />
          <RecoveryDetails controller={controller} />
        </details>
        <footer>
          <span>UNHARNESS</span>
          <span className="muted">ローカルの検証用プレビュー</span>
        </footer>
      </main>
    </div>
  );
}

export function App() {
  const [kind, setKind] = useState<"fixture" | "user-sources" | "recovery" | null>(null);
  const [error, setError] = useState("");
  async function connect() {
    setError("");
    try {
      const startup = await new Api().connect();
      if (startup.kind !== "fixture" && startup.kind !== "user-sources" && startup.kind !== "recovery") throw new Error("invalid-startup-kind");
      setKind(startup.kind);
    } catch (e) { setError(errorMessage(e)); }
  }
  useEffect(() => { void connect(); }, []);
  if (kind === "user-sources") return <SourceWorkbench />;
  if (kind === "recovery") return <RecoveryWorkbench />;
  if (kind === "fixture") return <FixtureApp />;
  return <main className="app-shell"><section className="control-section"><h1>UNHARNESS</h1><p role="status">接続先を確認しています。</p>{error && <p role="alert">{error}</p>}<button className="secondary" onClick={() => void connect()}>再接続</button></section></main>;
}
