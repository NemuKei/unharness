import { Headline, mint, ModeBar } from "../components/Design";
import { interpolate, Interactive, useCurrentFrame } from "remotion";
export function Restore() {
  const frame = useCurrentFrame();
  return (
    <>
      <Headline eyebrow="03 / RETURN WHEN YOU NEED TO">
        いつもの構成へ、
        <br />
        <span style={{ color: mint }}>戻せる。</span>
      </Headline>
      <ModeBar mode={0} />
      <Interactive.Div
        name="Restore confirmation"
        style={{
          position: "absolute",
          left: 84,
          right: 84,
          bottom: 112,
          textAlign: "center",
          fontSize: 34,
          color: mint,
          opacity: interpolate(frame, [49, 65], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        保存したNormalを、また使える。
      </Interactive.Div>
    </>
  );
}
