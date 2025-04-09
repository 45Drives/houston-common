import type { DriveSlotType } from "@/components/ServerView/ServerComponent";
import { ValueError } from "@45drives/houston-common-lib";
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
      .then((gltf) => {
        gltf.scene.traverse((obj) => {
          obj.castShadow = true;
          obj.receiveShadow = true;
          if (
            "material" in obj &&
            typeof obj.material === "object" &&
            obj.material !== null &&
            "dithering" in obj.material &&
            typeof obj.material.dithering === "boolean"
          ) {
            obj.material.dithering = true;
            console.log("added dithering");
          } else {
            console.error("failed to add dithering");
          }
        });
        return gltf.scene;
      })
  );
}

export type DriveOrientation = "TopLoader" | "FrontLoader";

const chassisModelLUT: {
  re: RegExp;
  modelLoader: ModelLoader;
  driveOrientation: DriveOrientation;
}[] = [
  {
    re: /^HomeLab-HL4/,
    modelLoader: lazyGLBLoader(import("./chassis/HL4/HL4.glb?inline")),
    driveOrientation: "FrontLoader",
  },
];

export function getChassisModel(modelNumber: string): {
  model: Promise<THREE.Object3D>;
  driveOrientation: DriveOrientation;
} {
  for (const { re, modelLoader, driveOrientation } of chassisModelLUT) {
    if (re.test(modelNumber))
      return {
        model: modelLoader(),
        driveOrientation,
      };
  }
  return { model: notFoundModelLoader(), driveOrientation: "FrontLoader" };
}

const driveLUT: Record<DriveSlotType, { re: RegExp; modelLoader: ModelLoader }[]> = {
  HDD: [
    {
      re: /^/,
      modelLoader: lazyModelLoader(() => {
        const model = new THREE.Mesh(
          new THREE.BoxGeometry(0.0254, 0.1016, 0.14605),
          new THREE.MeshStandardMaterial({ color: 0x404040, metalness: 0.5 })
        );
        model.castShadow = true;
        model.receiveShadow = true;
        model.geometry.computeBoundingBox();
        return Promise.resolve(model);
      }),
    },
    // { re: /^/, modelLoader: lazyGLBLoader(import("./drive/HDD_generic.glb?inline")) }, // keep at end of list
  ],
  SSD_15mm: [
    {
      re: /^/,
      modelLoader: lazyModelLoader(() => {
        const model = new THREE.Mesh(
          new THREE.BoxGeometry(0.015, 0.06985, 0.1016),
          new THREE.MeshStandardMaterial({ color: 0x404040, metalness: 0.5 })
        );
        model.castShadow = true;
        model.receiveShadow = true;
        model.material.dithering = true;
        model.geometry.computeBoundingBox();
        return Promise.resolve(model);
      }),
    },
    // { re: /^/, modelLoader: lazyGLBLoader(import("./drive/SDD_15mm_generic.glb?inline")) }, // keep at end of list
  ],
  SSD_7mm: [
    {
      re: /^/,
      modelLoader: lazyModelLoader(() => {
        const model = new THREE.Mesh(
          new THREE.BoxGeometry(0.007, 0.06985, 0.1016),
          new THREE.MeshStandardMaterial({ color: 0x404040, metalness: 0.5 })
        );
        model.castShadow = true;
        model.receiveShadow = true;
        model.material.dithering = true;
        model.geometry.computeBoundingBox();
        return Promise.resolve(model);
      }),
    },
    // { re: /^/, modelLoader: lazyGLBLoader(import("./drive/SDD_7mm_generic.glb?inline")) }, // keep at end of list
  ],
};

export function getDriveModel(
  driveType: DriveSlotType,
  modelNumber: string
): Promise<THREE.Object3D> {
  for (const { re, modelLoader } of driveLUT[driveType]) {
    if (re.test(modelNumber)) return modelLoader();
  }
  // generic model should catch any model number
  throw new ValueError(`could not find ${driveType} model for ${modelNumber}`);
}
