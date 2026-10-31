"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, BackSide, CanvasTexture, Color, Mesh, SRGBColorSpace, ShaderMaterial } from "three";

const atmosphereVertex = `
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vNormal = normalize(mat3(modelMatrix) * normal);
    vView = normalize(cameraPosition - worldPosition.xyz);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const atmosphereFragment = `
  uniform vec3 glow;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    float fresnel = pow(1.0 - clamp(dot(normalize(vNormal), normalize(vView)), 0.0, 1.0), 4.4);
    gl_FragColor = vec4(glow, fresnel * 0.42);
  }
`;

function planetTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) return new CanvasTexture(canvas);
  const base = context.createLinearGradient(0, 0, 0, 512);
  base.addColorStop(0, "#171014");
  base.addColorStop(0.42, "#570713");
  base.addColorStop(0.72, "#39040D");
  base.addColorStop(1, "#171014");
  context.fillStyle = base;
  context.fillRect(0, 0, 1024, 512);

  for (let index = 0; index < 16; index += 1) {
    context.fillStyle = index % 3 === 0 ? "rgba(22, 78, 92, 0.55)" : "rgba(16, 48, 86, 0.72)";
    context.beginPath();
    context.ellipse(
      Math.random() * 1024,
      80 + Math.random() * 340,
      50 + Math.random() * 140,
      18 + Math.random() * 46,
      Math.random() * Math.PI,
      0,
      Math.PI * 2
    );
    context.fill();
  }

  for (let index = 0; index < 520; index += 1) {
    const x = Math.random() * 460;
    const y = 40 + Math.random() * 430;
    context.fillStyle = `rgba(255, ${170 + Math.floor(Math.random() * 70)}, ${80 + Math.floor(Math.random() * 70)}, ${0.35 + Math.random() * 0.6})`;
    context.fillRect(x, y, 1.6, 1.6);
  }

  context.fillStyle = "rgba(214, 232, 255, 0.09)";
  for (let index = 0; index < 24; index += 1) {
    context.beginPath();
    context.ellipse(Math.random() * 1024, Math.random() * 512, 70 + Math.random() * 150, 8 + Math.random() * 16, 0.2, 0, Math.PI * 2);
    context.fill();
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

export function Planet({ mobile }: { mobile: boolean }) {
  const planet = useRef<Mesh>(null);
  const map = useMemo(() => planetTexture(), []);
  const atmosphere = useMemo(() => new ShaderMaterial({
    uniforms: { glow: { value: new Color("#E8D5A5") } },
    vertexShader: atmosphereVertex,
    fragmentShader: atmosphereFragment,
    transparent: true,
    depthWrite: false,
    side: BackSide,
    blending: AdditiveBlending
  }), []);

  useFrame((_, delta) => {
    if (planet.current) planet.current.rotation.y += delta * 0.012;
  });

  return (
    <group position={[0, -18.2, -8]}>
      <mesh ref={planet} receiveShadow>
        <sphereGeometry args={[20, mobile ? 48 : 80, mobile ? 32 : 56]} />
        <meshStandardMaterial map={map} color="#E8D5A5" roughness={0.72} metalness={0.18} />
      </mesh>
      <mesh scale={1.018}>
        <sphereGeometry args={[20, mobile ? 32 : 48, mobile ? 24 : 36]} />
        <primitive object={atmosphere} attach="material" />
      </mesh>
    </group>
  );
}
