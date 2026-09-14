import { useCurrentFrame } from "remotion";
import { Headline, mint } from "../components/Design";
export function Appearance() {
  const frame = useCurrentFrame();
  return (
    <>
      <Headline eyebrow="AND / MAKE IT YOUR OWN">
        見た目も、
        <br />
        <span style={{ color: mint }}>自分らしく。</span>
      </Headline>
      <div
        style={{
          position: "absolute",
          left: 84,
          right: 84,
          bottom: 164,
          display: "flex",
          alignItems: "center",
          gap: 18,
        }}
      >
        <span style={{ fontSize: 32, color: "#a5bbb5", marginRight: 14 }}>
          APPEARANCE
        </span>
        {["白銀", "琥珀"].map((x, i) => (
          <div
            key={x}
            style={{
              fontSize: 40,
              padding: "14px 42px",
              border: `1px solid ${i === (frame < 60 ? 0 : 1) ? "#baf8e8" : "#4a5e5a"}`,
              color: i === (frame < 60 ? 0 : 1) ? "#baf8e8" : "#889e9a",
              background: "#071419dd",
            }}
          >
            {x}
          </div>
        ))}
      </div>
      <div
        style={{
          position: "absolute",
          left: 84,
          bottom: 103,
          fontSize: 32,
          color: "#bfceca",
        }}
      >
        好きな姿を、性能の評価に関係なく。
      </div>
    </>
  );
}
