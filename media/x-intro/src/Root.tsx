import "./index.css";
import { Composition } from "remotion";
import { Intro } from "./Composition";
export const RemotionRoot = () => (
  <Composition
    id="Unharness-X-Intro"
    component={Intro}
    durationInFrames={960}
    fps={30}
    width={1080}
    height={1350}
  />
);
