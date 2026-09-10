import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { relative } from 'node:path';

// These are documentation/metadata contracts, not an image-model or native
// application qualification. Existing template/image tests own PNG decoding.
const root = new URL('../', import.meta.url);
const skillUrl = new URL('skills/unharness-original/SKILL.md', root);
const referenceUrl = new URL('skills/unharness-original/references/layer-template.md', root);
const pack = 'assets/appearance-templates/hangar-layered-v1/';
const text = url => readFile(url, 'utf8');
const skill = () => text(skillUrl);
const reference = () => text(referenceUrl);
const links = body => [...body.matchAll(/\[[^\]]*\]\(([^\s)]+)\)/g)].map(m => m[1]);
function section(body, heading) {
  const value = body.split(`## ${heading}\n`)[1]?.split('\n## ')[0];
  assert.ok(value, `Missing authoring section: ${heading}`);
  return value;
}
function required(body, patterns) {
  for (const pattern of patterns) assert.match(body, pattern);
}
function frontmatter(body) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(body);
  assert.ok(match, 'YAML frontmatter must be first');
  // A deliberately restricted scalar form, not a replacement YAML parser.
  // This Skill needs no tags, anchors, tool grants or executable frontmatter.
  const entries = match[1].split('\n').map(line => {
    const field = /^(name|description|disable-model-invocation): (.+)$/.exec(line);
    assert.ok(field, 'Only the three explicit scalar metadata fields are needed');
    return [field[1], field[2]];
  });
  assert.equal(new Set(entries.map(([key]) => key)).size, entries.length);
  assert.equal(entries.length, 3);
  return Object.fromEntries(entries);
}
function referenceContract(body) {
  const match = /```json\n([\s\S]*?)\n```/.exec(section(body, '固定値'));
  assert.ok(match, 'Machine-checked reference summary is required');
  return JSON.parse(match[1]);
}

test('original authoring is an explicitly invoked Skill with bounded scalar metadata', async () => {
  const body = await skill(), fields = frontmatter(body);
  assert.equal(fields.name, 'unharness-original');
  assert.equal(fields['disable-model-invocation'], 'true');
  assert.match(fields.description, /^Use when the user explicitly requests/);
  assert.ok(fields.description.length <= 500);
  assert.ok(body.split('\n').length < 130);
  assert.doesNotMatch(body, /^allowed-tools:|^context: fork|^model:|^hooks:/m);
});

test('Codex metadata keeps automatic invocation off without requiring a tool or paid model', async () => {
  const meta = await text(new URL('skills/unharness-original/agents/openai.yaml', root));
  assert.match(meta, /^interface:\n  display_name: "オリジナルイメージを作成"\n/m);
  assert.match(meta, /^  short_description: "[^"\n]+"$/m);
  assert.match(meta, /^  default_prompt: ".*\$unharness-original.*"$/m);
  assert.match(meta, /^policy:\n  allow_implicit_invocation: false\n$/m);
  assert.doesNotMatch(meta, /^dependencies:|^permissions:|^model:|transport:|api_key/i);
});

test('the main Skill links one local reference instead of inventing an import tool', async () => {
  const body = await skill();
  assert.ok(links(body).includes('references/layer-template.md'));
  for (const target of links(body).filter(link => !link.startsWith('https:'))) {
    const url = new URL(target, skillUrl);
    assert.ok(url.href.startsWith(new URL('skills/unharness-original/', root).href));
    assert.ok((await stat(url)).isFile());
  }
  required(section(body, '引き渡しと報告'), [/import用MCP.*まだない/, /tool名.*捏造しない/, /自動送信.*しない/]);
  assert.doesNotMatch(body, /`(?:import_appearance|save_appearance|reviewAppearanceImport|saveAppearanceImport)\s*\(/);
});

test('an existing brief is reused and partial replacements retain selected or stock parts', async () => {
  const body = section(await skill(), '希望と制作範囲');
  required(body, [/既に.*希望.*繰り返し聞かない/, /本体だけ/, /拘束具だけ/, /背景だけ/, /一式/,
    /未指定.*選択済み.*標準素材/, /無断.*再生成しない/, /少数.*方向/, /制作場所/]);
});

test('new creation is not gated by comparison, candidate count or a final choice', async () => {
  const body = await skill();
  required(body, [/比較成績.*条件にしない/, /3候補.*強制しない/, /最終選択.*ロックしない/,
    /修正.*以前の版/, /Normal.*変更しない/]);
  assert.doesNotMatch(body, /`(?:review_setup|apply_setup|plan_mode|apply_plan|save_favorite)`/);
});

test('capability checks provide real non-image-model paths without changing accounts', async () => {
  const body = section(await skill(), '利用できる制作手段');
  required(body, [/実際に.*画像生成機能.*確認/, /利用者.*画像/, /ローカル.*描画/, /新しい有料API.*契約しない/,
    /全アプリ.*同じ機能.*保証しない/, /書込み.*できない/, /制作補助.*コード/, /作品.*取り込まない/]);
});

test('layers are separate static raster inputs, never a flat preview or executable artwork', async () => {
  const body = section(await skill(), '部品を作る');
  required(body, [/静止PNG/, /別レイヤー/, /透明/, /トリミング.*しない/, /一枚.*完成.*扱わない/,
    /ガイド.*焼き込まない/, /元画像.*上書きしない/]);
  required(await reference(), [/SVG.*参照専用/, /APNG/, /JavaScript.*HTML.*シェーダー/, /外部URL/]);
});

test('three previews are artwork-only and missing composition is not declared verified', async () => {
  const body = section(await skill(), '3モードの確認');
  required(body, [/Normal/, /UNSEAL/, /TRUEFORM/, /同じ.*本体.*背景|本体.*背景.*同じ/, /設定.*切り替えない/,
    /既存.*合成/, /未検証/, /完成.*装わない/, /49姿勢.*新.*生成しない/]);
});

test('files, preview, local review and saved collection have different completion states', async () => {
  const body = section(await skill(), '引き渡しと報告');
  required(body, [/PNGを書き出した/, /3モード.*確認した/, /読込レビュー待ち/, /保存を確認した/,
    /作品を読み込む/, /明示的.*ファイル選択/, /レビュー.*保存/, /コレクション/,
    /読込UI.*未提供/, /成功.*推測しない/, /同じ.*操作ID/, /新しい.*自動再実行しない/]);
});

test('artwork authoring neither reads private configuration nor uploads conversation text', async () => {
  const body = section(await skill(), '守る境界');
  required(body, [/公開ページ.*設定.*会話本文.*送らない/, /保存先.*認証.*ローカル/,
    /メモリ.*好み.*推測しない/, /制作.*利用量.*比較.*混ぜない/, /権限.*変更しない/,
    /外部投稿.*行わない/]);
});

test('reference fixes the original canvas, anchor, input bounds and mode pose indices', async () => {
  const c = referenceContract(await reference());
  const { WORLD, coreNucleus, coreBounds } = await import('../src/appearances/parts.mjs');
  const { CELS_PER_STAGE, buildCels } = await import('../src/appearances/kinematics.mjs');
  const stock = JSON.parse(await text(new URL(pack + 'stock.json', root)));
  const templateSource = await text(new URL('src/appearances/template.mjs', root));
  const imageSource = await text(new URL('src/appearances/assets.mjs', root));
  assert.deepEqual(c, {
    name: 'hangar-layered-v1', templateId: stock.manifest.templateId, rendererVersion: 'mechanical-layers/v1',
    canvas: { width: WORLD, height: WORLD }, entityAnchor: coreNucleus, entityBounds: coreBounds,
    poseCount: buildCels().length, modePoseIndices: { normal: 0, unseal: CELS_PER_STAGE, trueform: CELS_PER_STAGE * 2 },
    input: { format: 'static-png', square: true, maxSide: 2048, maxImageBytes: 8 * 1024 * 1024,
      maxSetBytes: 64 * 1024 * 1024, maxImages: 64 },
  });
  assert.match(imageSource, /MAX_LAYER_INPUT_SIDE = 2048;/);
  required(templateSource, [/LAYER_IMAGE_LIMIT = 8 \* 1024 \* 1024;/, /LAYER_SET_LIMIT = 64 \* 1024 \* 1024;/,
    /LAYER_COUNT_LIMIT = 64;/]);
  required(await reference(), [/724.*正規化/, /元画像.*残/, /下記.*取り込み用manifest.*ではない/]);
});

test('part names and PNG references match the stock catalogue and known moving pieces', async () => {
  const body = await reference();
  const stock = JSON.parse(await text(new URL(pack + 'stock.json', root)));
  const { sourceArms } = await import('../src/appearances/parts.mjs');
  const { sourcePanels } = await import('../src/appearances/kinematics.mjs');
  const rows = [...section(body, '部品と素材').matchAll(/^\| `([a-z-]+)` \|[^\n]*\[PNG\]\(([^)]+)\)/gm)];
  const expected = ['background', ...sourceArms.map(p => 'arm-' + p.id), 'entity', ...sourcePanels.map(p => 'panel-' + p.id), 'glint'];
  assert.equal(rows.length, 13);
  assert.deepEqual(rows.map(m => m[1]), expected);
  assert.deepEqual(rows.map(m => [m[1], m[2].split('/').at(-1)]), stock.files.map(p => [p.partId, p.file]));
  required(body, [/固定アンカー.*変えない/, /部品名.*増やさない/, /49姿勢.*推測しない/,
    /background.*rear-restraints.*entity.*front-restraints/]);
});

test('guide and preview references are explicit, local, bounded to the selected template pack', async () => {
  const body = await reference();
  const stock = JSON.parse(await text(new URL(pack + 'stock.json', root)));
  const guideFiles = ['all', 'entity', 'restraints', 'background'].flatMap(role => ['png', 'svg'].map(ext => `guide-${role}.${ext}`));
  const expected = [...stock.files.map(f => f.file), ...guideFiles, 'template.json', 'stock.json',
    ...['normal', 'unseal', 'trueform'].map(mode => `preview-${mode}.png`)].sort();
  const actual = links(body).filter(path => path.startsWith('../../../assets/'));
  assert.equal(new Set(actual).size, actual.length);
  assert.deepEqual(actual.map(path => path.split('/').at(-1)).sort(), expected);
  for (const path of actual) {
    const url = new URL(path, referenceUrl);
    assert.ok(url.href.startsWith(new URL(pack, root).href));
    assert.equal(relative(fileURLToPath(new URL(pack, root)), fileURLToPath(url)), path.split('/').at(-1));
  }
  required(body, [/参照.*解決できない/, /推測.*続行しない/, /読取専用/, /標準.*プレビュー.*新作.*証拠.*ではない/]);
});

test('native app acceptance and packaging remain explicitly unqualified integration work', async () => {
  required(section(await reference(), '統合と未確認範囲'), [/Codex.*Claude Code/, /実機.*未確認/, /同梱.*配布/, /manifest.*親側/,
    /画像生成.*プレビュー.*読込.*保存/, /構造.*テスト.*挙動.*証明.*ではない/]);
  required(await reference(), [/本体だけ.*希望.*済み/, /画像生成機能がない/, /比較.*悪化/, /テンプレート.*欠落/]);
});

// Binary-link existence is deliberately separate from the dependency-free
// authoring contracts so partial checkouts cannot masquerade as packaged assets.
test('bundled asset links resolve to real files in a complete checkout', async () => {
  for (const path of links(await reference()).filter(link => link.startsWith('../../../assets/'))) {
    assert.ok((await stat(new URL(path, referenceUrl))).isFile(), path);
  }
});
