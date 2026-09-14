import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  staticFile,
} from "remotion";
import { TransitionSeries } from "@remotion/transitions";
import { Audio } from "@remotion/media";
import { PixiHangar } from "./components/PixiHangar";
import { Hook } from "./scenes/Hook";
import { SaveNormal } from "./scenes/SaveNormal";
import { Release } from "./scenes/Release";
import { Restore } from "./scenes/Restore";
import { Favorite } from "./scenes/Favorite";
import { Appearance } from "./scenes/Appearance";
import { EndCard } from "./scenes/EndCard";
export function Intro() {
  const frame = useCurrentFrame();
  const release = interpolate(
    frame,
    [0, 240, 291, 330, 381, 450, 501, 570, 621, 689, 690, 960],
    [0, 0, 1, 1, 2, 2, 0, 0, 1, 1, 2, 2],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const look =
    frame < 690
      ? "default"
      : frame < 750
        ? "silver-v2"
        : frame < 810
          ? "amber-v2"
          : "default";
  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#061015",
        color: "#f6f7f0",
        fontFamily: '"Hiragino Sans", "Noto Sans JP", sans-serif',
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: frame >= 690 && frame < 810 ? 52 : -54,
          top: frame >= 690 && frame < 810 ? 310 : 190,
          width: frame >= 690 && frame < 810 ? 976 : 1188,
          height: frame >= 690 && frame < 810 ? 976 : 1188,
          opacity: interpolate(
            frame,
            [0, 805, 810, 830],
            [0.95, 0.95, 0.7, 0.42],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          ),
        }}
      >
        <PixiHangar release={release} time={frame / 30} look={look} />
      </div>
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(180deg,#061015 0%,#061015f0 26%,#06101500 48%,#06101500 75%,#061015fa 94%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 84,
          right: 84,
          top: 95,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 28,
          fontWeight: 800,
          letterSpacing: 3,
          color: "#c5d7d1",
        }}
      >
        <span>UNHARNESS</span>
        <span style={{ fontSize: 21, fontWeight: 500, color: "#839c96" }}>
          AI HARNESS TOOL
        </span>
      </div>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={120} name="Opening">
          <Hook />
        </TransitionSeries.Sequence>
        <TransitionSeries.Sequence durationInFrames={120} name="Save Normal">
          <SaveNormal />
        </TransitionSeries.Sequence>
        <TransitionSeries.Sequence
          durationInFrames={210}
          name="UNSEAL to TRUEFORM"
        >
          <Release />
        </TransitionSeries.Sequence>
        <TransitionSeries.Sequence
          durationInFrames={120}
          name="Return to Normal"
        >
          <Restore />
        </TransitionSeries.Sequence>
        <TransitionSeries.Sequence
          durationInFrames={120}
          name="Save a favorite"
        >
          <Favorite />
        </TransitionSeries.Sequence>
        <TransitionSeries.Sequence
          durationInFrames={120}
          name="Choose an appearance"
        >
          <Appearance />
        </TransitionSeries.Sequence>
        <TransitionSeries.Sequence
          durationInFrames={150}
          name="Visit Unharness"
        >
          <EndCard />
        </TransitionSeries.Sequence>
      </TransitionSeries>
      {frame >= 120 && frame < 690 && (
        <div
          style={{
            position: "absolute",
            left: 84,
            bottom: 64,
            fontSize: 22,
            color: "#75938a",
          }}
        >
          操作イメージ
        </div>
      )}
      <div
        style={{
          position: "absolute",
          left: 84,
          right: 84,
          bottom: 36,
          height: 2,
          background: "#20362f",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${(frame / 959) * 100}%`,
            background: "#88cfbb",
          }}
        />
      </div>
      <Audio src={staticFile("audio/unharness-original.wav")} volume={0.7} />
    </AbsoluteFill>
  );
}
