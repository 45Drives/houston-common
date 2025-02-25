import * as THREE from "three";

import {
  lazyModelLoader,
  ServerComponent,
  gltfModelLoader,
  imageModelLoader,
  loadImageModel,
  type ModelLoader,
} from "./ServerComponent";
import {
  ValueError,
  type DriveSlot,
  type LSDevDisk,
  type SlotType,
} from "@45drives/houston-common-lib";

import { DriveSlotComponent } from "@/components/ServerView/DriveSlot";

type SlotLocation = { id: string; type: SlotType; location: THREE.Vector3; rotation: THREE.Euler };

function SlotLocation(
  id: string,
  type: SlotType,
  x: number,
  y: number,
  z: number = 0,
  rx: number = 0,
  ry: number = 0,
  rz: number = 0
): SlotLocation {
  return { id, type, location: new THREE.Vector3(x, y, z), rotation: new THREE.Euler(rx, ry, rz) };
}

export class Chassis extends ServerComponent {
  protected static modelNumberLUT: { re: RegExp; modelLoader: ModelLoader; slots: SlotLocation[] }[] = [
    {
      re: /^HomeLab-HL4/,
      modelLoader: lazyModelLoader(() =>
        loadImageModel(import("./assets/hl4/drivebay.png"), { width: 5 + 3 / 8 })
      ),
      slots: [
        SlotLocation(
          "1-1",
          "HDD",
          (37 * (5 + 3 / 8)) / 144 - (5 + 3 / 8) / 2,
          (((5 + 3 / 8) / 144) * 165) / 2 - (45 * (5 + 3 / 8)) / 144,
          1
        ),
        SlotLocation(
          "1-2",
          "HDD",
          (69 * (5 + 3 / 8)) / 144 - (5 + 3 / 8) / 2,
          (((5 + 3 / 8) / 144) * 165) / 2 - (45 * (5 + 3 / 8)) / 144,
          1
        ),
        SlotLocation(
          "1-3",
          "HDD",
          (101 * (5 + 3 / 8)) / 144 - (5 + 3 / 8) / 2,
          (((5 + 3 / 8) / 144) * 165) / 2 - (45 * (5 + 3 / 8)) / 144,
          1
        ),
        SlotLocation(
          "1-4",
          "HDD",
          (133 * (5 + 3 / 8)) / 144 - (5 + 3 / 8) / 2,
          (((5 + 3 / 8) / 144) * 165) / 2 - (45 * (5 + 3 / 8)) / 144,
          1
        ),
      ],
    },
  ];

  static lookupModel(modelNumber: string): { modelLoader: ModelLoader; slots: SlotLocation[] } | null {
    for (const { re, modelLoader, slots } of this.modelNumberLUT) {
      if (re.test(modelNumber)) {
        return { modelLoader, slots };
      }
    }
    return null;
  }

  private slots: DriveSlotComponent[];

  constructor(public modelNumber: string) {
    const lookupResult = Chassis.lookupModel(modelNumber);
    if (!lookupResult) {
      throw new ValueError(`Failed to lookup model number: ${modelNumber}`);
    }
    super(lookupResult.modelLoader);
    this.slots = lookupResult.slots.map((slotLocation) => {
      const slot = new DriveSlotComponent(slotLocation.type, slotLocation.id);
      slot.position.x = slotLocation.location.x;
      slot.position.y = slotLocation.location.y;
      slot.position.z = slotLocation.location.z;
      slot.rotation.x = slotLocation.rotation.x;
      slot.rotation.y = slotLocation.rotation.y;
      slot.rotation.z = slotLocation.rotation.z;
      slot.addEventListener("selected", (e) => this.dispatchEvent(e));
      slot.addEventListener("deselected", (e) => this.dispatchEvent(e));
      return slot;
    });
    this.add(...this.slots);
  }

  setDriveSlotInfo(slots: DriveSlot[]) {
    slots.forEach((slotInfo) => {
      const slot = this.slots.find((slot) => slot.userData.slotId === slotInfo.slotId);
      if (!slot) {
        throw new ValueError(`Invalid slot ID: ${slotInfo.slotId}`);
      }
      slot.setSlotInfo(slotInfo);
    });
  }
}
