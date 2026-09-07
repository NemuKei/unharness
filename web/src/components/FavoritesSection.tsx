import type { FixtureController } from "../useFixtureController";
import { conditions, shortId } from "../types";

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
        <span>設定内容を保存した版</span>
      </div>
      {favorites.length ? (
        <ul className="record-list">
          {favorites.map((favorite) => (
            <li key={favorite.favoriteId}>
              <button
                aria-pressed={selected?.favoriteId === favorite.favoriteId}
                disabled={!connected || !!busy}
                onClick={() => void choose(favorite)}
              >
                <span className="star" aria-hidden="true">
                  ☆
                </span>
                <span className="record-name">
                  {favorite.name || conditions[favorite.case].label}
                  <small>
                    {conditions[favorite.case].title} ·{" "}
                    {shortId(favorite.favoriteId)}
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
