import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const sampleRate = 48000,
  seconds = 32,
  frames = sampleRate * seconds,
  audio = new Float64Array(frames * 2);
const tau = Math.PI * 2;
const mix = (i, value, pan = 0) => {
  audio[i * 2] += value * Math.sqrt((1 - pan) / 2);
  audio[i * 2 + 1] += value * Math.sqrt((1 + pan) / 2);
};
let seed = 0x756e6872;
const noise = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 2147483648 - 1;
};
// Original tonal sound design. No external music, samples or model calls.
for (let i = 0; i < frames; i++) {
  const t = i / sampleRate;
  const fade = Math.min(1, t / 0.6, Math.max(0, (seconds - t) / 1.2));
  const chord =
    t < 8
      ? [73.416, 110, 146.832, 164.814]
      : t < 15
        ? [87.307, 130.813, 174.614, 220]
        : t < 23
          ? [65.406, 98, 130.813, 164.814]
          : [73.416, 110, 146.832, 220];
  chord.forEach((f, j) => {
    const value =
      (Math.sin(tau * f * t) +
        0.24 * Math.sin(tau * (f * 1.003) * t) +
        0.1 * Math.sin(tau * f * 2 * t)) *
      0.027 *
      fade *
      (0.75 + 0.25 * Math.sin(t * 0.31 + j));
    mix(i, value, (j - 1.5) * 0.28);
  });
  const beat = t % 0.6,
    pulse = Math.exp(-beat * 12);
  mix(i, Math.sin(tau * 36.708 * t) * pulse * 0.055 * fade);
  const tick = t % 1.2;
  if (tick < 0.09) mix(i, noise() * 0.025 * Math.exp(-tick * 60) * fade, 0.25);
}
const cues = [0.1, 4, 8, 10, 12.8, 15, 18, 19.2, 22, 23, 25, 27];
for (let n = 0; n < cues.length; n++) {
  const start = cues[n],
    duration = n === 0 ? 0.7 : 0.45;
  for (let k = 0; k < sampleRate * duration; k++) {
    const t = k / sampleRate,
      i = Math.floor(start * sampleRate) + k;
    if (i >= frames) break;
    const e = Math.sin((Math.PI * t) / duration) * Math.exp(-t * 5);
    const f = n % 3 === 0 ? 280 : 440;
    mix(
      i,
      (Math.sin(tau * (f * t - 80 * t * t)) * 0.055 + noise() * 0.035) * e,
      (n % 2 ? 1 : -1) * 0.22,
    );
  }
}
for (const start of [5.4, 21.3])
  for (let k = 0; k < sampleRate * 0.8; k++) {
    const t = k / sampleRate,
      i = Math.floor(start * sampleRate) + k;
    const e = (1 - Math.exp(-t * 70)) * Math.exp(-t * 7);
    mix(
      i,
      (Math.sin(tau * 880 * t) + 0.5 * Math.sin(tau * 1320 * t)) * 0.052 * e,
      0.05,
    );
  }
const peak = Math.max(
  ...[...Array(64)].map((_, n) => {
    let p = 0;
    for (let i = n; i < audio.length; i += 64)
      p = Math.max(p, Math.abs(audio[i]));
    return p;
  }),
);
const gain = 0.5 / peak,
  pcm = Buffer.alloc(frames * 4);
for (let i = 0; i < audio.length; i++)
  pcm.writeInt16LE(
    Math.round(Math.max(-1, Math.min(1, audio[i] * gain)) * 32767),
    i * 2,
  );
const header = Buffer.alloc(44);
header.write("RIFF");
header.writeUInt32LE(36 + pcm.length, 4);
header.write("WAVEfmt ", 8);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(2, 22);
header.writeUInt32LE(sampleRate, 24);
header.writeUInt32LE(sampleRate * 4, 28);
header.writeUInt16LE(4, 32);
header.writeUInt16LE(16, 34);
header.write("data", 36);
header.writeUInt32LE(pcm.length, 40);
const dir = fileURLToPath(new URL("../public/audio/", import.meta.url));
await mkdir(dir, { recursive: true });
await writeFile(dir + "unharness-original.wav", Buffer.concat([header, pcm]));
console.log("Original 32-second stereo soundtrack prepared. Peak: -6 dBFS.");
