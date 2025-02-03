import * as THREE from "three";
import { type SlotType } from "@45drives/houston-common-lib";

import hdd_generic from "./hdd-generic.png";
import ssd_generic from "./ssd-generic.png";

const textureLoader = new THREE.TextureLoader();

const loadTexture = (url: string) => {
  const texture = textureLoader.load(url);
  texture.magFilter = THREE.NearestFilter;
  return texture;
}

const diskTextures: Record<SlotType, THREE.Texture> = {
  HDD: loadTexture(hdd_generic),
  SSD_7mm: loadTexture(ssd_generic),
  SSD_15mm: loadTexture(ssd_generic),
};

export default diskTextures;
