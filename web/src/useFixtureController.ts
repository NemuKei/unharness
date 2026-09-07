import { useEffect, useRef, useState } from "react";
import { Api, ApiError, errorMessage, RequestGeneration } from "./api";
import {
  operationFailure,
  submitOperation,
  refreshCheckpointPage,
} from "./operations";
import { conditions } from "./types";
import type {
  State,
  Favorite,
  Checkpoint,
  Plan,
  FavoritePage,
  CheckpointPage,
  Envelope,
  Application,
  FixtureCase,
} from "./types";
function displayPreference() {
  try {
    return localStorage.getItem("unharness.effects.v1") !== "off";
  } catch {
    return false;
  }
}

export function useFixtureController() {
  const api = useRef(new Api()).current;
  const planGeneration = useRef(new RequestGeneration()).current;
  const alive = useRef(true);
  const busyRef = useRef(false);
  const [state, setState] = useState<State | null>(null);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("ローカルの検証環境に接続しています。");
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [favoriteCursor, setFavoriteCursor] = useState<string | null>(null);
  const [checkpointCursor, setCheckpointCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<Favorite | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planning, setPlanning] = useState(false);
  const [name, setName] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [effects, setEffects] = useState(displayPreference);
  const [recoveryId, setRecoveryId] = useState<string | null>(null);
  const [checkpointError, setCheckpointError] = useState("");
  const shownCase: FixtureCase =
    selected?.case ?? state?.current?.case ?? "baseline";
  const condition = conditions[shownCase];
  const canChange = connected && !busy && !!state?.current && !state.conflict;

  function invalidatePlan() {
    planGeneration.next();
    setPlan(null);
    setPlanning(false);
  }
  function reportError(reason: unknown) {
    setError(errorMessage(reason));
    if (reason instanceof ApiError && reason.checkpointId)
      setRecoveryId(reason.checkpointId);
    if (operationFailure(reason).connection === "unconfirmed")
      setConnected(false);
  }
  async function refresh() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy("refresh");
    invalidatePlan();
    setError("");
    try {
      await api.connect();
      const [next, saved, recovery] = await Promise.all([
        api.get<State>("/state"),
        api.get<FavoritePage>("/favorites"),
        api.get<CheckpointPage>("/checkpoints"),
      ]);
      if (!alive.current) return;
      setState(next);
      setFavorites(saved.favorites);
      setFavoriteCursor(saved.nextCursor);
      setCheckpoints(recovery.checkpoints);
      setCheckpointCursor(recovery.nextCursor);
      setCheckpointError("");
      setConnected(true);
      setNotice("準備状態を取得しました。選択後に変更計画を確認できます。");
    } catch (reason) {
      if (alive.current) {
        setConnected(false);
        reportError(reason);
      }
    } finally {
      busyRef.current = false;
      if (alive.current) setBusy(null);
    }
  }
  useEffect(() => {
    alive.current = true;
    void refresh();
    return () => {
      alive.current = false;
      planGeneration.next();
    };
  }, []);

  async function choose(favorite: Favorite) {
    if (busyRef.current || !connected) return;
    setSelected(favorite);
    setPlan(null);
    setPlanning(true);
    setError("");
    const generation = planGeneration.next();
    try {
      const response = await api.post<Envelope<Plan>>("/plan", {
        favoriteId: favorite.favoriteId,
      });
      if (!alive.current || !planGeneration.isCurrent(generation)) return;
      setState(response.state);
      setPlan(response.result);
      setNotice(
        "選択した保存版の変更計画です。適用すると次のタスク向けの設定を準備します。",
      );
    } catch (reason) {
      if (alive.current && planGeneration.isCurrent(generation))
        reportError(reason);
    } finally {
      if (alive.current && planGeneration.isCurrent(generation))
        setPlanning(false);
    }
  }
  async function mutate<T>(route: string, body: object, message: string) {
    if (busyRef.current || !connected) return;
    busyRef.current = true;
    setBusy(route);
    invalidatePlan();
    setError("");
    setNotice("操作中です。完了までお待ちください。");
    try {
      const outcome = await submitOperation<T>(api, route, body);
      if (!alive.current) return;
      if (outcome.status !== "confirmed") {
        setError(outcome.message);
        setNotice(outcome.notice);
        if (outcome.checkpointId) setRecoveryId(outcome.checkpointId);
        if (outcome.connection === "unconfirmed") setConnected(false);
        return;
      }
      const { response } = outcome;
      setState(response.state);
      setNotice(message);
      if (route === "/save") {
        const saved = response.result as Favorite;
        setFavorites((current) => [
          saved,
          ...current.filter((item) => item.favoriteId !== saved.favoriteId),
        ]);
        setName("");
      }
      if (route === "/apply" || route === "/restore-checkpoint") {
        setRecoveryId((response.result as Application).checkpointId);
        setBusy("checkpoints");
        await readCheckpointPage();
      }
    } finally {
      busyRef.current = false;
      if (alive.current) setBusy(null);
    }
  }
  async function readCheckpointPage() {
    const listing = await refreshCheckpointPage(api);
    if (!alive.current) return;
    if (listing.status === "current") {
      setCheckpoints(listing.page.checkpoints);
      setCheckpointCursor(listing.page.nextCursor);
      setCheckpointError("");
    } else {
      setCheckpointError(listing.message);
      if (listing.connection === "unconfirmed") {
        setConnected(false);
        invalidatePlan();
      }
    }
  }
  async function reloadCheckpoints() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy("checkpoints");
    try {
      await readCheckpointPage();
    } finally {
      busyRef.current = false;
      if (alive.current) setBusy(null);
    }
  }
  async function loadMore(kind: "favorites" | "checkpoints") {
    const cursor = kind === "favorites" ? favoriteCursor : checkpointCursor;
    if (!cursor || busyRef.current || !connected) return;
    busyRef.current = true;
    setBusy(kind);
    setError("");
    try {
      if (kind === "favorites") {
        const page = await api.get<FavoritePage>(
          `/favorites?after=${encodeURIComponent(cursor)}`,
        );
        if (!alive.current) return;
        setFavorites((current) => [
          ...current,
          ...page.favorites.filter(
            (item) =>
              !current.some((known) => known.favoriteId === item.favoriteId),
          ),
        ]);
        setFavoriteCursor(page.nextCursor);
      } else {
        const page = await api.get<CheckpointPage>(
          `/checkpoints?after=${encodeURIComponent(cursor)}`,
        );
        if (!alive.current) return;
        setCheckpoints((current) => [
          ...current,
          ...page.checkpoints.filter(
            (item) =>
              !current.some(
                (known) => known.checkpointId === item.checkpointId,
              ),
          ),
        ]);
        setCheckpointCursor(page.nextCursor);
      }
    } catch (reason) {
      if (alive.current) reportError(reason);
    } finally {
      busyRef.current = false;
      if (alive.current) setBusy(null);
    }
  }
  function setDisplayEffects(value: boolean) {
    setEffects(value);
    try {
      localStorage.setItem("unharness.effects.v1", value ? "on" : "off");
    } catch {
      /* Optional display preference. */
    }
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice("クリップボードにコピーしました。");
    } catch {
      setError(
        "コピーできませんでした。表示されたテキストを選択してコピーしてください。",
      );
    }
  }
  const observationText = state?.observation
    ? {
        "matched-record": "記録内の検証用入力が一致しました。",
        "not-matched-record": "記録内の検証用入力が一致しませんでした。",
        "unqualified-record": "この記録は確認条件を満たしていません。",
      }[state.observation.fixtureMarkerCheck]
    : "タスクの記録はまだ確認していません。";

  return {
    state,
    connected,
    busy,
    error,
    notice,
    favorites,
    checkpoints,
    favoriteCursor,
    checkpointCursor,
    selected,
    plan,
    planning,
    name,
    setName,
    sessionId,
    setSessionId,
    effects,
    recoveryId,
    checkpointError,
    shownCase,
    condition,
    canChange,
    refresh,
    choose,
    mutate,
    loadMore,
    reloadCheckpoints,
    setDisplayEffects,
    copy,
    observationText,
  };
}
export type FixtureController = ReturnType<typeof useFixtureController>;
