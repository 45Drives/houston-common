// import {
//   ServerComponent,
//   Selectable,
//   loadImageModel,
//   lazyModelLoader,
//   type ModelLoader,
// } from "@/components/ServerView/ServerComponent";
// import { ValueError, type DriveSlot } from "@45drives/houston-common-lib";
// import * as THREE from "three";



// export class DriveSlotComponent extends Selectable(ServerComponent) {
//   static slotTypeBoxLUT: Record<SlotType, THREE.BoxGeometry> = {
//     HDD: new THREE.BoxGeometry(1, 4, 5.75),
//     SSD_7mm: new THREE.BoxGeometry(7 / 25.4, 2.75, 4),
//     SSD_15mm: new THREE.BoxGeometry(15 / 25.4, 2.75, 4),
//   };

//   private static driveModelLUT: Record<SlotType | string, ModelLoader> = {
//     HDD: lazyModelLoader(() =>
//       loadImageModel(import("./textures/hdd-generic.png"), { width: 1, height: 4 })
//     ),
//     SSD_7mm: lazyModelLoader(() =>
//       loadImageModel(import("./textures/ssd-generic.png"), { width: 7 / 25.4, height: 2.75 })
//     ),
//     SSD_15mm: lazyModelLoader(() =>
//       loadImageModel(import("./textures/ssd-generic.png"), { width: 15 / 25.4, height: 2.75 })
//     ),
//   };

//   private static material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 });
//   private static hoverMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.2 });

//   // private occupiedBy_: SlotType | string | null = null;

//   // private diskModel?: THREE.Object3D;

//   private bounds: THREE.Mesh;

//   public userData: DriveSlot;

//   constructor(
//     public slotType: SlotType,
//     slotId: string
//   ) {
//     super();
//     this.userData = { slotId, drive: null };
//     this.bounds = new THREE.Mesh(
//       DriveSlotComponent.slotTypeBoxLUT[this.slotType],
//       DriveSlotComponent.material.clone()
//     );
//     const boundsBox = new THREE.Box3().setFromObject(this.bounds);
//     const boundsWidth = boundsBox.max.x - boundsBox.min.x;
//     const boundsHeight = boundsBox.max.y - boundsBox.min.y;
//     const boundsDepth = boundsBox.max.z - boundsBox.min.z;
//     this.bounds.position.set(-boundsWidth / 2, -boundsHeight / 2, boundsDepth / 2);
//     this.add(this.bounds);
//     this.addEventListener("mouseenter", () => {
//       this.bounds.material = DriveSlotComponent.hoverMaterial;
//     });
//     this.addEventListener("mouseleave", () => {
//       this.bounds.material = DriveSlotComponent.material;
//     });
//   }

//   setSlotInfo(slotInfo: DriveSlot) {
//     if (slotInfo.slotId !== this.userData.slotId) {
//       throw new ValueError(
//         `Slot ID mismatch! mine: ${this.userData.slotId}, yours: ${slotInfo.slotId}`
//       );
//     }
//     this.userData = slotInfo;
//     const drive = this.userData.drive;
//     if (!drive) {
//       this.bounds.clear();
//     } else {
//       const modelLoader =
//         DriveSlotComponent.driveModelLUT[drive.model] ??
//         DriveSlotComponent.driveModelLUT[this.slotType];
//       modelLoader().then((model) => {
//         this.bounds.add(model.clone());
//       });
//     }
//   }
// }

// Object.values(DriveSlotComponent.slotTypeBoxLUT).map((box) => box.computeBoundingBox());
