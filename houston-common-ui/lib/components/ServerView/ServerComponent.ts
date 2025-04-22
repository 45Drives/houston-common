import * as THREE from "three";
import {
  Server,
  unwrap,
  type DriveSlot,
  type LiveDriveSlotsHandle,
} from "@45drives/houston-common-lib";
import { getDriveModel, type DriveOrientation } from "@/components/ServerView/assets";
import { object } from "zod";

export type DriveSlotType = "HDD" | "SSD_7mm" | "SSD_15mm";
export function isDriveSlotType(driveSlotType: string): driveSlotType is DriveSlotType {
  return ["HDD", "SSD_7mm", "SSD_15mm"].includes(driveSlotType);
}

const DEBUG_BOXES = false;

export class BoundingBox<
  TMaterial extends THREE.Material | THREE.Material[] = THREE.Material | THREE.Material[],
> extends THREE.Mesh<THREE.BoxGeometry, TMaterial> {
  readonly bound = new THREE.Box3();
  private size = new THREE.Vector3();

  constructor() {
    super();
  }

  resizeTo(object: THREE.Object3D, margin: number = 0) {
    this.bound.setFromObject(object);
    this.bound.getSize(this.size);
    this.bound.getCenter(this.position);
    this.geometry?.dispose();
    this.geometry = new THREE.BoxGeometry(
      this.size.x + margin,
      this.size.y + margin,
      this.size.z + margin
    );
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

export type ColorFlags<
  TColorMap extends {
    [key: string]: THREE.Color;
  },
> = {
  [Property in keyof TColorMap]: boolean;
};

export class SlotHighlight implements ColorFlags<typeof SlotHighlight.colors> {
  private static HighlightBoxMargin = 0.001;
  static colors = {
    selected: new THREE.Color(0x00ff00),
    highlight: new THREE.Color(0xffffff),
    warning: new THREE.Color(0xf97316),
    error: new THREE.Color(0xff0000),
  };
  static isColorFlag(flag: any): flag is keyof typeof SlotHighlight.colors {
    return typeof flag === "string" && Object.keys(SlotHighlight.colors).includes(flag);
  }
  selected = false;
  highlight = false;
  warning = false;
  error = false;
  private auxColor?: THREE.Color;

  

  box = new BoundingBox<THREE.MeshBasicMaterial>();

  constructor() {
    this.box.material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.5,
    });
  }

  setColor(color: keyof typeof THREE.Color.NAMES | null) {
    this.auxColor = color ? new THREE.Color(color) : undefined;
  }

  animate(time: number) {
    const colors = [];
    if (this.auxColor) {
      colors.push(this.auxColor);
    }
    for (const [key, color] of Object.entries(SlotHighlight.colors) as [
      keyof typeof SlotHighlight.colors,
      THREE.Color,
    ][]) {
      if (this[key]) {
        colors.push(color);
      }
    }
    this.box.visible = colors.length > 0;
    this.lerpColors(colors as [THREE.Color, ...THREE.Color[]], time, 2000, this.box.material.color);
  }

  resizeTo(object: THREE.Object3D) {
    this.box.resizeTo(object, SlotHighlight.HighlightBoxMargin);
  }

  private lerpColors(
    colors: THREE.Color[],
    time: number,
    period: number,
    target?: THREE.Color
  ): THREE.Color {
    target ??= new THREE.Color();
    if (colors.length === 0) {
      return target;
    }
    if (colors.length === 1) {
      return target.copy(colors[0]);
    }
    const index = Math.floor(((time % period) / period) * colors.length);
    const subperiod = period / colors.length;
    // console.log("LERP", index, (index + 1) % color.length, (time % subperiod), subperiod, (time % subperiod) / subperiod);
    return target.lerpColors(
      colors[index],
      colors[(index + 1) % colors.length],
      (time % subperiod) / subperiod
    );
  }
}

export class ServerComponentSlot {
  public highlightBox: SlotHighlight;
  public boundingBox: SlotBoundingBox;
  // protected boxHelper: THREE.BoxHelper;

  readonly BoundingBoxMargin = 0.001;

  constructor(
    public scene: THREE.Scene,
    public objectRef: THREE.Object3D,
    public slotId: string
  ) {
    this.objectRef.visible = false;

    this.boundingBox = new SlotBoundingBox(this);
    this.boundingBox.resizeTo(this.objectRef, this.BoundingBoxMargin);
    this.boundingBox.visible = false;
    this.scene.add(this.boundingBox);

    this.highlightBox = new SlotHighlight();
    this.highlightBox.resizeTo(this.objectRef);
    this.scene.add(this.highlightBox.box);

    // this.boxHelper = new THREE.BoxHelper(this.highlightBox, 0xffff00);
    // this.boxHelper.update();
    // this.scene.add(this.boxHelper);
  }

  get selected() {
    return this.highlightBox.selected;
  }
  set selected(value: boolean) {
    this.highlightBox.selected = value;
  }

  animate(time: number) {
    this.highlightBox.animate(time);
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
    public driveType: DriveSlotType,
    public driveOrientation: DriveOrientation
  ) {
    super(scene, objectRef, slotId);
    this.driveModel = new THREE.Object3D();
    if (driveOrientation === "TopLoader") {
      this.driveModel.rotateX(THREE.MathUtils.degToRad(-90));
      this.driveModel.updateMatrix();
    }
    this.driveModel.visible = false;
    this.modelBoxHelper = new THREE.BoxHelper(this.driveModel, 0x0000ff);
    this.modelBoxHelper.visible = DEBUG_BOXES;
    scene.add(this.driveModel);
    scene.add(this.modelBoxHelper);
  }

  get driveSlot(): DriveSlot {
    return { slotId: this.slotId, drive: this.drive };
  }

  setDrive(drive: DriveSlot["drive"]) {
    if (drive?.model === this.drive?.model) {
      return;
    }
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
        slotSize.subScalar(this.BoundingBoxMargin);
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

        const cornerOffset = slotSize.multiplyScalar(0.5).addScaledVector(modelSize, -0.5);
        switch (this.driveOrientation) {
          case "FrontLoader":
            cornerOffset.multiply({ x: 1, y: 1, z: -1 });
            break;
          case "TopLoader":
            cornerOffset.multiply({ x: 1, y: -1, z: -1 });
            break;
          default:
            break;
        }

        this.driveModel.position.subVectors(slotCenter, modelCenter).add(cornerOffset);

        console.log("model location after:", this.driveModel.position);

        this.driveModel.updateMatrix();
        this.driveModel.updateMatrixWorld(true);

        this.modelBoxHelper.update();

        this.driveModel.visible = true;

        this.highlightBox.resizeTo(this.driveModel);
        // this.boxHelper.update();
      });
    } else {
      this.driveModel.visible = false;
      this.highlightBox.resizeTo(this.objectRef);
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
