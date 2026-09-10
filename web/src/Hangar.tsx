import { useEffect, useRef, useState } from "react";
import fallbackArtwork from "../assets/hangar-states-v1.png";
import type { FixtureCase } from "./types";
import type { Scene } from "./renderer";
import { setSceneArtwork } from './artwork-render';
import type { ArtworkImageLoader, ArtworkItem } from './artwork';
export function Hangar({
  condition,
  effects,
  artwork = null,
  imageLoader,
}: {
  condition: FixtureCase;
  effects: boolean;
  artwork?: ArtworkItem | null;
  imageLoader?: ArtworkImageLoader;
}) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<Scene | null>(null);
  const conditionRef = useRef(condition);
  conditionRef.current = condition;
  const effectsRef = useRef(effects);
  effectsRef.current = effects;
  const artworkRef = useRef(artwork), loaderRef = useRef(imageLoader), artGeneration = useRef(0);
  artworkRef.current = artwork; loaderRef.current = imageLoader;
  const [graphicsState, setGraphicsState] = useState<
    "loading" | "ready" | "failed"
  >("loading");
  const [reduced, setReduced] = useState(false);
  const [moving, setMoving] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const syncPlayback = () => {
      setReduced(media.matches);
      scene.current?.setEffects(effectsRef.current && !media.matches);
      scene.current?.setVisible(!document.hidden);
    };
    syncPlayback();
    media.addEventListener("change", syncPlayback);
    document.addEventListener("visibilitychange", syncPlayback);
    // Import starts after the semantic controls have mounted. No renderer owns configuration state.
    void import("./renderer")
      .then((module) => {
        const element = host.current;
        if (controller.signal.aborted || !element) return null;
        return module.createScene(element, controller.signal, (active) => {
          if (!controller.signal.aborted) setMoving(active);
        });
      })
      .then(async (renderer) => {
        if (!renderer) return;
        if (controller.signal.aborted) {
          renderer.destroy();
          return;
        }
        scene.current = renderer;
        renderer.setCondition(conditionRef.current, true);
        syncPlayback();
        const generation = ++artGeneration.current;
        try {
          await setSceneArtwork(renderer, artworkRef.current, loaderRef.current);
          if (!controller.signal.aborted && generation === artGeneration.current) setGraphicsState("ready");
        } catch {
          if (!controller.signal.aborted && generation === artGeneration.current) setGraphicsState('failed');
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setGraphicsState("failed");
      });
    return () => {
      controller.abort();
      ++artGeneration.current;
      media.removeEventListener("change", syncPlayback);
      document.removeEventListener("visibilitychange", syncPlayback);
      scene.current?.destroy();
      scene.current = null;
    };
  }, []);
  useEffect(() => {
    scene.current?.setCondition(condition);
  }, [condition]);
  useEffect(() => {
    scene.current?.setEffects(
      effects &&
        !matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
  }, [effects]);
  useEffect(() => {
    const renderer = scene.current;
    if (!renderer) return;
    const generation = ++artGeneration.current;
    setGraphicsState('loading');
    void setSceneArtwork(renderer, artwork, imageLoader)
      .then(() => { if (generation === artGeneration.current) setGraphicsState('ready'); })
      .catch(() => { if (generation === artGeneration.current) setGraphicsState('failed'); });
    return () => { if (generation === artGeneration.current) ++artGeneration.current; };
  }, [artwork?.id, imageLoader]);
  return (
    <div className="hangar-scene">
      <div className={`static-scene frame-${condition}`} aria-hidden="true" hidden={graphicsState === 'ready' || artwork !== null}>
        <img src={fallbackArtwork} alt="" />
      </div>
      <div className="pixi-host" ref={host} style={{ visibility: graphicsState === 'ready' ? 'visible' : 'hidden' }} />
      <span className="scene-indicator">
        {graphicsState === "loading"
          ? "描画を準備中…"
          : graphicsState === "failed"
          ? artwork ? "外観を表示できません · 装備の操作は利用できます" : "静止画表示 · 操作は利用できます"
          : reduced
            ? "静止画表示 · 動きを減らす設定"
            : effects
              ? moving ? "変形中 · プレビュー" : "待機モーション · プレビュー"
              : "静止画表示"}
      </span>
    </div>
  );
}
