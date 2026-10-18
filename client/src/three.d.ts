// Type declarations for Three.js loaded via CDN importmap.
// The runtime module comes from https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js
declare module "three" {
  export class Scene {
    add(object: Object3D): void;
    traverse(callback: (obj: Object3D) => void): void;
  }
  export class PerspectiveCamera {
    constructor(fov: number, aspect: number, near: number, far: number);
    aspect: number;
    position: Vector3;
    updateProjectionMatrix(): void;
    lookAt(x: number, y: number, z: number): void;
  }
  export class WebGLRenderer {
    constructor(options?: { antialias?: boolean; alpha?: boolean });
    domElement: HTMLCanvasElement;
    setPixelRatio(ratio: number): void;
    setSize(width: number, height: number): void;
    render(scene: Scene, camera: PerspectiveCamera): void;
    dispose(): void;
  }
  export class Vector3 {
    constructor(x?: number, y?: number, z?: number);
    x: number; y: number; z: number;
    set(x: number, y: number, z: number): void;
  }
  export class Object3D {
    position: Vector3;
    rotation: { x: number; y: number; z: number; set(x: number, y: number, z: number): void };
    scale: Vector3;
    add(...objects: Object3D[]): void;
  }
  export class Group extends Object3D {}
  export class Mesh extends Object3D {
    constructor(geometry?: BufferGeometry, material?: Material | Material[]);
    geometry: BufferGeometry;
    material: Material | Material[];
  }
  export class BufferGeometry {
    dispose(): void;
  }
  export class SphereGeometry extends BufferGeometry {
    constructor(radius?: number, widthSegments?: number, heightSegments?: number, phiStart?: number, phiLength?: number, thetaStart?: number, thetaLength?: number);
  }
  export class CylinderGeometry extends BufferGeometry {
    constructor(radiusTop?: number, radiusBottom?: number, height?: number, radialSegments?: number);
  }
  export class BoxGeometry extends BufferGeometry {
    constructor(width?: number, height?: number, depth?: number);
  }
  export class CapsuleGeometry extends BufferGeometry {
    constructor(radius?: number, length?: number, capSegments?: number, radialSegments?: number);
  }
  export class CircleGeometry extends BufferGeometry {
    constructor(radius?: number, segments?: number);
  }
  export class Material {
    dispose(): void;
  }
  export class MeshStandardMaterial extends Material {
    constructor(options?: { color?: number; roughness?: number; transparent?: boolean; opacity?: number });
  }
  export class MeshBasicMaterial extends Material {
    constructor(options?: { color?: number; transparent?: boolean; opacity?: number });
  }
  export class AmbientLight extends Object3D {
    constructor(color?: number, intensity?: number);
  }
  export class DirectionalLight extends Object3D {
    constructor(color?: number, intensity?: number);
  }
  export class PointLight extends Object3D {
    constructor(color?: number, intensity?: number, distance?: number);
  }
  export class Clock {
    getElapsedTime(): number;
    getDelta(): number;
  }
}
