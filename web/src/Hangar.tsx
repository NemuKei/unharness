import { useEffect, useRef, useState } from 'react';
import artwork from '../assets/hangar-states-v1.png';
import type { FixtureCase } from './types';
import type { Scene } from './renderer';
export function Hangar({ condition, effects }: { condition: FixtureCase; effects: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<Scene | null>(null);
  const conditionRef = useRef(condition); conditionRef.current = condition;
  const effectsRef = useRef(effects); effectsRef.current = effects;
  const [graphicsState, setGraphicsState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const syncPlayback = () => { setReduced(media.matches); scene.current?.setEffects(effectsRef.current && !media.matches && !document.hidden); };
    syncPlayback(); media.addEventListener('change', syncPlayback); document.addEventListener('visibilitychange', syncPlayback);
    // Import starts after the semantic controls have mounted. No renderer owns configuration state.
    void import('./renderer').then(module => module.createScene(host.current!, controller.signal)).then(renderer => {
      if (!renderer) return;
      if (controller.signal.aborted) { renderer.destroy(); return; }
      scene.current = renderer; renderer.setCondition(conditionRef.current); syncPlayback(); setGraphicsState('ready');
    }).catch(() => { if (!controller.signal.aborted) setGraphicsState('failed'); });
    return () => { controller.abort(); media.removeEventListener('change', syncPlayback); document.removeEventListener('visibilitychange', syncPlayback); scene.current?.destroy(); scene.current = null; };
  }, []);
  useEffect(() => { scene.current?.setCondition(condition); }, [condition]);
  useEffect(() => { scene.current?.setEffects(effects && !matchMedia('(prefers-reduced-motion: reduce)').matches && !document.hidden); }, [effects]);
  return <div className="hangar-scene"><div className={`static-scene frame-${condition}`} aria-hidden="true"><img src={artwork} alt=""/></div><div className="pixi-host" ref={host}/><span className="scene-indicator">{graphicsState === 'failed' ? '静止画表示 · 操作は利用できます' : reduced ? '静止画表示 · 動きを減らす設定' : effects ? '演出プレビュー' : '静止画表示'}</span></div>;
}
