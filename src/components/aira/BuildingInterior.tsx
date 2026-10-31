"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { CustomBlending, Vector3, ZeroFactor, type Group, type PointLight, type MeshStandardMaterial } from "three";
import type { MutableRefObject } from "react";
import { poseAt, smoothstep } from "./journey";
import { venturesFor } from "./ventures";

const accents = venturesFor({ startup: "", labs: "", jobs: "" }).map(venture => venture.accent);

export function BuildingInterior({ progress }: { progress: MutableRefObject<{ t: number }> }) {
  const lamps = useRef<Array<PointLight | null>>([]);
  const strips = useRef<MeshStandardMaterial>(null);
  const portals = useRef<Array<MeshStandardMaterial | null>>([]);
  const frames = useRef<Array<Group | null>>([]);
  const signs = useRef<Array<Group | null>>([]);
  const center = useRef(new Vector3());
  const corner = useRef(new Vector3());
  const cards = useRef<HTMLElement[]>([]);

  useFrame(({ camera, gl }) => {
    const pose = poseAt(progress.current.t);
    const openings = [smoothstep(0.8, 0.85, progress.current.t), smoothstep(0.955, 0.978, progress.current.t)];
    signs.current.forEach((sign, index) => {
      if (!sign) return;
      const shift = openings[index] * 2.5;
      const left = sign.children[0];
      const right = sign.children[1];
      if (left) left.position.x = -0.775 - shift;
      if (right) right.position.x = 0.775 + shift;
    });
    lamps.current.forEach(lamp => {
      if (lamp) lamp.intensity = 0.15 + pose.lights * 4.8;
    });
    if (strips.current) strips.current.emissiveIntensity = 0.25 + pose.lights * 2.8;
    portals.current.forEach((material, index) => {
      const shown = Math.min(1, Math.max(0, (pose.portals - index * 0.16) / 0.5));
      const eased = shown * shown * (3 - 2 * shown);
      const frame = frames.current[index];
      if (frame) {
        const slide = (index - 1) * (1 - eased) * 1.4;
        frame.position.x = [-3.15, 0, 3.15][index] + slide;
        frame.scale.setScalar(0.02 + eased * 0.98);
      }
      if (!material) return;
      material.emissiveIntensity = eased * 1.2;
      material.opacity = 0.12;
    });
    if (pose.portals < 0.02) return;
    if (cards.current.length === 0) {
      cards.current = [...document.querySelectorAll<HTMLElement>(".aira-overlay-portals [data-venture-card]")];
    }
    const width = gl.domElement.clientWidth;
    const height = gl.domElement.clientHeight;
    frames.current.forEach((frame, index) => {
      const card = cards.current[index];
      if (!frame || !card || width === 0) return;
      frame.updateWorldMatrix(true, false);
      const middle = center.current.set(0, 0, 0.16);
      frame.localToWorld(middle);
      const middleNdc = middle.project(camera);
      const edge = corner.current.set(0.92, 1.38, 0.16);
      frame.localToWorld(edge);
      const edgeNdc = edge.project(camera);
      const midX = (middleNdc.x * 0.5 + 0.5) * width;
      const midY = (-middleNdc.y * 0.5 + 0.5) * height;
      const edgeX = (edgeNdc.x * 0.5 + 0.5) * width;
      const edgeY = (-edgeNdc.y * 0.5 + 0.5) * height;
      const cardWidth = Math.abs(edgeX - midX) * 2;
      const cardHeight = Math.abs(edgeY - midY) * 2;
      card.style.left = `${midX - cardWidth / 2}px`;
      card.style.top = `${midY - cardHeight / 2}px`;
      card.style.width = `${cardWidth}px`;
      card.style.height = `${cardHeight}px`;
    });
  });

  return (
    <group>
      <mesh position={[0, 0.06, -4]} receiveShadow>
        <boxGeometry args={[10.4, 0.08, 20]} />
        <meshStandardMaterial color="#39040D" metalness={0.86} roughness={0.18} />
      </mesh>
      <mesh position={[0, 6.15, -4]}>
        <boxGeometry args={[9.6, 0.12, 18]} />
        <meshStandardMaterial color="#171014" metalness={0.7} roughness={0.4} />
      </mesh>
      {[-4.55, 4.55].map(x => (
        <mesh key={x} position={[x, 3.1, -4]} castShadow>
          <boxGeometry args={[0.16, 6, 16]} />
          <meshStandardMaterial color="#39040D" metalness={0.78} roughness={0.34} />
        </mesh>
      ))}
      {[-8, -3, 2].map(z => (
        <mesh key={z} position={[0, 5.95, z]}>
          <boxGeometry args={[7.2, 0.04, 0.08]} />
          <meshStandardMaterial ref={z === -3 ? strips : undefined} color="#171014" emissive="#D4AF62" emissiveIntensity={0.4} />
        </mesh>
      ))}
      <pointLight position={[0, 4.4, 2.4]} color="#E8D5A5" intensity={8} distance={18} decay={2} />
      <pointLight position={[0, 4.4, -3.1]} color="#E8D5A5" intensity={7} distance={16} decay={2} />
      {[-7, -2, 3].map((z, index) => (
        <pointLight
          key={z}
          ref={node => { lamps.current[index] = node; }}
          position={[0, 5.2, z]}
          color="#E8D5A5"
          intensity={0.2}
          distance={14}
          decay={2}
        />
      ))}
      {[[-0.6, "#D4AF62"], [-4.8, "#D4AF62"]].map(([z, color], index) => (
        <group key={String(z)} ref={node => { signs.current[index] = node; }} position={[0, 2.15, Number(z)]}>
          {[-0.775, 0.775].map(x => (
            <group key={x} position={[x, 0, 0]}>
              <mesh>
                <boxGeometry args={[1.55, 1.35, 0.07]} />
                <meshStandardMaterial color="#171014" emissive="#39040D" emissiveIntensity={0.4} metalness={0.15} roughness={0.8} />
              </mesh>
              <mesh position={[0, 0.58, 0.045]}>
                <boxGeometry args={[1.55, 0.03, 0.02]} />
                <meshStandardMaterial color="#171014" emissive={String(color)} emissiveIntensity={1.8} />
              </mesh>
            </group>
          ))}
        </group>
      ))}
      {[1.55, -1.7].map(z => (
        <group key={z} position={[0, 2.4, z]}>
          <mesh position={[-1.85, 0, 0]}>
            <boxGeometry args={[0.16, 4.4, 0.28]} />
            <meshStandardMaterial color="#39040D" metalness={0.84} roughness={0.3} />
          </mesh>
          <mesh position={[1.85, 0, 0]}>
            <boxGeometry args={[0.16, 4.4, 0.28]} />
            <meshStandardMaterial color="#39040D" metalness={0.84} roughness={0.3} />
          </mesh>
          <mesh position={[0, 2.15, 0]}>
            <boxGeometry args={[3.86, 0.16, 0.28]} />
            <meshStandardMaterial color="#39040D" emissive={z > 0 ? "#D4AF62" : "#D4AF62"} emissiveIntensity={0.8} metalness={0.7} roughness={0.3} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 2.6, -13.4]}>
        <boxGeometry args={[9.2, 5.2, 0.16]} />
        <meshStandardMaterial color="#171014" metalness={0.7} roughness={0.4} />
      </mesh>
      {[-3.15, 0, 3.15].map((x, index) => (
        <group key={x} ref={node => { frames.current[index] = node; }} position={[x, 2.35, -12.55]}>
          <mesh>
            <boxGeometry args={[2.35, 3.35, 0.08]} />
            <meshStandardMaterial color="#39040D" metalness={0.8} roughness={0.24} />
          </mesh>
          <mesh position={[0, 0, 0.08]} renderOrder={20}>
            <planeGeometry args={[1.84, 2.76]} />
            <meshBasicMaterial
              transparent
              depthTest={false}
              depthWrite={false}
              blending={CustomBlending}
              blendSrc={ZeroFactor}
              blendDst={ZeroFactor}
              blendSrcAlpha={ZeroFactor}
              blendDstAlpha={ZeroFactor}
            />
          </mesh>
          <mesh position={[0, 0, 0.02]}>
            <planeGeometry args={[2.05, 3.05]} />
            <meshStandardMaterial
              ref={node => { portals.current[index] = node; }}
              color="#171014"
              emissive={accents[index]}
              emissiveIntensity={0}
              transparent
              opacity={0.12}
              depthWrite={false}
            />
          </mesh>
          <mesh position={[0, 1.78, 0.08]}>
            <boxGeometry args={[2.2, 0.045, 0.05]} />
            <meshStandardMaterial color="#171014" emissive={accents[index]} emissiveIntensity={1.4} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
