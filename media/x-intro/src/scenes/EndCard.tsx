import { Easing, Interactive, interpolate, useCurrentFrame } from "remotion";
import { mint } from "../components/Design";
export function EndCard() {
  const frame = useCurrentFrame();
  return (
    <>
      <Interactive.Div
        name="Unharness wordmark"
        style={{
          position: "absolute",
          left: 80,
          top: 237,
          fontSize: 116,
          fontWeight: 850,
          letterSpacing: -4,
          color: "#f6f7f0",
          translate: interpolate(frame, [0, 21], ["0px 20px", "0px 0px"], {
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        Unharness
      </Interactive.Div>
      <Interactive.Div
        name="Brand promise"
        style={{
          position: "absolute",
          left: 84,
          top: 391,
          width: 900,
          fontSize: 84,
          lineHeight: 1.25,
          fontWeight: 800,
          color: mint,
        }}
      >
        あなたのAIに、
        <br />
        合う装備を。
      </Interactive.Div>
      <Interactive.Div
        name="Try the demo"
        style={{
          position: "absolute",
          left: 84,
          right: 84,
          bottom: 292,
          height: 116,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 30,
          background: "#c33e20",
          border: "1px solid #ff7e59",
          fontSize: 49,
          fontWeight: 750,
          color: "#fff7ee",
          opacity: interpolate(frame, [18, 33], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        無料でデモを試す <span style={{ fontSize: 54 }}>↗</span>
      </Interactive.Div>
      <div
        style={{
          position: "absolute",
          left: 84,
          right: 84,
          bottom: 222,
          textAlign: "center",
          fontSize: 32,
          color: "#d0dcd8",
        }}
      >
        Apple Silicon Mac × Codex Desktop
      </div>
      <div
        style={{
          position: "absolute",
          left: 84,
          right: 84,
          bottom: 136,
          textAlign: "center",
          fontSize: 39,
          fontWeight: 600,
          letterSpacing: 0.5,
          color: mint,
        }}
      >
        unharness.deltahelmlab.com
      </div>
    </>
  );
}
