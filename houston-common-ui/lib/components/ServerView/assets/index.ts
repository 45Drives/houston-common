import type { DriveSlotType } from "@/components/ServerView/ServerComponent";
import { ValueError } from "@45drives/houston-common-lib";
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";

export { type GLTF };

type ModelLoader<T extends THREE.Object3D | GLTF> = () => Promise<T>;

function lazyModelLoader<T extends THREE.Object3D | GLTF>(loader: ModelLoader<T>): ModelLoader<T> {
  let model: Promise<T> | null = null;

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
  imp: () => Promise<typeof import("*.png") | typeof import("*.jpg") | typeof import("*.svg")>,
  size?: { width?: number; height?: number }
): ModelLoader<THREE.Object3D> {
  return () => loadImageModel(imp(), size);
}

const gltfLoader = new GLTFLoader();

const notFoundModelLoader = lazyModelLoader(imageModelLoader(() => import("./notFound.png")));

function lazyGLBLoader(glbImport: () => Promise<typeof import(".glb?inline")>) {
  return lazyModelLoader(() =>
    glbImport()
      .then((url) => gltfLoader.loadAsync(url.default))
      .then((gltf) => {
        gltf.scene.traverse((obj) => {
          obj.castShadow = true;
          obj.receiveShadow = true;
          // if (
          //   "material" in obj &&
          //   typeof obj.material === "object" &&
          //   obj.material !== null &&
          //   "dithering" in obj.material &&
          //   typeof obj.material.dithering === "boolean"
          // ) {
          //   obj.material.dithering = true;
          //   console.log("added dithering");
          // } else {
          //   console.error("failed to add dithering");
          // }
        });
        return gltf;
      })
  );
}

export type DriveOrientation = "TopLoader" | "FrontLoader";

const HL4Loader = lazyGLBLoader(() => import("./chassis/HL4/HL4.glb?inline"));
const HL8Loader = lazyGLBLoader(() => import("./chassis/HL8/HL8.glb?inline"));
const HL15Loader = lazyGLBLoader(() => import("./chassis/HL15/HL15.glb?inline"));

const chassisModelLUT: {
  re: RegExp;
  modelLoader: ModelLoader<GLTF>;
  driveOrientation: DriveOrientation;
  defaultPowdercoat: THREE.ColorRepresentation;
  defaultLabels: THREE.ColorRepresentation;
}[] = [
  {
    re: /^HomeLab-HL4/,
    modelLoader: HL4Loader,
    driveOrientation: "FrontLoader",
    defaultPowdercoat: 0xffffff,
    defaultLabels: 0x000000,
  },
  {
    re: /^HomeLab-HL8/,
    modelLoader: HL8Loader,
    driveOrientation: "FrontLoader",
    defaultPowdercoat: 0xffffff,
    defaultLabels: 0x000000,
  },
  {
    re: /^HomeLab-HL15/,
    modelLoader: HL15Loader,
    driveOrientation: "TopLoader",
    defaultPowdercoat: 0xffffff,
    defaultLabels: 0x000000,
  },
  {
    re: /^Professional-PRO4/,
    modelLoader: HL4Loader,
    driveOrientation: "FrontLoader",
    defaultPowdercoat: 0x000000,
    defaultLabels: 0xffffff,
  },
  {
    re: /^Professional-PRO8/,
    modelLoader: HL8Loader,
    driveOrientation: "FrontLoader",
    defaultPowdercoat: 0x000000,
    defaultLabels: 0xffffff,
  },
  {
    re: /^Professional-PRO15/,
    modelLoader: HL15Loader,
    driveOrientation: "TopLoader",
    defaultPowdercoat: 0x000000,
    defaultLabels: 0xffffff,
  },
];

export function supportsChassisModel(modelNumber: string): boolean {
  return chassisModelLUT.some(({ re }) => re.test(modelNumber));
}

export type ChassisModel = {
  model: Promise<THREE.Object3D>;
  animations: Promise<THREE.AnimationClip[]>;
  driveOrientation: DriveOrientation;
  defaultPowdercoat: THREE.Color;
  defaultLabels: THREE.Color;
};

export function getChassisModel(modelNumber: string): ChassisModel {
  for (const {
    re,
    modelLoader,
    driveOrientation,
    defaultPowdercoat,
    defaultLabels,
  } of chassisModelLUT) {
    if (re.test(modelNumber)) {
      const gltf = modelLoader();
      return {
        model: gltf.then((gltf) => gltf.scene),
        animations: gltf.then((gltf) => gltf.animations),
        driveOrientation,
        defaultPowdercoat: new THREE.Color(defaultPowdercoat),
        defaultLabels: new THREE.Color(defaultLabels),
      };
    }
  }
  return {
    model: notFoundModelLoader(),
    animations: Promise.resolve([]),
    driveOrientation: "FrontLoader",
    defaultPowdercoat: new THREE.Color(0x000000),
    defaultLabels: new THREE.Color(0xffffff),
  };
}

// const genericDrive = new THREE.Mesh(
//   new THREE.BoxGeometry(1, 1, 1),
//   new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.5, roughness: 0.5 })
// );
// genericDrive.castShadow = true;
// genericDrive.receiveShadow = true;
// genericDrive.material.dithering = true;

const genericDrive = () =>
  lazyGLBLoader(() => import("./drive/HDD.glb?inline"))().then((gltf) => gltf.scene);

const driveLUT: Record<DriveSlotType, { re: RegExp; modelLoader: ModelLoader<THREE.Object3D> }[]> =
  {
    HDD: [
      // {
      //   re: /^/,
      //   modelLoader: lazyModelLoader(() => {
      //     const model = genericDrive.clone();
      //     model.geometry.scale(0.0254, 0.1016, 0.14605);
      //     model.geometry.computeBoundingBox();
      //     return Promise.resolve(model);
      //   }),
      // },
      {
        re: /^/,
        modelLoader: lazyModelLoader(() =>
          genericDrive().then((model) => {
            return model;
          })
        ),
      }, // keep at end of list
    ],
    SSD_15mm: [
      // {
      //   re: /^/,
      //   modelLoader: lazyModelLoader(() => {
      //     const model = genericDrive.clone();
      //     model.geometry.scale(0.015, 0.06985, 0.1016);
      //     model.geometry.computeBoundingBox();
      //     return Promise.resolve(model);
      //   }),
      // },
      // { re: /^/, modelLoader: lazyGLBLoader(() => import("./drive/SDD_15mm_generic.glb?inline")) }, // keep at end of list
      {
        re: /^/,
        modelLoader: lazyModelLoader(() =>
          genericDrive().then((model) => {
            model = model.clone();
            model.scale.set(15 / 25.4, 2.75 / 4, 4 / 5.75);
            return model;
          })
        ),
      }, // keep at end of list
    ],
    SSD_7mm: [
      // {
      //   re: /^/,
      //   modelLoader: lazyModelLoader(() => {
      //     const model = genericDrive.clone();
      //     model.geometry.scale(0.007, 0.06985, 0.1016);
      //     model.geometry.computeBoundingBox();
      //     return Promise.resolve(model);
      //   }),
      // },
      // { re: /^/, modelLoader: lazyGLBLoader(() => import("./drive/SDD_7mm_generic.glb?inline")) }, // keep at end of list
      {
        re: /^/,
        modelLoader: lazyModelLoader(() =>
          genericDrive().then((model) => {
            model = model.clone();
            model.scale.set(7 / 25.4, 2.75 / 4, 4 / 5.75);
            return model;
          })
        ),
      }, // keep at end of list
    ],
  };

export function getDriveModel(
  driveType: DriveSlotType,
  modelNumber: string
): Promise<THREE.Object3D> {
  for (const { re, modelLoader } of driveLUT[driveType]) {
    if (re.test(modelNumber))
      return modelLoader().then((model) => {
        // TODO: traverse
        model.castShadow = true;
        model.receiveShadow = true;
        return model;
      });
  }
  // generic model should catch any model number
  throw new ValueError(`could not find ${driveType} model for ${modelNumber}`);
}
