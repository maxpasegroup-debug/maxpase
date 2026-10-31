export type Vec3 = [number, number, number];

export type CameraPose = {
  position: Vec3;
  look: Vec3;
  doors: number;
  lights: number;
  portals: number;
};

const cameraKeys: Array<{ t: number; position: Vec3; look: Vec3 }> = [
  { t: 0, position: [0, 16, 118], look: [0, -8, -8] },
  { t: 0.2, position: [0, 11, 68], look: [0, -1, -2] },
  { t: 0.35, position: [0, 6.5, 36], look: [0, 3.2, 2] },
  { t: 0.46, position: [0, 3.5, 16], look: [0, 3.1, 4] },
  { t: 0.54, position: [0, 2.7, 12.2], look: [0, 2.5, 4] },
  { t: 0.64, position: [0, 2.25, 5.1], look: [0, 2.05, -0.4] },
  { t: 0.72, position: [0, 2.2, 4.7], look: [0, 2.15, -0.6] },
  { t: 0.8, position: [0, 2.2, 4.7], look: [0, 2.15, -0.6] },
  { t: 0.88, position: [0, 2.16, -0.5], look: [0, 2.0, -4.8] },
  { t: 0.93, position: [0, 2.2, -1.6], look: [0, 2.15, -4.8] },
  { t: 0.96, position: [0, 2.2, -1.6], look: [0, 2.15, -4.8] },
  { t: 1, position: [0, 2.48, -5.2], look: [0, 2.2, -13.2] }
];

export function smoothstep(edge0: number, edge1: number, value: number) {
  const span = edge1 - edge0;
  if (span === 0) return value >= edge1 ? 1 : 0;
  const amount = Math.min(1, Math.max(0, (value - edge0) / span));
  return amount * amount * (3 - 2 * amount);
}

function lerp(from: number, to: number, amount: number) {
  return from + (to - from) * amount;
}

function sample(t: number) {
  const clamped = Math.min(1, Math.max(0, t));
  let index = 0;
  while (index < cameraKeys.length - 2 && cameraKeys[index + 1].t < clamped) index += 1;
  const from = cameraKeys[index];
  const to = cameraKeys[Math.min(index + 1, cameraKeys.length - 1)];
  const span = to.t - from.t || 1;
  const amount = smoothstep(0, 1, (clamped - from.t) / span);
  return { from, to, amount };
}

function mixVec(from: Vec3, to: Vec3, amount: number): Vec3 {
  return [lerp(from[0], to[0], amount), lerp(from[1], to[1], amount), lerp(from[2], to[2], amount)];
}

export function roomOpacity(t: number, room: "welcome" | "innovation") {
  if (room === "welcome") return smoothstep(0.66, 0.72, t) * (1 - smoothstep(0.8, 0.86, t));
  return smoothstep(0.875, 0.92, t) * (1 - smoothstep(0.955, 0.985, t));
}

export function poseAt(t: number): CameraPose {
  const { from, to, amount } = sample(t);
  return {
    position: mixVec(from.position, to.position, amount),
    look: mixVec(from.look, to.look, amount),
    doors: smoothstep(0.5, 0.62, t),
    lights: 0.18 + 0.82 * smoothstep(0.28, 0.64, t),
    portals: smoothstep(0.955, 1, t)
  };
}
