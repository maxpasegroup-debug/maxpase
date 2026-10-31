"use client";

import type { MutableRefObject } from "react";
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { MeshStandardMaterial } from "three";
import { BuildingEntrance } from "./BuildingEntrance";
import { BuildingInterior } from "./BuildingInterior";
import { poseAt } from "./journey";

type Vec = [number, number, number];

function Metal({ position, args }: { position: Vec; args: Vec }) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={args} />
      <meshStandardMaterial color="#171014" metalness={0.9} roughness={0.28} />
    </mesh>
  );
}

function Glass({ position, args }: { position: Vec; args: Vec }) {
  return (
    <mesh position={position}>
      <boxGeometry args={args} />
      <meshPhysicalMaterial color="#E8D5A5" metalness={0.04} roughness={0.06} transmission={0.62} thickness={0.45} transparent opacity={0.9} />
    </mesh>
  );
}

function Glow({ position, args, color = "#D4AF62" }: { position: Vec; args: Vec; color?: string }) {
  return (
    <mesh position={position}>
      <boxGeometry args={args} />
      <meshStandardMaterial color="#171014" emissive={color} emissiveIntensity={1.7} />
    </mesh>
  );
}

function WindowGrid({ origin, size, floors, columns, axis }: { origin: Vec; size: Vec; floors: number; columns: number; axis: "x" | "z" }) {
  const [width, height] = axis === "z" ? [size[0], size[1]] : [size[2], size[1]];
  const panes = [];
  for (let floor = 0; floor < floors; floor += 1) {
    for (let column = 0; column < columns; column += 1) {
      const across = (column - (columns - 1) / 2) * (width / columns);
      const position: Vec = [
        origin[0] + (axis === "z" ? across : 0),
        origin[1] + (floor - (floors - 1) / 2) * (height / floors),
        origin[2] + (axis === "x" ? across : 0)
      ];
      panes.push(
        <mesh key={`${floor}-${column}`} position={position}>
          <boxGeometry args={axis === "z" ? [width / columns * 0.62, height / floors * 0.48, 0.05] : [0.05, height / floors * 0.48, width / columns * 0.62]} />
          <meshStandardMaterial color="#39040D" emissive="#D4AF62" emissiveIntensity={0.45} metalness={0.35} roughness={0.18} />
        </mesh>
      );
    }
  }
  return <group>{panes}</group>;
}

export function AiraBuilding({ progress }: { progress: MutableRefObject<{ t: number }> }) {
  const crown = useRef<MeshStandardMaterial>(null);

  useFrame(() => {
    const lights = poseAt(progress.current.t).lights;
    if (crown.current) crown.current.emissiveIntensity = 0.6 + lights * 3;
  });

  return (
    <group position={[0, 0.35, 0]}>
      <Metal position={[0, -0.05, 1.2]} args={[24, 0.45, 20]} />
      <Metal position={[0, 0.28, 6.6]} args={[12, 0.22, 6]} />
      <Metal position={[0, 0.46, 8.1]} args={[8, 0.16, 3.2]} />
      <Glow position={[-2.4, 0.22, 7.2]} args={[0.05, 0.03, 8]} />
      <Glow position={[2.4, 0.22, 7.2]} args={[0.05, 0.03, 8]} />

      {[-8.4, 8.4].map(x => (
        <group key={x}>
          <Metal position={[x, 3.4, 0.2]} args={[4.4, 6.6, 9]} />
          <Glass position={[x, 3.6, 4.72]} args={[3.5, 5.4, 0.08]} />
          <Metal position={[x, 6.85, 0.2]} args={[4.8, 0.28, 9.4]} />
          <Glow position={[x, 6.7, 4.8]} args={[3.2, 0.045, 0.06]} />
          <WindowGrid origin={[x, 3.5, 4.8]} size={[3.2, 4.8, 0.1]} floors={4} columns={3} axis="z" />
        </group>
      ))}

      {[-5.15, 5.15].map(x => (
        <group key={x}>
          <Metal position={[x, 5.1, -1.1]} args={[0.42, 10.2, 12.4]} />
          <Glass position={[x > 0 ? x - 0.28 : x + 0.28, 5.2, -1.1]} args={[0.08, 9.2, 11.2]} />
          <WindowGrid origin={[x > 0 ? x - 0.36 : x + 0.36, 5.1, -1]} size={[0.1, 8.4, 8]} floors={6} columns={5} axis="x" />
        </group>
      ))}

      <Glass position={[-3.15, 4.15, 5.22]} args={[2.7, 6.8, 0.1]} />
      <Glass position={[3.15, 4.15, 5.22]} args={[2.7, 6.8, 0.1]} />
      <Glass position={[0, 6.55, 5.22]} args={[3.4, 1.7, 0.1]} />
      <WindowGrid origin={[-3.15, 4.2, 5.3]} size={[2.3, 5.6, 0.1]} floors={5} columns={2} axis="z" />
      <WindowGrid origin={[3.15, 4.2, 5.3]} size={[2.3, 5.6, 0.1]} floors={5} columns={2} axis="z" />
      <Metal position={[0, 7.55, 4.4]} args={[11.2, 0.42, 1.2]} />
      <Glow position={[0, 7.28, 5.28]} args={[10.2, 0.05, 0.06]} />

      {[-2.15, 2.15].map(x => (
        <Metal key={x} position={[x, 2.3, 6.55]} args={[0.28, 4.4, 0.28]} />
      ))}
      <Metal position={[0, 4.62, 6.55]} args={[4.7, 0.22, 0.7]} />
      <Glow position={[0, 4.46, 6.9]} args={[4.2, 0.04, 0.05]} />

      <Metal position={[0, 9.45, -1]} args={[11.4, 0.4, 13]} />
      <Metal position={[0, 11.7, -1.2]} args={[6.4, 4.1, 6.8]} />
      <Glass position={[0, 11.7, 2.22]} args={[5.2, 3.2, 0.08]} />
      <WindowGrid origin={[0, 11.7, 2.3]} size={[4.4, 2.6, 0.1]} floors={2} columns={4} axis="z" />
      <Metal position={[0, 13.95, -1.2]} args={[6.8, 0.28, 7.2]} />
      <Metal position={[0, 16.1, -1.2]} args={[1.5, 4.1, 1.5]} />
      <mesh position={[0, 18.35, -1.2]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.55, 0.055, 16, 64]} />
        <meshStandardMaterial ref={crown} color="#171014" emissive="#D4AF62" emissiveIntensity={1.4} />
      </mesh>
      <mesh position={[0, 18.35, -1.2]}>
        <sphereGeometry args={[0.18, 16, 16]} />
        <meshStandardMaterial color="#E8D5A5" emissive="#E8D5A5" emissiveIntensity={2} />
      </mesh>

      {[-5.3, 5.3].map(x => (
        <Glow key={x} position={[x, 5.2, 5.3]} args={[0.045, 9.4, 0.045]} />
      ))}
      <BuildingEntrance progress={progress} />
      <BuildingInterior progress={progress} />
    </group>
  );
}
