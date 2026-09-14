import { Easing, Interactive, interpolate, useCurrentFrame } from "remotion";
import { Headline, mint, StarIcon } from "../components/Design";
export function Favorite() {
  const frame = useCurrentFrame();
  return (
    <>
      <Headline eyebrow="04 / SAVE WHAT FITS">
        合う組み合わせを、
        <br />
        <span style={{ color: mint }}>また使おう。</span>
      </Headline>
      <Interactive.Div
        name="Favorite saved"
        style={{
          position: "absolute",
          left: 84,
          right: 84,
          bottom: 170,
          padding: "30px 38px",
          background: "rgba(6,17,22,.94)",
          border: "1px solid #887950",
          display: "flex",
          alignItems: "center",
          gap: 30,
          scale: interpolate(frame, [14, 38], [0.97, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.spring({ damping: 200 }),
            output: "perceptual-scale",
          }),
        }}
      >
        <StarIcon size={64} filled={frame > 67} />
        <div>
          <div style={{ fontSize: 29, color: "#bbaa84", marginBottom: 6 }}>
            お気に入り
          </div>
          <span style={{ fontSize: 50, fontWeight: 800 }}>UNSEAL</span>
          <span style={{ fontSize: 37, marginLeft: 28, color: mint }}>
            {frame > 67 ? "保存しました" : "この構成を保存"}
          </span>
        </div>
      </Interactive.Div>
    </>
  );
}
