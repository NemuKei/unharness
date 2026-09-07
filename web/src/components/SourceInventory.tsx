import { candidateStates, configurationLayers, layerNames, sourceRows } from "../inventory";
import type { SourceRow } from "../inventory";
import { useSourceInventory } from "../useSourceInventory";

const statusNames = { read: "取得済み", partial: "一部未確認", unknown: "未取得" };

function InventoryRows({ rows }: { rows: SourceRow[] }) {
  return (
    <dl className="inventory-sources">
      {rows.map(row => (
        <div key={row.id} className="inventory-source">
          <dt>{row.name}<small data-status={row.status}>{statusNames[row.status]}</small></dt>
          <dd><strong>{row.detail}</strong><span>{row.limit}</span></dd>
        </div>
      ))}
    </dl>
  );
}

export function SourceInventory() {
  const { inventory, busy, error, notice, read } = useSourceInventory();
  const report = inventory?.report;
  const rows = report ? sourceRows(report) : [];
  const layers = report ? configurationLayers(report) : null;
  const projectName = inventory?.cwd?.split(/[\\/]/).filter(Boolean).at(-1) ?? inventory?.cwd;
  return (
    <section id="source-inventory" className="inventory-section" aria-labelledby="inventory-heading">
      <div className="inventory-heading">
        <div>
          <p className="eyebrow">今の装備を知る <span>／ 読み取り専用</span></p>
          <h2 id="inventory-heading">このPCのCodex設定</h2>
          <p className="inventory-intro">追加指示とSkillを中心に、普段の設定と解除候補を確認します。</p>
        </div>
        <button className="secondary" disabled={busy} onClick={() => void read()}>
          {busy ? "読み取り中…" : !inventory?.enabled ? "読み取り対象を再取得" : report ? "Codex設定を再読み取り" : "Codex設定を読み取る"}
        </button>
      </div>
      {inventory?.cwd && (
        <details className="inventory-target">
          <summary>対象プロジェクト：{projectName}<span>場所を確認</span></summary>
          <code>{inventory.cwd}</code>
          <p>この起動で選んだ場所に固定されています。検証環境の保存・切替とは別の読み取りです。</p>
        </details>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="inventory-notice" role="status">{notice}</p>}
      <p className="inventory-status" role="status" aria-live="polite">
        {busy ? "読み取り結果を待っています。設定を変更する操作は行いません。"
          : inventory?.enabled === false ? "この起動では読み取り対象が選ばれていません。起動オプションで対象を指定すると利用できます。"
          : report ? `取得日時：${new Date(report.observedAt).toLocaleString("ja-JP")} ／ Codex ${report.probe.codexCli.version ?? "版を取得できません"}`
          : "まだ読み取っていません。ボタンを押すと、設定本文を表示せずに一覧を取得します。"}
      </p>
      {report && (
        <>
          <div className="inventory-boundary">
            <strong>解除するのは、自作・自分で追加した設定だけ。</strong>
            <span>表示件数には標準提供の項目も含みます。個人設定の切替対象は未登録で、役割の分類と反映の検証が必要です。</span>
          </div>
          <InventoryRows rows={rows.filter(row => row.group === "review")} />
          <details className="inventory-details inventory-preserved">
            <summary>維持する設定を見る：メモリ・連携・管理ポリシー</summary>
            <InventoryRows rows={rows.filter(row => row.group === "keep")} />
          </details>
          <details className="inventory-details">
            <summary>設定層と指示ファイルの候補を見る</summary>
            <p className="inventory-detail-note">AGENTS.mdとAGENTS.override.mdの候補を確認しています。優先されたファイル、追加のファイル名、デスクトップから渡される指示は未確認です。</p>
            <div className="inventory-layers">
              {layers === null ? <span>設定層は取得できていません</span>
                : layers.length === 0 ? <span>設定層は報告されていません</span>
                : layers.map((layer, index) => (
                  <span key={index}>{layerNames[layer.sourceType] ?? layerNames.unknown}{layer.disabled ? "（除外）" : ""}</span>
                ))}
            </div>
            <ul className="inventory-files">
              {report.instructions.files.map((file, index) => (
                <li key={index}>
                  <div>
                    <span>{file.scope === "user" ? "個人設定" : file.depth === 0 ? "プロジェクトの起点" : `プロジェクトの起点から${file.depth}階層下`}</span>
                    <code>{file.name}</code>
                  </div>
                  <span>{candidateStates[file.state]}{file.bytes !== undefined ? `・${file.bytes.toLocaleString()} B` : ""}</span>
                </li>
              ))}
            </ul>
            <p className="inventory-detail-note">別プロセスからの診断です。実行中のタスクへの接続や、全ソースの読み込み・モード切替の確認ではありません。指示の本文、Skill名、hookコマンド、秘密情報は表示・保存版登録していません。</p>
          </details>
        </>
      )}
    </section>
  );
}
