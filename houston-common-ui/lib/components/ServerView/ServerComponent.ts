import * as THREE from "three";
import {
  Server,
  unwrap,
  type DriveSlot,
  type LiveDriveSlotsHandle,
} from "@45drives/houston-common-lib";

export type DriveSlotType = "HDD" | "SSD_7mm" | "SSD_15mm";
export function isDriveSlotType(driveSlotType: string): driveSlotType is DriveSlotType {
  return ["HDD", "SSD_7mm", "SSD_15mm"].includes(driveSlotType);
}

const DEBUG_BOXES = false;

export class BoundingBox extends THREE.Mesh {
  constructor() {
    super();
  }

  resizeTo(object: THREE.Object3D, margin: number = 0) {
    const bound = new THREE.Box3().setFromObject(object);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    bound.getSize(size);
    bound.getCenter(center);
    this.geometry?.dispose();
    this.geometry = new THREE.BoxGeometry(size.x + margin, size.y + margin, size.z + margin);
    this.position.copy(center);
    console.log("resizeTo");
    console.log("selection box pos:", this.getWorldPosition(new THREE.Vector3()));
    console.log("objectRef pos:", object.getWorldPosition(new THREE.Vector3()));
    console.log("box size:", size);
  }
}

export class SelectionHighlight extends BoundingBox {
  private static material: THREE.MeshBasicMaterial = new THREE.MeshBasicMaterial({
    color: 0x00ff00,
    transparent: true,
    opacity: 0.25,
  });

  constructor() {
    super();
    this.material = SelectionHighlight.material;
  }
}

export class SelectionPreviewHighlight extends BoundingBox {
  private static material: THREE.MeshBasicMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.125,
  });

  constructor() {
    super();
    this.material = SelectionPreviewHighlight.material;
  }
}

export class ServerComponentSlot {
  private _selected = false;
  private selectionHighlightBox: SelectionHighlight;
  public boundingBox: BoundingBox;
  private boxHelper: THREE.BoxHelper;

  constructor(
    public scene: THREE.Scene,
    public objectRef: THREE.Object3D,
    public slotId: string
  ) {
    this.objectRef.visible = false;

    this.selectionHighlightBox = new SelectionHighlight();
    this.selectionHighlightBox.visible = false;
    this.scene.add(this.selectionHighlightBox);

    this.boundingBox = new BoundingBox();
    this.boundingBox.material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.125,
    });
    this.boundingBox.visible = false;
    this.scene.add(this.boundingBox);

    this.boxHelper = new THREE.BoxHelper(this.boundingBox, 0xffff00);
    this.boxHelper.visible = DEBUG_BOXES;
    this.scene.add(this.boxHelper);

    this.updateBounds();
  }

  updateBounds() {
    this.selectionHighlightBox.resizeTo(this.objectRef);
    this.boundingBox.resizeTo(this.objectRef);
    this.boxHelper.update();
  }

  set selected(value: boolean) {
    if (value === this._selected) {
      return;
    }
    if (value) {
      this.selectionHighlightBox.visible = true;
    } else {
      this.selectionHighlightBox.visible = false;
    }
    this._selected = value;
  }

  get selected() {
    return this._selected;
  }

  set highlight(value: boolean) {
    if (value) {
      this.boundingBox.visible = true;
    } else {
      this.boundingBox.visible = false;
    }
  }
}

export class ServerDriveSlot extends ServerComponentSlot {
  public readonly isDriveSlot = true;
  private drive: DriveSlot["drive"] = null;
  constructor(
    scene: THREE.Scene,
    objectRef: THREE.Object3D,
    slotId: string,
    public driveType: DriveSlotType
  ) {
    super(scene, objectRef, slotId);
  }

  get driveSlot(): DriveSlot {
    return { slotId: this.slotId, drive: this.drive };
  }

  setDrive(drive: DriveSlot["drive"]) {
    this.drive = drive;
    // TODO: load drive model
  }
}

export type ServerComponentSlotMouseEventTypes = "click" | "mouseenter" | "mouseleave";

export type ServerComponentSlotMouseEvent<Type extends ServerComponentSlotMouseEventTypes> = Pick<
  MouseEvent,
  "altKey" | "button" | "buttons" | "ctrlKey" | "metaKey" | "shiftKey"
> & { type: Type; ray: THREE.Ray; point?: THREE.Vector3 };

export type ServerComponentSlotEventMap = {
  click: ServerComponentSlotMouseEvent<"click">;
  mouseenter: ServerComponentSlotMouseEvent<"mouseenter">;
  mouseleave: ServerComponentSlotMouseEvent<"mouseleave">;
  selected: { slot: ServerComponentSlot };
  deselected: { slot: ServerComponentSlot };
} & THREE.Object3DEventMap;

// import * as THREE from "three";
// import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// THREE.Cache.enabled = true;

// export type ModelLoader = () => Promise<THREE.Object3D>;

// export type ServerComponentMouseEventTypes = "click" | "mouseenter" | "mouseleave";

// export type ServerComponentMouseEvent<Type extends ServerComponentMouseEventTypes> = Pick<
//   MouseEvent,
//   "altKey" | "button" | "buttons" | "ctrlKey" | "metaKey" | "shiftKey"
// > & {
//   type: Type;
//   ray: THREE.Ray;
//   point?: THREE.Vector3;
// };

// export type ServerComponentEventMap = {
//   click: ServerComponentMouseEvent<"click">;
//   mouseenter: ServerComponentMouseEvent<"mouseenter">;
//   mouseleave: ServerComponentMouseEvent<"mouseleave">;
//   selected: { component: ServerComponent };
//   deselected: { component: ServerComponent };
// } & THREE.Object3DEventMap;

// export class ServerComponent extends THREE.Object3D<ServerComponentEventMap> {
//   loaded: Promise<boolean>;

//   constructor(modelLoader?: ModelLoader) {
//     super();
//     if (modelLoader) {
//       this.loaded = modelLoader().then((model) => {
//         this.add(model);
//         return true;
//       });
//     } else {
//       this.loaded = Promise.resolve(true);
//     }
//   }

//   static isValidEvent(event: { type: string }): event is { type: ServerComponentMouseEventTypes } {
//     return ["click", "dblclick", "mouseenter", "mouseleave"].includes(event.type);
//   }
// }

// const gltfLoader = new GLTFLoader();
// export function gltfModelLoader(url: string): ModelLoader {
//   return () => gltfLoader.loadAsync(url).then((gltf) => gltf.scene);
// }

// const textureLoader = new THREE.TextureLoader();
// export function loadImageModel(
//   imp: Promise<typeof import("*.png") | typeof import("*.jpg") | typeof import("*.svg")>,
//   size: { width?: number; height?: number } = {}
// ) {
//   return imp.then(({ default: url }) =>
//     textureLoader.loadAsync(url).then((texture) => {
//       texture.magFilter = THREE.NearestFilter;
//       texture.minFilter = THREE.NearestFilter;
//       texture.generateMipmaps = false;
//       const aspect = texture.image.width / texture.image.height;
//       let { width, height } = size;
//       if (width === undefined && height === undefined) {
//         width = texture.image.width as number;
//         height = texture.image.height as number;
//       } else if (width) {
//         height = width / aspect;
//       } else if (height) {
//         width = height * aspect;
//       }
//       console.log("imageModelLoader size", width, height);
//       return new THREE.Mesh(
//         new THREE.PlaneGeometry(width, height),
//         new THREE.MeshBasicMaterial({ map: texture })
//       );
//     })
//   );
// }
// export function imageModelLoader(
//   imp: Promise<typeof import("*.png") | typeof import("*.jpg") | typeof import("*.svg")>,
//   size?: { width?: number; height?: number }
// ): ModelLoader {
//   return () => loadImageModel(imp, size);
// }

// export function lazyModelLoader(loader: ModelLoader): ModelLoader {
//   let model: Promise<THREE.Object3D> | null = null;

//   return () => (model ? model : (model = loader()));
// }

// export class SelectionHighlight extends THREE.Mesh {
//   private static material: THREE.MeshBasicMaterial = new THREE.MeshBasicMaterial({
//     color: 0x00ff00,
//     transparent: true,
//     opacity: 0.25,
//   });
//   constructor() {
//     super();
//     this.material = SelectionHighlight.material;
//   }

//   resizeTo(object: THREE.Object3D, margin: number = 0.1) {
//     const bound = new THREE.Box3().setFromObject(object);
//     const size = new THREE.Vector3();
//     const center = new THREE.Vector3();
//     bound.getSize(size);
//     bound.getCenter(center);
//     this.geometry?.dispose();
//     this.geometry = new THREE.BoxGeometry(size.x + margin, size.y + margin, size.z + margin);
//     this.position.copy(center.sub(object.position));
//   }
// }

// type Constructor<T = {}> = new (...args: any[]) => T;
// export function Selectable<TBase extends Constructor<ServerComponent>>(Base: TBase) {
//   return class Selectable extends Base {
//     _selected: boolean = false;
//     _selectionHighlightBox: SelectionHighlight;
//     constructor(...args: any[]) {
//       super(...args);
//       this._selectionHighlightBox = new SelectionHighlight();
//       this._selectionHighlightBox.resizeTo(this);
//     }

//     get selected(): boolean {
//       return this._selected;
//     }

//     set selected(value: boolean) {
//       if (value === this._selected) {
//         return;
//       }
//       let eventType: "selected" | "deselected";
//       if (value) {
//         this._selectionHighlightBox.resizeTo(this);
//         this.add(this._selectionHighlightBox);
//         eventType = "selected";
//       } else {
//         this.remove(this._selectionHighlightBox);
//         eventType = "deselected";
//       }
//       this._selected = value;
//       this.dispatchEvent({ type: eventType, component: this });
//     }
//   };
// }
