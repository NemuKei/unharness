import { Interactive, interpolate, useCurrentFrame, Easing } from "remotion";
import { Headline, mint, CheckIcon } from "../components/Design";
export function SaveNormal() {
  const frame = useCurrentFrame();
  return (
    <>
      <Headline eyebrow="01 / KEEP YOUR STARTING POINT">
        いつもの構成を、
        <br />
        <span style={{ color: mint }}>保存。</span>
      </Headline>
      <Interactive.Div
        name="Saved Normal"
        style={{
          position: "absolute",
          left: 84,
          right: 84,
          bottom: 168,
          display: "flex",
          alignItems: "center",
          gap: 30,
          padding: "32px 36px",
          background: "rgba(7,20,25,.94)",
          border: "1px solid #64817b",
          boxShadow: "0 12px 65px #0008",
          translate: interpolate(frame, [12, 37], ["0px 40px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        <CheckIcon size={58} />
        <div>
          <div style={{ fontSize: 27, color: "#93ada8", letterSpacing: 2 }}>
            SAVED LOADOUT
          </div>
          <div style={{ fontSize: 54, fontWeight: 750, color: mint }}>
            Normal{" "}
            <span style={{ fontSize: 38, color: "#edf1e8", fontWeight: 500 }}>
              を保存しました
            </span>
          </div>
        </div>
      </Interactive.Div>
    </>
  );
}
