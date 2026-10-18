import { useEffect, useRef } from "react";
import * as THREE from "three";

interface BoyAvatar3DProps {
  isSpeaking?: boolean;
  isThinking?: boolean;
  className?: string;
}

/**
 * 3D animated boy avatar — replaces the static image.
 * Procedural low-poly stylized character (no external model download).
 * - Idle: breathing + gentle sway (always)
 * - Speaking: head bob + mouth movement (isSpeaking)
 * - Thinking: head tilt sway (isThinking)
 * Falls back to the static image if WebGL is unavailable.
 */
export default function BoyAvatar3D({ isSpeaking = false, isThinking = false, className = "" }: BoyAvatar3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ isSpeaking, isThinking });
  stateRef.current.isSpeaking = isSpeaking;
  stateRef.current.isThinking = isThinking;
  const fallbackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // WebGL support check
    let webglOk = true;
    try {
      const testCanvas = document.createElement("canvas");
      webglOk = !!(window.WebGLRenderingContext && (testCanvas.getContext("webgl") || testCanvas.getContext("experimental-webgl")));
    } catch {
      webglOk = false;
    }
    if (!webglOk) {
      if (fallbackRef.current) fallbackRef.current.style.display = "flex";
      return;
    }

    const width = mount.clientWidth || 170;
    const height = mount.clientHeight || 320;

    // Renderer — capped pixel ratio for Chromebook performance
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    // Scene + camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, width / height, 0.1, 100);
    camera.position.set(0, 1.55, 4.4);
    camera.lookAt(0, 1.35, 0);

    // Lighting — soft studio + purple glow to match app theme
    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const key = new THREE.DirectionalLight(0xffffff, 1.15);
    key.position.set(2.5, 4, 3.5);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xaa8df6, 0.7);
    rim.position.set(-3, 2, -2.5);
    scene.add(rim);
    const glowLight = new THREE.PointLight(0x8f69f5, 12, 9);
    glowLight.position.set(0, 1.2, 1.6);
    scene.add(glowLight);

    // Materials
    const skin = new THREE.MeshStandardMaterial({ color: 0xe8b88a, roughness: 0.65 });
    const shirt = new THREE.MeshStandardMaterial({ color: 0x3b6fd4, roughness: 0.8 });
    const pants = new THREE.MeshStandardMaterial({ color: 0x2a2d3a, roughness: 0.85 });
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x1d1a16, roughness: 0.9 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4 });
    const mouthMat = new THREE.MeshStandardMaterial({ color: 0x7a3b2e, roughness: 0.7 });

    const boy = new THREE.Group();
    scene.add(boy);

    // ---- Legs ----
    const legGeo = new THREE.CylinderGeometry(0.11, 0.13, 0.85, 10);
    const leftLeg = new THREE.Mesh(legGeo, pants);
    leftLeg.position.set(-0.16, 0.425, 0);
    const rightLeg = new THREE.Mesh(legGeo, pants);
    rightLeg.position.set(0.16, 0.425, 0);
    boy.add(leftLeg, rightLeg);

    // ---- Shoes ----
    const shoeGeo = new THREE.BoxGeometry(0.2, 0.12, 0.34);
    const leftShoe = new THREE.Mesh(shoeGeo, shoeMat);
    leftShoe.position.set(-0.16, 0.06, 0.05);
    const rightShoe = new THREE.Mesh(shoeGeo, shoeMat);
    rightShoe.position.set(0.16, 0.06, 0.05);
    boy.add(leftShoe, rightShoe);

    // ---- Torso ----
    const torsoGeo = new THREE.CapsuleGeometry(0.3, 0.55, 6, 12);
    const torso = new THREE.Mesh(torsoGeo, shirt);
    torso.position.set(0, 1.18, 0);
    boy.add(torso);

    // ---- Arms ----
    const armGeo = new THREE.CylinderGeometry(0.085, 0.095, 0.7, 10);
    const leftArm = new THREE.Group();
    const leftArmMesh = new THREE.Mesh(armGeo, shirt);
    leftArmMesh.position.y = -0.3;
    const leftHand = new THREE.Mesh(new THREE.SphereGeometry(0.095, 10, 10), skin);
    leftHand.position.y = -0.68;
    leftArm.add(leftArmMesh, leftHand);
    leftArm.position.set(-0.42, 1.52, 0);
    leftArm.rotation.z = 0.12;

    const rightArm = new THREE.Group();
    const rightArmMesh = new THREE.Mesh(armGeo, shirt);
    rightArmMesh.position.y = -0.3;
    const rightHand = new THREE.Mesh(new THREE.SphereGeometry(0.095, 10, 10), skin);
    rightHand.position.y = -0.68;
    rightArm.add(rightArmMesh, rightHand);
    rightArm.position.set(0.42, 1.52, 0);
    rightArm.rotation.z = -0.12;
    boy.add(leftArm, rightArm);

    // ---- Head group (for talking/thinking animation) ----
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 1.98, 0);
    boy.add(headGroup);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 20, 20), skin);
    headGroup.add(head);

    // Hair — slightly flattened sphere cap on top/back
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.27, 20, 20, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
    hair.position.y = 0.045;
    hair.rotation.x = -0.25;
    headGroup.add(hair);

    // Eyes
    const eyeGeo = new THREE.SphereGeometry(0.035, 10, 10);
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.095, 0.03, 0.235);
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.095, 0.03, 0.235);
    headGroup.add(leftEye, rightEye);

    // Eyebrows
    const browGeo = new THREE.BoxGeometry(0.09, 0.02, 0.02);
    const leftBrow = new THREE.Mesh(browGeo, hairMat);
    leftBrow.position.set(-0.095, 0.1, 0.24);
    leftBrow.rotation.z = 0.08;
    const rightBrow = new THREE.Mesh(browGeo, hairMat);
    rightBrow.position.set(0.095, 0.1, 0.24);
    rightBrow.rotation.z = -0.08;
    headGroup.add(leftBrow, rightBrow);

    // Mouth — scales open/closed when speaking
    const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 10), mouthMat);
    mouth.position.set(0, -0.1, 0.235);
    mouth.scale.set(1.4, 0.5, 0.5);
    headGroup.add(mouth);

    // Soft ground shadow disc
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.55, 24),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28 })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.005;
    scene.add(shadow);

    // ---- Animation loop ----
    let raf = 0;
    let running = true;
    const clock = new THREE.Clock();

    const onVisibility = () => {
      running = !document.hidden;
      if (running) {
        clock.getDelta();
        tick();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    const tick = () => {
      if (!running) return;
      raf = requestAnimationFrame(tick);
      const t = clock.getElapsedTime();
      const st = stateRef.current;

      // Idle: breathing (torso scale) + gentle whole-body sway
      const breath = Math.sin(t * 1.8) * 0.5 + 0.5;
      torso.scale.set(1 + breath * 0.02, 1 + breath * 0.03, 1 + breath * 0.02);
      boy.position.y = Math.sin(t * 1.8) * 0.02;
      boy.rotation.y = Math.sin(t * 0.6) * 0.06;

      // Arms: subtle idle swing
      leftArm.rotation.x = Math.sin(t * 1.8) * 0.06;
      rightArm.rotation.x = -Math.sin(t * 1.8) * 0.06;

      if (st.isSpeaking) {
        // Talking: head bob + mouth open/close + slight hand lift
        headGroup.position.y = 1.98 + Math.abs(Math.sin(t * 7)) * 0.045;
        headGroup.rotation.x = Math.sin(t * 7) * 0.05;
        const jaw = Math.abs(Math.sin(t * 9));
        mouth.scale.set(1.4, 0.5 + jaw * 1.1, 0.5);
        rightArm.rotation.x = -0.5 + Math.sin(t * 7) * 0.18;
        leftArm.rotation.x = Math.sin(t * 5.3) * 0.12;
      } else if (st.isThinking) {
        // Thinking: slow head tilt sway, mouth closed
        headGroup.position.y = 1.98;
        headGroup.rotation.z = Math.sin(t * 1.4) * 0.16;
        headGroup.rotation.x = 0.08;
        mouth.scale.set(1.4, 0.5, 0.5);
        rightArm.rotation.x = -0.25;
      } else {
        // Pure idle
        headGroup.position.y = 1.98 + Math.sin(t * 1.8) * 0.012;
        headGroup.rotation.set(0, Math.sin(t * 0.6) * 0.08, 0);
        mouth.scale.set(1.5, 0.55, 0.5); // gentle smile
      }

      renderer.render(scene, camera);
    };
    tick();

    // Resize handling
    const onResize = () => {
      const w = mount.clientWidth || 170;
      const h = mount.clientHeight || 320;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    // Cleanup
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", onResize);
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = (mesh as THREE.Mesh).material as THREE.Material | THREE.Material[];
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else if (mat) mat.dispose();
      });
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div ref={mountRef} className={`boy-avatar-3d ${className}`} style={{ width: "100%", height: "100%", minHeight: 280 }} aria-label="Unique AI 3D اوتار">
      {/* Fallback: static image when WebGL unavailable */}
      <div ref={fallbackRef} style={{ display: "none", width: "100%", height: "100%", alignItems: "center", justifyContent: "center" }}>
        <img src="/avatars/boy-avatar.webp" alt="Unique AI" style={{ width: "100%", height: "auto", maxHeight: "100%", objectFit: "contain" }} />
      </div>
    </div>
  );
}
