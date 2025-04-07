import type { DriveSlotType } from "@/components/ServerView/ServerComponent";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

type ModelLoader = () => Promise<THREE.Object3D>;

function lazyModelLoader(loader: ModelLoader): ModelLoader {
  let model: Promise<THREE.Object3D> | null = null;

  return () => (model ? model : (model = loader()));
}

const textureLoader = new THREE.TextureLoader();
export function loadImageModel(
  imp: Promise<typeof import("*.png") | typeof import("*.jpg") | typeof import("*.svg")>,
  size: { width?: number; height?: number } = {}
) {
  return imp.then(({ default: url }) =>
    textureLoader.loadAsync(url).then((texture) => {
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      texture.generateMipmaps = false;
      const aspect = texture.image.width / texture.image.height;
      let { width, height } = size;
      if (width === undefined && height === undefined) {
        width = texture.image.width as number;
        height = texture.image.height as number;
      } else if (width) {
        height = width / aspect;
      } else if (height) {
        width = height * aspect;
      }
      console.log("imageModelLoader size", width, height);
      return new THREE.Mesh(
        new THREE.PlaneGeometry(width, height),
        new THREE.MeshBasicMaterial({ map: texture })
      );
    })
  );
}

export function imageModelLoader(
  imp: Promise<typeof import("*.png") | typeof import("*.jpg") | typeof import("*.svg")>,
  size?: { width?: number; height?: number }
): ModelLoader {
  return () => loadImageModel(imp, size);
}

const gltfLoader = new GLTFLoader();

const notFoundModelLoader = lazyModelLoader(imageModelLoader(import("./notFound.png")));

function lazyGLBLoader(glbImport: Promise<typeof import(".glb?inline")>) {
  return lazyModelLoader(() =>
    glbImport
      .then((url) => gltfLoader.loadAsync(url.default))
      .then((gltf) => gltf.scene)
  );
}

const chassisModelLUT: { re: RegExp; modelLoader: ModelLoader }[] = [
  {
    re: /^HomeLab-HL4/,
    modelLoader: lazyGLBLoader(import("./chassis/HL4/HL4.glb?inline")),
    // lazyModelLoader(() =>
    // import("./chassis/HL4/HL4.glb?inline")
    // .then((url) => gltfLoader.loadAsync(url.default))
    // .then((gltf) => gltf.scene)
    // ),
  },
];

export function getChassisModel(modelNumber: string): Promise<THREE.Object3D> {
  for (const { re, modelLoader } of chassisModelLUT) {
    if (re.test(modelNumber)) return modelLoader();
  }
  return notFoundModelLoader();
}

// const driveLUT: Record<DriveSlotType, { re: RegExp; modelLoader: ModelLoader }[]> = {
//   HDD: [
//     { re: /^ST/i, modelLoader: lazyGLBLoader(() => "Seagate") }, // Example: ST1000DM003
//     { re: /^WD/i, modelLoader: lazyGLBLoader(() => "Western Digital") }, // Example: WD40EZRX
//     { re: /^HGST/i, modelLoader: lazyGLBLoader(() => "HGST") }, // Example: HGST HUS726T4TALA6L4
//     { re: /^SAMSUNG/i, modelLoader: lazyGLBLoader(() => "Samsung") }, // Example: SAMSUNG MZ7LN256HCHP
//     { re: /^TOSHIBA/i, modelLoader: lazyGLBLoader(() => "Toshiba") }, // Example: TOSHIBA DT01ACA100
//     { re: /^HITACHI/i, modelLoader: lazyGLBLoader(() => "Hitachi") }, // Example: HITACHI HDS721010CLA332
//     { re: /^INTEL/i, modelLoader: lazyGLBLoader(() => "Intel") }, // Example: INTEL SSDSC2KW256G8
//     { re: /^CRUCIAL/i, modelLoader: lazyGLBLoader(() => "Crucial") }, // Example: CRUCIAL CT500MX500SSD1
//     { re: /^KINGSTON/i, modelLoader: lazyGLBLoader(() => "Kingston") }, // Example: KINGSTON SA400S37/240G
//     { re: /^ADATA/i, modelLoader: lazyGLBLoader(() => "ADATA") }, // Example: ADATA SU800
//     { re: /^SAN/i, modelLoader: lazyGLBLoader(() => "SanDisk") }, // Example: SanDisk SDSSDH3-500G-G25
//     { re: /^PLEXTOR/i, modelLoader: lazyGLBLoader(() => "Plextor") }, // Example: PLEXTOR PX-256M9PeG
//     { re: /^MICRON/i, modelLoader: lazyGLBLoader(() => "Micron") }, // Example: MICRON 1100 SATA 256GB
//   ],
// };
