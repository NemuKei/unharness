import { useCurrentFrame } from "remotion";
import { Headline, mint, ModeBar } from "../components/Design";
export function Release() {
  const frame = useCurrentFrame();
  return (
    <>
      <Headline eyebrow="02 / TRY A DIFFERENT LOADOUT" accent>
        <span style={{ fontSize: 79 }}>選んだ指示・Skillを、</span>
        <br />
        <span style={{ color: mint }}>外して試す。</span>
      </Headline>
      <ModeBar mode={frame < 78 ? 1 : 2} />
      <div
        style={{
          position: "absolute",
          left: 84,
          right: 84,
          bottom: 108,
          fontSize: 34,
          textAlign: "center",
          color: "#bfd2ce",
        }}
      >
        切り替えた構成は、新しいタスクで。
      </div>
    </>
  );
}
