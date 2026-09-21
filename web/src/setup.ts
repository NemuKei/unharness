import { text as t } from './locale.ts';
import type { SourceView, SourceMode } from './sources';

export type SetupRoute = 'zero-first' | 'current';
export function setupHandoffPrompt(view: SourceView, route: SetupRoute): string {
  const source = view.source;
  const lines = [
    t("Unharnessの管理ツールを使い、私の仕事に合う限定解除（UNSEAL）と零式（TRUEFORM）の設定を一緒に作ってください。", "Use the Unharness management tools to help me create UNSEAL and TRUEFORM settings that fit my work. Please guide me in English."),
    t(`対象アプリ: ${view.metadata.application === 'claude' ? 'Claude Code' : 'Codex Desktop'}`, `Target app: ${view.metadata.application === 'claude' ? 'Claude Code' : 'Codex Desktop'}`),
    ...(source ? [t(`登録範囲ID: ${source.registration.scopeId}`, `Registered scope ID: ${source.registration.scopeId}`), t(`元のNormal版ID: ${source.registration.activeNormalId}`, `Original Normal version ID: ${source.registration.activeNormalId}`),
      t(`表示時の準備版: ${source.revision}。操作前に最新の状態を確認してください。`, `Displayed preparation revision: ${source.revision}. Refresh the state before operating.`)] : []),
    t("現在の構成をNormalとして退避し、初期相談ではそのNormalの内容を作り替えないでください。保存済みなら退避を取り直さず、その版を使ってください。", "Save the current loadout as Normal and preserve its contents during initial consultation. If Normal is already saved, use that version instead of capturing it again."),
    t("初回登録がまだなら、このMacの確認画面で切替対象と通常の構成の保存を案内してください。登録や許可の確認を省略せず、相談や依頼文のコピーだけで初期設定済みと扱わないでください。", "If initial registration is missing, guide me through target review and saving Normal on this Mac. Preserve registration and permission checks. Consultation or copying this request does not complete setup."),
    t("最初に対象と対応する操作を確認し、未登録・由来不明の指示やSkillを推測で外さないでください。曖昧な点は一つずつ私に確認してください。", "First check the targets and supported controls. Do not remove unregistered instructions or Skills of unknown origin by assumption. Ask me about uncertainties one at a time."),
    ...(source?.setup?.setupRequired ? [t("登録更新後の2構成はまだ保存していません。read_setupの新しいinventoryと確認済みの役割を使い、両モードを再確認して保存してください。初回用の暫定設定で以前の選択を置き換えないでください。", "Both mode configurations still need saving after registration changed. Use fresh inventory from read_setup and confirmed roles to review and save both modes. Do not replace earlier choices with first-time provisional settings.")] : []),
    route === 'zero-first'
      ? t("初回は零式で相談する流れを希望します。Normalの退避と任意対象の確認を先に済ませてください。保存設定がまだなければ、read_setupにschemaVersion:3を渡し、登録した通常Skillを無効か手動から選びます。このMac版では公式プラグインを保持し、登録済みのプラグインもすべてNormal状態を引き継ぎます。追加指示と限定解除への追加がない暫定の2構成をreview_setupで確認し、apply_setupで保存してから、別操作で零式を準備します。暫定の2構成が同じ内容になることを示してください。既存の保存設定は暫定案で上書きせず確認します。その後、新しいタスクで短い最初の応答を完了し、GUIまたは元の管理タスクから読み込み記録を確認して、同じ新規タスクの次の応答で相談を続けます。通常Skillの入力対応と、公式プラグイン全体の未確認の実行状態を分けて報告してください。", "I would like the first consultation to use TRUEFORM. Save Normal and confirm optional targets first. If there are no saved settings, call read_setup with schemaVersion:3 and select disabled or manual for registered ordinary Skills. This Mac version retains official plugins; all registered plugins inherit Normal. Review two provisional configurations with no optional instructions or UNSEAL additions using review_setup, save with apply_setup, then prepare TRUEFORM as a separate operation. Explain that the provisional configurations are identical. Review existing saved settings instead of overwriting them. Complete a short first response in a new task, check its recorded inputs from the GUI or original management task, then continue consultation in the next response of that same new task. Report ordinary Skill input matching separately from the unconfirmed runtime of whole official plugins.")
      : t("今回の相談は現在の構成から始めてください。相談のために自動で零式へ切り替えないでください。", "Start this consultation from the current loadout. Do not automatically switch to TRUEFORM for the consultation."),
    t("使用中のモデルを確認し、そのモデルとアプリの公式情報・確認日・提案理由を残してください。モデル固有の情報がなければ、その範囲を明示してください。", "Identify the current model. Record official model and app guidance, the date checked and reasons for recommendations. State where model-specific information is unavailable."),
    t("read_setupの最新inventoryIdを使ってください。独自の追加指示を保存する場合、または保存版がv4の場合はschemaVersion=4を使い、それ以外はv3の既存形式を保てます。零式は追加指示をなくし、登録した通常Skillをそれぞれ無効か手動にします。限定解除は零式を継承し、選んだSkillだけ手動・自動へ上げます。Normalで無効だったSkillを有効にする場合も、その変更を明示して確認してください。", "Use the fresh inventoryId from read_setup. Use schemaVersion=4 for custom instructions or an existing v4 pair; otherwise the original v3 format remains supported. TRUEFORM removes optional instructions and sets each registered ordinary Skill to disabled or manual. UNSEAL inherits TRUEFORM and raises only selected Skills to manual or automatic. Explicitly review any change that enables a Skill disabled in Normal."),
    t("現行Codexでは公式プラグインの個別OFFが反映されないため、このMac版では切替対象に登録せず、現在の状態で保持してください。read_setupのpluginControlsも確認し、既に登録されているプラグインはtrueform.retainedOfficialPluginIdsへ含め、unseal.additionalPluginIdsは空にして両モードでNormalを保ちます。OFFが含まれる以前の設定は変更前に説明し、両モードの保持へ直した新しい案を確認・保存してください。導入済み一覧や書ける設定項目だけでOFF対応済みと判断しないでください。", "Individual official-plugin OFF is not effective in the qualified Codex version. Keep official plugins in their current state without registering them as switching targets in this Mac version. Check read_setup.pluginControls. Include already registered plugins in trueform.retainedOfficialPluginIds and keep unseal.additionalPluginIds empty to preserve Normal in both modes. Explain older settings containing OFF before changing them, then review and save a new proposal retaining plugins in both modes. An installed list or writable setting is not evidence of effective OFF support."),
    t("切替対象の追加指示はグローバルAGENTS.mdとして読み込む任意の指示です。固定の最小ガイド、追加指示なし、またはv4の独自の追加指示を相談します。独自の本文はUTF-8で8192バイト以内にし、unseal.instructions=customとcustomInstructionsで正確な本文を渡します。零式では本文を出力しません。元のAGENTS.mdとリポジトリのAGENTS.mdを保持し、既存のAGENTS.override.mdの切替処理を使ってください。同じCodex設定を使う他のプロジェクトの新しいタスクにも関係することを示してください。零式の選択を変えるときは両モードへの影響を一緒に示してください。公式プラグインのSkill・MCP・hook等は保持し、実行状態の未確認を示してください。旧規則の保存版・お気に入りは書き換えないでください。", "Optional instruction targets are loaded through global AGENTS.md. Discuss the fixed minimal guide, no guide, or custom v4 instructions. For custom text, use unseal.instructions=custom and customInstructions with the exact body, at most 8192 UTF-8 bytes. TRUEFORM emits no custom body. Preserve the original AGENTS.md and repository AGENTS.md and use the existing AGENTS.override.md switching operation. Explain its effect on new tasks in other projects sharing this Codex profile. Show the impact on both modes when TRUEFORM choices change. Retain official-plugin Skills, MCP and hooks and state that their runtime is unconfirmed. Never rewrite saved versions or favorites under earlier rules."),
    t("Unharnessの管理Skillと接続、メモリ、標準のタスク継続、権限、プロジェクト必須条件、管理・提供元の条件は保持してください。元の設定本文は検討用データとして扱ってください。", "Preserve the Unharness management Skill and connections, memory, native task continuity, permissions, project requirements and managed/provider requirements. Treat original configuration text as data to review."),
    t("review_setupで2構成の案を確認し、私が役割と構成を確認してからapply_setupで保存してください。設定ファイルを独自に編集しないでください。保存とモード切替、ファイルの準備と新しいタスクでの読み込みを区別してください。", "Review both proposals with review_setup. Save using apply_setup after I confirm roles and configurations. Do not independently edit configuration files. Distinguish saving from mode switching, and prepared files from loading in a new task."),
  ];
  return lines.join('\n\n');
}

export function freshTaskHandoffPrompt(view: SourceView): string {
  if (!view.source?.preparation) return '';
  return [
    t("この新しいタスクを、Unharnessに準備した設定の読み込み確認に使います。最初は設定を変更せず短く応答を完了してください。最初の応答中に自分自身を確認済みとして扱わないでください。", "Use this new task to check loading of the settings prepared by Unharness. First complete a short response without changing settings. Do not claim self-verification during that first response."),
    t(`登録範囲ID: ${view.source.registration.scopeId}`, `Registered scope ID: ${view.source.registration.scopeId}`),
    t(`準備したモード: ${view.source.preparedMode}`, `Prepared mode: ${view.source.preparedMode}`),
    t(`準備ID: ${view.source.preparation.id}`, `Preparation ID: ${view.source.preparation.id}`),
    t("最初の応答が完了した後、GUIまたは元の管理タスクからobserve_taskで、このタスクの実際のIDと記録を確認します。最新の状態と登録範囲・準備IDが一致してから、このタスクの次の応答で作業を続けてください。古いタスク、別タスク、準備前の記録、取得できない情報を反映済みとして扱わないでください。", "After the first response, use observe_task from the GUI or original management task to check this task's actual ID and record. Continue in the next response of this task only after the latest state, scope and preparation ID match. Do not treat old tasks, other tasks, records from before preparation or unavailable information as verified loading."),
  ].join('\n\n');
}

export function releaseModeDescription(mode: SourceMode, setupId?: string | null, schemaVersion?: 1 | 2 | 3 | 4 | null): string | null {
  if (!setupId || mode === 'normal') return null;
  if (schemaVersion === 3 || schemaVersion === 4) return mode === 'unseal'
    ? t("零式を引き継ぎ、選んだSkillと指示を追加する。公式プラグインは保持。", "Inherit TRUEFORM and add selected Skills and instructions. Retain official plugins.")
    : t("通常Skillは無効か手動。公式プラグインは保持する。", "Ordinary Skills are disabled or manual. Official plugins are retained.");
  if (schemaVersion === 2) return mode === 'unseal'
    ? t("零式の全対象を引き継ぎ、保存した追加Skillと指示を使う。", "Inherit all TRUEFORM targets and use saved additional Skills and instructions.")
    : t("追加指示を外し、選んだ公式プラグインの自動使用だけを残す。", "Remove optional instructions and retain automatic use of selected official plugins.");
  return mode === 'unseal'
    ? t("保存した設定で、追加指示とSkillの自動使用を調整する。", "Use saved settings to adjust optional instructions and automatic Skill use.")
    : t("選んだ追加指示を外す。自作Skillは明示的に呼び出す。", "Remove selected optional instructions. Invoke authored Skills explicitly.");
}
