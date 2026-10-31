"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group, MeshStandardMaterial } from "three";
import type { MutableRefObject } from "react";
import { poseAt } from "./journey";

const metal = { color: "#39040D", metalness: 0.9, roughness: 0.28 };
const glass = { color: "#E8D5A5", metalness: 0.2, roughness: 0.04, transparent: true, opacity: 0.38 };

export function BuildingEntrance({ progress }: { progress: MutableRefObject<{ t: number }> }) {
  const left = useRef<Group>(null);
  const right = useRef<Group>(null);
  const frame = useRef<MeshStandardMaterial>(null);

  useFrame(() => {
    const doors = poseAt(progress.current.t).doors;
    const swing = doors * 1.35;
    if (left.current) left.current.rotation.y = -swing;
    if (right.current) right.current.rotation.y = swing;
    if (frame.current) frame.current.emissiveIntensity = 0.4 + doors * 2.4;
  });

  return (
    <group>
      <mesh position={[0, 4.55, 5.08]} castShadow>
        <boxGeometry args={[8.4, 0.16, 0.42]} />
        <meshStandardMaterial {...metal} />
      </mesh>
      <mesh position={[-1.55, 2.15, 5.08]} castShadow>
        <boxGeometry args={[0.18, 4.5, 0.42]} />
        <meshStandardMaterial {...metal} emissive="#39040D" emissiveIntensity={0.4} />
      </mesh>
      <mesh position={[1.55, 2.15, 5.08]} castShadow>
        <boxGeometry args={[0.18, 4.5, 0.42]} />
        <meshStandardMaterial {...metal} emissive="#39040D" emissiveIntensity={0.4} />
      </mesh>
      <mesh position={[0, 4.28, 5.16]}>
        <boxGeometry args={[2.7, 0.06, 0.08]} />
        <meshStandardMaterial ref={frame} color="#171014" emissive="#D4AF62" emissiveIntensity={0.8} />
      </mesh>
      <mesh position={[-3.15, 2.55, 5.02]} castShadow>
        <boxGeometry args={[2.15, 4.7, 0.12]} />
        <meshPhysicalMaterial {...glass} />
      </mesh>
      <mesh position={[3.15, 2.55, 5.02]} castShadow>
        <boxGeometry args={[2.15, 4.7, 0.12]} />
        <meshPhysicalMaterial {...glass} />
      </mesh>
      <mesh position={[0, 4.15, 5.02]}>
        <boxGeometry args={[2.7, 1.45, 0.1]} />
        <meshPhysicalMaterial {...glass} />
      </mesh>
      <group ref={left} position={[-1.42, 2.05, 5.12]}>
        <mesh position={[0.62, 0, 0]} castShadow>
          <boxGeometry args={[1.22, 3.7, 0.08]} />
          <meshStandardMaterial color="#39040D" metalness={0.84} roughness={0.22} emissive="#171014" emissiveIntensity={0.3} />
        </mesh>
        <mesh position={[0.08, 0, 0.05]}>
          <boxGeometry args={[0.03, 3.4, 0.02]} />
          <meshStandardMaterial color="#171014" emissive="#D4AF62" emissiveIntensity={1.6} />
        </mesh>
      </group>
      <group ref={right} position={[1.42, 2.05, 5.12]}>
        <mesh position={[-0.62, 0, 0]} castShadow>
          <boxGeometry args={[1.22, 3.7, 0.08]} />
          <meshStandardMaterial color="#39040D" metalness={0.84} roughness={0.22} emissive="#171014" emissiveIntensity={0.3} />
        </mesh>
        <mesh position={[-0.08, 0, 0.05]}>
          <boxGeometry args={[0.03, 3.4, 0.02]} />
          <meshStandardMaterial color="#171014" emissive="#D4AF62" emissiveIntensity={1.6} />
        </mesh>
      </group>
    </group>
  );
}
