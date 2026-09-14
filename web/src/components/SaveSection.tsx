import { text as t } from '../locale.ts';
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
            t("現在の準備済み設定をお気に入りに保存しました。", "Saved the currently prepared settings as a favorite."),
          );
        }}
      >
        <label htmlFor="favorite-name">
          {t("保存名 ", "Name ")}<span>{t("任意", "Optional")}</span>
        </label>
        <input
          id="favorite-name"
          value={name}
          maxLength={120}
          onChange={(event) => setName(event.target.value)}
          placeholder={t("例：いつもの確認条件", "Example: My usual comparison")}
          disabled={!!busy}
        />
        <button className="secondary wide" disabled={!canChange} type="submit">
          <span className="star" aria-hidden="true">
            ☆
          </span>{" "}
          {busy === "/save" ? t("保存中…", "Saving…") : t("今の設定をお気に入りに保存", "Save current settings as a favorite")}
        </button>
        <p className="tiny">
          {t("保存するのは現在の準備状態です。選択プレビューとは異なる場合があります。", "Save the currently prepared state, which may differ from the selected preview.")}</p>
      </form>
    </section>
  );
}
