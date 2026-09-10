export const WORLD = 724;

// Source-coordinate masks retain the original painted hardware. The same pixels
// and masks appear in every cel; no frame can invent a different armor or cable.
const leftArms = [
  {
    group: "upper", pivot: [0, 273],
    solid: [0, 253, 48, 253, 68, 270, 100, 306, 114, 315, 112, 327, 99, 327, 60, 291, 45, 280, 0, 278],
    polygon: [0, 241, 50, 244, 74, 264, 101, 294, 118, 307, 123, 314, 136, 317,
      153, 317, 171, 316, 190, 315, 207, 305, 222, 289, 240, 270, 268, 239,
      280, 245, 274, 255, 248, 283, 230, 306, 211, 322, 194, 330, 175, 335,
      153, 335, 132, 334, 118, 330, 110, 338, 97, 331, 72, 312, 55, 291, 40, 281, 0, 280],
  },
  {
    group: "middle", pivot: [0, 386],
    solid: [0, 362, 42, 364, 66, 382, 82, 389, 66, 404, 36, 412, 0, 405],
    polygon: [0, 347, 44, 350, 68, 367, 88, 375, 109, 384, 131, 396, 150, 401,
      170, 403, 190, 402, 208, 396, 231, 386, 242, 386, 247, 398, 216, 410,
      194, 416, 171, 419, 149, 417, 128, 411, 107, 400, 90, 391, 68, 393,
      59, 410, 30, 415, 0, 410],
  },
  {
    group: "lower", pivot: [103, 623],
    solid: [98, 615, 103, 572, 130, 532, 148, 516, 175, 510, 192, 500, 208, 500, 204, 515, 173, 528, 151, 545, 127, 583, 118, 620],
    polygon: [91, 624, 95, 575, 119, 528, 149, 501, 191, 495, 243, 462,
      261, 479, 212, 518, 158, 536, 133, 578, 122, 628],
  },
]         ;

export const sourceArms = [-1, 1].flatMap(side => leftArms.map(arm => ({
  id: `${side < 0 ? "left" : "right"}-${arm.group}`,
  group: arm.group,
  side,
  pivot: { x: side < 0 ? arm.pivot[0] : WORLD - arm.pivot[0], y: arm.pivot[1] },
  polygon: arm.polygon.map((coordinate, index) => index % 2 === 0 && side > 0 ? WORLD - coordinate : coordinate),
  solid: arm.solid.map((coordinate, index) => index % 2 === 0 && side > 0 ? WORLD - coordinate : coordinate),
})));

export const capsuleMask = [
  355, 164, 369, 164, 539, 370, 539, 398, 372, 575,
  350, 575, 183, 397, 183, 355,
];
export const coreBounds = { x: 216, y: 48, width: 292, height: 527 };
export const coreNucleus = { x: 362, y: 330 };
export const coreMask = [
  362, 48, 455, 154, 507, 292, 478, 380, 408, 456,
  382, 575, 341, 575, 315, 456, 242, 391, 216, 300, 270, 154,
];
