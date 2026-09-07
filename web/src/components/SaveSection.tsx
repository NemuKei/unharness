import type { FixtureController } from "../useFixtureController";
import type { Favorite } from "../types";

export function SaveSection({
  controller,
}: {
  controller: Pick<
    FixtureController,
    "name" | "setName" | "busy" | "canChange" | "mutate"
  >;
}) {
  const { name, setName, busy, canChange, mutate } = controller;
  return (
    <section className="control-section save-section">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void mutate<Favorite>(
            "/save",
            { name: name.trim() || null },
            "現在の準備済み設定をお気に入りに保存しました。",
          );
        }}
      >
        <label htmlFor="favorite-name">
          保存名 <span>任意</span>
        </label>
        <input
          id="favorite-name"
          value={name}
          maxLength={120}
          onChange={(event) => setName(event.target.value)}
          placeholder="例：いつもの確認条件"
          disabled={!!busy}
        />
        <button className="secondary wide" disabled={!canChange} type="submit">
          <span className="star" aria-hidden="true">
            ☆
          </span>{" "}
          {busy === "/save" ? "保存中…" : "今の設定をお気に入りに保存"}
        </button>
        <p className="tiny">
          保存するのは現在の準備状態です。選択プレビューとは異なる場合があります。
        </p>
      </form>
    </section>
  );
}
