import { Interactive, interpolate, useCurrentFrame } from "remotion";
import { Headline, mint } from "../components/Design";
export function Hook() {
  const frame = useCurrentFrame();
  return (
    <>
      <Headline eyebrow="YOUR AI. YOUR LOADOUT.">
        モデルは変わった。
        <br />
        <span
          style={{
            color: mint,
            opacity: interpolate(frame, [7, 21], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          装備は、そのまま？
        </span>
      </Headline>
      <Interactive.Div
        name="Opening thought"
        style={{
          position: "absolute",
          left: 84,
          bottom: 130,
          fontSize: 42,
          color: "#e4e9df",
          fontWeight: 700,
          opacity: interpolate(frame, [31, 46], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        書き直す前に、一度外してみる。
      </Interactive.Div>
    </>
  );
}
