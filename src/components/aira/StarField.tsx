"use client";

import { Sparkles } from "@react-three/drei";
import { useMemo, useRef } from "react";
import { AdditiveBlending, CanvasTexture, type Points } from "three";
import { useFrame } from "@react-three/fiber";

function radialTexture(inner: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) return new CanvasTexture(canvas);
  const gradient = context.createRadialGradient(128, 128, 8, 128, 128, 128);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(0.45, inner.replace("0.55", "0.16").replace("0.7", "0.2"));
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);
  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function starPositions(count: number, radius: number, spread: number) {
  const positions = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    const distance = radius + Math.random() * spread;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[index * 3] = distance * Math.sin(phi) * Math.cos(theta);
    positions[index * 3 + 1] = distance * Math.cos(phi) * 0.72;
    positions[index * 3 + 2] = distance * Math.sin(phi) * Math.sin(theta);
  }
  return positions;
}

function StarLayer({ count, size, radius, spread }: { count: number; size: number; radius: number; spread: number }) {
  const points = useRef<Points>(null);
  const positions = useMemo(() => starPositions(count, radius, spread), [count, radius, spread]);
  useFrame((_, delta) => {
    if (points.current) points.current.rotation.y += delta * 0.004;
  });
  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#d5e6ff" size={size} sizeAttenuation transparent opacity={0.85} depthWrite={false} />
    </points>
  );
}

export function StarField({ mobile }: { mobile: boolean }) {
  const clouds = useMemo(() => [
    radialTexture("rgba(48, 92, 180, 0.55)"),
    radialTexture("rgba(120, 64, 150, 0.45)"),
    radialTexture("rgba(40, 130, 170, 0.4)")
  ], []);

  return (
    <group>
      <StarLayer count={mobile ? 700 : 2400} size={mobile ? 0.045 : 0.055} radius={40} spread={150} />
      <StarLayer count={mobile ? 180 : 500} size={0.11} radius={18} spread={36} />
      <mesh position={[-28, 10, -40]} rotation={[0, 0.4, 0]}>
        <planeGeometry args={[46, 28]} />
        <meshBasicMaterial map={clouds[0]} transparent depthWrite={false} blending={AdditiveBlending} opacity={0.55} />
      </mesh>
      <mesh position={[24, 6, -52]}>
        <planeGeometry args={[38, 22]} />
        <meshBasicMaterial map={clouds[1]} transparent depthWrite={false} blending={AdditiveBlending} opacity={0.4} />
      </mesh>
      <mesh position={[8, -2, -30]}>
        <planeGeometry args={[22, 12]} />
        <meshBasicMaterial map={clouds[2]} transparent depthWrite={false} blending={AdditiveBlending} opacity={0.28} />
      </mesh>
      <Sparkles count={mobile ? 30 : 90} scale={[36, 14, 48]} size={mobile ? 1.4 : 2} speed={0.22} color="#b7dcff" opacity={0.55} position={[0, 4, 8]} />
    </group>
  );
}
