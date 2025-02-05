import {
  ServerComponent,
  Selectable,
  imageModelLoader,
  type ModelLoader,
} from "@/components/disks/ServerComponent";
import type { SlotType } from "@45drives/houston-common-lib";
import * as THREE from "three";

import HDDImageURL from "./textures/hdd-generic.png";
import SSDImageURL from "./textures/ssd-generic.png";

export class DriveSlot extends Selectable(ServerComponent) {
  static slotTypeBoxLUT: Record<SlotType, THREE.BoxGeometry> = {
    HDD: new THREE.BoxGeometry(1, 4, 5.75),
    SSD_7mm: new THREE.BoxGeometry(7 / 25.4, 2.75, 4),
    SSD_15mm: new THREE.BoxGeometry(15 / 25.4, 2.75, 4),
  };

  private static driveModelLUT: Record<SlotType | string, ModelLoader> = {
    HDD: imageModelLoader(HDDImageURL, { width: 1, height: 4 }),
    SSD: imageModelLoader(SSDImageURL, { width: 7 / 25.4, height: 2.75 }),
  };

  private static material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 });

  private occupiedBy_: SlotType | string | null = null;

  private diskModel?: THREE.Object3D;

  private bounds: THREE.Mesh;

  constructor(
    public slotType: SlotType,
    public slotId: string
  ) {
    super();
    this.bounds = new THREE.Mesh(DriveSlot.slotTypeBoxLUT[this.slotType], DriveSlot.material);
    const boundsBox = new THREE.Box3().setFromObject(this.bounds);
    const boundsWidth = boundsBox.max.x - boundsBox.min.x;
    const boundsHeight = boundsBox.max.y - boundsBox.min.y;
    const boundsDepth = boundsBox.max.z - boundsBox.min.z;
    this.bounds.position.set(-boundsWidth / 2, -boundsHeight / 2, boundsDepth / 2);
    this.add(this.bounds);
  }

  set occupiedBy(type: SlotType | string | null) {
    this.occupiedBy_ = type;
    if (type === null) {
      if (this.diskModel) {
        this.bounds.remove(this.diskModel);
        delete this.diskModel;
      }
      return;
    }
    const model = (DriveSlot.driveModelLUT[type] ?? DriveSlot.driveModelLUT.HDD)();
    model.then((model) => {
      this.diskModel = model;
      this.bounds.add(model);
    });
  }

  get occupiedBy() {
    return this.occupiedBy_;
  }
}

Object.values(DriveSlot.slotTypeBoxLUT).map((box) => box.computeBoundingBox());
