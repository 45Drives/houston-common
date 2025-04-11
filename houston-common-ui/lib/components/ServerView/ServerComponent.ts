import * as THREE from "three";
import {
  Server,
  unwrap,
  type DriveSlot,
  type LiveDriveSlotsHandle,
} from "@45drives/houston-common-lib";
import { getDriveModel, type DriveOrientation } from "@/components/ServerView/assets";

export type DriveSlotType = "HDD" | "SSD_7mm" | "SSD_15mm";
export function isDriveSlotType(driveSlotType: string): driveSlotType is DriveSlotType {
  return ["HDD", "SSD_7mm", "SSD_15mm"].includes(driveSlotType);
}

const DEBUG_BOXES = false;

export class BoundingBox extends THREE.Mesh<THREE.BoxGeometry> {
  readonly bound = new THREE.Box3();
  private size = new THREE.Vector3();
  private center = new THREE.Vector3();

  constructor() {
    super();
  }

  resizeTo(object: THREE.Object3D, margin: number = 0) {
    this.bound.setFromObject(object);
    this.bound.getSize(this.size);
    this.bound.getCenter(this.center);
    this.geometry?.dispose();
    this.geometry = new THREE.BoxGeometry(
      this.size.x + margin,
      this.size.y + margin,
      this.size.z + margin
    );
    this.position.copy(this.center);
    console.log("resizeTo");
    console.log("selection box pos:", this.position);
    console.log("objectRef pos:", object.position);
    console.log("box size:", this.size);
  }
}

export class SlotBoundingBox extends BoundingBox {
  constructor(public slotRef: ServerComponentSlot) {
    super();
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
  public boundingBox: SlotBoundingBox;
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

    this.boundingBox = new SlotBoundingBox(this);
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
    this.selectionHighlightBox.resizeTo(this.objectRef, 0.0005);
    this.boundingBox.resizeTo(this.objectRef, 0.001);
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
  private driveModel: THREE.Object3D;

  private modelBoxHelper: THREE.BoxHelper;

  constructor(
    scene: THREE.Scene,
    objectRef: THREE.Object3D,
    slotId: string,
    public driveType: DriveSlotType
  ) {
    super(scene, objectRef, slotId);
    this.driveModel = new THREE.Object3D();
    this.driveModel.visible = false;
    this.modelBoxHelper = new THREE.BoxHelper(this.driveModel, 0x0000ff);
    this.modelBoxHelper.visible = DEBUG_BOXES;
    scene.add(this.driveModel);
    scene.add(this.modelBoxHelper);
  }

  get driveSlot(): DriveSlot {
    return { slotId: this.slotId, drive: this.drive };
  }

  setDrive(drive: DriveSlot["drive"], driveOrientation: DriveOrientation) {
    this.drive = drive;
    if (drive) {
      getDriveModel(this.driveType, drive.model).then((driveModel) => {
        this.driveModel.position.set(0, 0, 0);
        this.driveModel.clear();
        this.driveModel.add(driveModel.clone());
        this.driveModel.updateMatrixWorld(true);
        this.boundingBox.updateMatrixWorld(true);
        const bound = this.boundingBox.bound.clone();
        const slotSize = new THREE.Vector3();
        const slotCenter = new THREE.Vector3();
        bound.getSize(slotSize);
        bound.getCenter(slotCenter);

        bound.setFromObject(this.driveModel);
        const modelSize = new THREE.Vector3();
        const modelCenter = new THREE.Vector3();
        bound.getSize(modelSize);
        bound.getCenter(modelCenter);

        console.log(
          "set drive model",
          "slot location:",
          slotCenter,
          "model location:",
          modelCenter
        );
        console.log("slot size:", slotSize, "model size:", modelSize);

        this.driveModel.position.copy(slotCenter.sub(modelCenter));

        console.log("model location after:", this.driveModel.position);

        this.driveModel.updateMatrix();
        this.driveModel.updateMatrixWorld(true);

        this.modelBoxHelper.update();

        this.driveModel.visible = true;
      });
    } else {
      this.driveModel.visible = false;
    }
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
