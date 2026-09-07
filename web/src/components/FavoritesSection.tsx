import type { FixtureController } from "../useFixtureController";
import { conditions } from "../types";

export function FavoritesSection({
  controller,
}: {
  controller: Pick<
    FixtureController,
    | "favorites"
    | "selected"
    | "connected"
    | "busy"
    | "choose"
    | "favoriteCursor"
    | "loadMore"
  >;
}) {
  const {
    favorites,
    selected,
    connected,
    busy,
    choose,
    favoriteCursor,
    loadMore,
  } = controller;
  return (
    <section className="records-section">
      <div className="section-heading">
        <h2>お気に入り</h2>
        <span>保存した設定を、また使う</span>
      </div>
      <p className="muted">
        選ぶと上のプレビューで確認できます。適用するまで、現在の設定は変わりません。
      </p>
      {favorites.length ? (
        <ul className="record-list">
          {favorites.map((favorite) => (
            <li key={favorite.favoriteId}>
              <button
                aria-pressed={selected?.favoriteId === favorite.favoriteId}
                title={`保存版 ${favorite.favoriteId}`}
                disabled={!connected || !!busy}
                onClick={() => void choose(favorite)}
              >
                <span className="star" aria-hidden="true">
                  ☆
                </span>
                <span className="record-name">
                  {favorite.name || conditions[favorite.case].label}
                  <small>
                    {conditions[favorite.case].label}
                  </small>
                </span>
                <span aria-hidden="true">›</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">
          保存版はまだありません。現在の設定から保存できます。
        </p>
      )}
      {favoriteCursor && (
        <button
          className="secondary"
          disabled={!connected || !!busy}
          onClick={() => void loadMore("favorites")}
        >
          さらにお気に入りを読み込む
        </button>
      )}
    </section>
  );
}
