import { useEffect, useRef, useState } from "react";
import artwork from "../assets/hangar-states-v1.png";
import type { FixtureCase } from "./types";
import type { Scene } from "./renderer";
import type { AppearancePresentation } from "./appearances";
export function Hangar({
  condition,
  effects,
  appearance = null,
}: {
  condition: FixtureCase;
  effects: boolean;
  appearance?: AppearancePresentation | null;
}) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<Scene | null>(null);
  const conditionRef = useRef(condition);
  conditionRef.current = condition;
  const effectsRef = useRef(effects);
  effectsRef.current = effects;
  const appearanceRef = useRef(appearance);
  appearanceRef.current = appearance;
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
      .then((renderer) => {
        if (!renderer) return;
        if (controller.signal.aborted) {
          renderer.destroy();
          return;
        }
        scene.current = renderer;
        renderer.setAppearance(appearanceRef.current?.recipe ?? null, appearanceRef.current?.treatment);
        renderer.setCondition(conditionRef.current, true);
        syncPlayback();
        setGraphicsState("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setGraphicsState("failed");
      });
    return () => {
      controller.abort();
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
    scene.current?.setAppearance(appearance?.recipe ?? null, appearance?.treatment);
  }, [appearance]);
  return (
    <div className="hangar-scene">
      <div className={`static-scene frame-${condition}`} aria-hidden="true" hidden={appearance !== null && graphicsState === 'failed'}>
        <img src={artwork} alt="" />
      </div>
      <div className="pixi-host" ref={host} />
      <span className="scene-indicator">
        {graphicsState === "loading"
          ? "描画を準備中…"
          : graphicsState === "failed"
          ? "静止画表示 · 操作は利用できます"
          : reduced
            ? "静止画表示 · 動きを減らす設定"
            : effects
              ? moving ? "変形中 · プレビュー" : "待機モーション · プレビュー"
              : "静止画表示"}
      </span>
    </div>
  );
}
