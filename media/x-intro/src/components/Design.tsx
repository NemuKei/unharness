import { Easing, Interactive, interpolate, useCurrentFrame } from "remotion";
import type { ReactNode } from "react";
export const mint = "#baf8e8",
  orange = "#ff6542",
  paper = "#f6f7f0";
export function Headline({
  children,
  eyebrow,
  accent = false,
}: {
  children: ReactNode;
  eyebrow: string;
  accent?: boolean;
}) {
  const frame = useCurrentFrame();
  return (
    <>
      <Interactive.Div
        name="Scene label"
        style={{
          position: "absolute",
          left: 84,
          top: 170,
          fontSize: 26,
          fontWeight: 600,
          letterSpacing: 5,
          color: accent ? "#ffa878" : "#98b1b0",
          opacity: interpolate(frame, [0, 10], [0.65, 1], {
            extrapolateRight: "clamp",
          }),
        }}
      >
        {eyebrow}
      </Interactive.Div>
      <Interactive.Div
        name="Headline"
        style={{
          position: "absolute",
          left: 80,
          top: 226,
          width: 920,
          fontSize: 88,
          lineHeight: 1.22,
          fontWeight: 850,
          letterSpacing: -2,
          color: paper,
          translate: interpolate(frame, [0, 19], ["0px 20px", "0px 0px"], {
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        {children}
      </Interactive.Div>
    </>
  );
}
export function BottomLine({ children }: { children: ReactNode }) {
  const frame = useCurrentFrame();
  return (
    <Interactive.Div
      name="Supporting line"
      style={{
        position: "absolute",
        left: 84,
        right: 84,
        bottom: 130,
        fontSize: 42,
        fontWeight: 600,
        lineHeight: 1.5,
        color: "#d9e9e4",
        opacity: interpolate(frame, [12, 30], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
      }}
    >
      {children}
    </Interactive.Div>
  );
}
export function CheckIcon({ size = 42 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="14" stroke={mint} strokeWidth="1.5" />
      <path
        d="m9 16 5 5 9-10"
        stroke={mint}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
export function StarIcon({
  size = 46,
  filled = false,
}: {
  size?: number;
  filled?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill={filled ? "#ffd889" : "none"}
    >
      <path
        d="m16 3 4 8.5 9.5 1.2-7 6.5 1.8 9.3L16 24l-8.3 4.5 1.8-9.3-7-6.5L12 11.5Z"
        stroke="#ffd889"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}
export function ModeBar({ mode }: { mode: 0 | 1 | 2 }) {
  return (
    <div
      style={{
        position: "absolute",
        left: 84,
        right: 84,
        bottom: 174,
        display: "flex",
        height: 110,
        background: "rgba(5,14,19,.88)",
        border: "1px solid #3a514f",
      }}
    >
      {(["Normal", "UNSEAL", "TRUEFORM"] as const).map((label, i) => (
        <div
          key={label}
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 7,
            borderTop: `3px solid ${mode === i ? orange : "transparent"}`,
            color: mode === i ? paper : "#69817f",
            background: mode === i ? "rgba(199,57,23,.16)" : "transparent",
            fontSize: 32,
            fontWeight: 700,
          }}
        >
          {label}
          <span
            style={{
              fontSize: 23,
              fontWeight: 500,
              color: mode === i ? mint : "#69817f",
            }}
          >
            {["通常", "限定解除", "零式"][i]}
          </span>
        </div>
      ))}
    </div>
  );
}
