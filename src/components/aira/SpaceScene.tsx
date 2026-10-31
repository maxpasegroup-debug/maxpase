"use client";

import { AdaptiveDpr } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useLayoutEffect, useRef, type MutableRefObject } from "react";
import { Color, DirectionalLight, PMREMGenerator, Scene, Vector3 } from "three";
import { AiraBuilding } from "./AiraBuilding";
import { poseAt } from "./journey";
import { Planet } from "./Planet";
import { StarField } from "./StarField";

function SpaceEnvironment() {
  const { gl, scene } = useThree();
  useLayoutEffect(() => {
    const generator = new PMREMGenerator(gl);
    const source = new Scene();
    source.background = new Color("#171014");
    const key = new DirectionalLight("#F4E5C3", 4);
    key.position.set(10, 8, 6);
    source.add(key);
    const rim = new DirectionalLight("#D4AF62", 2.4);
    rim.position.set(-8, 2, -4);
    source.add(rim);
    const fill = new DirectionalLight("#E8D5A5", 1.4);
    fill.position.set(0, -2, 8);
    source.add(fill);
    const target = generator.fromScene(source, 0.04);
    scene.environment = target.texture;
    return () => {
      target.texture.dispose();
      generator.dispose();
    };
  }, [gl, scene]);
  return null;
}

function JourneyRig({ progress }: { progress: MutableRefObject<{ t: number }> }) {
  const { camera } = useThree();
  const look = useRef(new Vector3());
  useFrame(({ clock }) => {
    const pose = poseAt(progress.current.t);
    const idle = 1 - Math.min(1, progress.current.t / 0.08);
    const bob = Math.sin(clock.elapsedTime * 0.32) * 0.14 * idle;
    const drift = Math.cos(clock.elapsedTime * 0.2) * 0.1 * idle;
    camera.position.set(pose.position[0] + drift, pose.position[1] + bob, pose.position[2]);
    look.current.set(pose.look[0], pose.look[1], pose.look[2]);
    camera.lookAt(look.current);
  });
  return null;
}

function SceneContents({ progress, mobile, shadows }: { progress: MutableRefObject<{ t: number }>; mobile: boolean; shadows: boolean }) {
  return (
    <>
      <color attach="background" args={["#171014"]} />
      <fog attach="fog" args={["#171014", 120, 420]} />
      <SpaceEnvironment />
      <JourneyRig progress={progress} />
      <ambientLight intensity={0.12} color="#39040D" />
      <directionalLight
        position={[16, 18, 22]}
        intensity={2.8}
        color="#F4E5C3"
        castShadow={shadows}
        shadow-mapSize={[512, 512]}
        shadow-camera-near={2}
        shadow-camera-far={70}
        shadow-camera-left={-18}
        shadow-camera-right={18}
        shadow-camera-top={18}
        shadow-camera-bottom={-18}
      />
      <directionalLight position={[-10, 4, -6]} intensity={0.7} color="#B89552" />
      <pointLight position={[0, 6, 12]} intensity={8} distance={28} color="#D4AF62" />
      <StarField mobile={mobile} />
      <Planet mobile={mobile} />
      <AiraBuilding progress={progress} />
      <AdaptiveDpr pixelated />
    </>
  );
}

export function SpaceScene({
  progress,
  mobile,
  shadows
}: {
  progress: MutableRefObject<{ t: number }>;
  mobile: boolean;
  shadows: boolean;
}) {
  return (
    <Canvas
      className="aira-canvas"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
      camera={{ position: [0, 16, 118], fov: mobile ? 52 : 36, near: 0.1, far: 600 }}
      dpr={[1, mobile ? 1 : 1.25]}
      gl={{ antialias: !mobile, alpha: true, premultipliedAlpha: false, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        gl.domElement.style.pointerEvents = "none";
        if (gl.domElement.parentElement) gl.domElement.parentElement.style.pointerEvents = "none";
      }}
      shadows={shadows}
    >
      <Suspense fallback={null}>
        <SceneContents progress={progress} mobile={mobile} shadows={shadows} />
      </Suspense>
    </Canvas>
  );
}
