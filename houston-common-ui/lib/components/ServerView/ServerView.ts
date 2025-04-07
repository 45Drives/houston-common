import * as THREE from "three";
// import { Chassis } from "@/components/ServerView/Chassis";

import { MouseEventTranslator } from "@/components/ServerView/MouseEventTranslator";
// import {
//   ServerComponent,
//   type ServerComponentEventMap,
//   type ServerComponentMouseEvent,
// } from "@/components/ServerView/ServerComponent";
import {
  Server,
  unwrap,
  type DriveSlot,
  type LiveDriveSlotsHandle,
} from "@45drives/houston-common-lib";

import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import { LAYER_DEFAULT, LAYER_NO_SELECT } from "./constants";

import { getChassisModel } from "@/components/ServerView/assets";
import {
  isDriveSlotType,
  ServerComponentSlot,
  ServerDriveSlot,
  type ServerComponentSlotEventMap,
} from "./ServerComponent";

export class ServerView extends THREE.EventDispatcher<
  ServerComponentSlotEventMap & {
    selectionchange: { type: "selectionchange"; components: ServerComponentSlot[] };
    driveslotchange: { type: "driveslotchange"; slots: DriveSlot[] };
  }
> {
  private renderer = new THREE.WebGLRenderer();
  private camera: THREE.Camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 100);
  private scene: THREE.Scene = new THREE.Scene();
  private controls = new OrbitControls(this.camera, this.renderer.domElement);
  private mouseEventTranslator: MouseEventTranslator;

  private chassis: Promise<THREE.Object3D>;

  private resetCameraControlsTimeoutHandle?: number;
  private static resetCameraControlsTimeout = 5000;

  private parentResizeObserver: ResizeObserver;

  private componentSlots: ServerComponentSlot[];

  constructor(
    public readonly serverModel: string,
    opts: {
      enableSelection?: boolean;
      enableRotate?: boolean;
      enablePan?: boolean;
      enableZoom?: boolean;
    } = {}
  ) {
    super();
    opts.enableSelection ??= false;
    opts.enableRotate ??= false;
    opts.enablePan ??= false;
    opts.enableZoom ??= false;

    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.renderer.domElement.addEventListener("mouseleave", () => {
      window.clearTimeout(this.resetCameraControlsTimeoutHandle);
      this.resetCameraControlsTimeoutHandle = window.setTimeout(() => {
        this.controls.reset();
        this.controls.update();
        this.zoomFit();
      }, ServerView.resetCameraControlsTimeout);
    });
    this.renderer.domElement.addEventListener("mousemove", () => {
      window.clearTimeout(this.resetCameraControlsTimeoutHandle);
      this.resetCameraControlsTimeoutHandle = undefined;
    });
    this.renderer.domElement.addEventListener("mousedown", (event) => {
      this.mouseEventTranslator.translateMouseClick(event as MouseEvent & { type: "mousedown" });
    });
    this.renderer.domElement.addEventListener("mouseup", (event) => {
      this.mouseEventTranslator.translateMouseClick(event as MouseEvent & { type: "mouseup" });
    });
    this.renderer.domElement.addEventListener("mousemove", (event) => {
      this.mouseEventTranslator.translateMouseOver(event as MouseEvent & { type: "mousemove" });
    });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // default THREE.PCFShadowMap

    this.camera.position.z = 1;
    this.camera.layers.enable(LAYER_DEFAULT);
    this.camera.layers.enable(LAYER_NO_SELECT);
    this.controls.enableDamping = true;
    this.controls.enablePan = opts.enablePan;
    this.controls.enableZoom = opts.enableZoom;
    this.controls.enableRotate = opts.enableRotate;
    this.controls.enabled = true;
    this.controls.mouseButtons = { MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN, LEFT: null };
    this.controls.update();
    this.controls.saveState();

    this.scene.add(new THREE.AmbientLight(0xffffff, 1));
    const light = new THREE.DirectionalLight();
    light.position.set(0, 0, 10);
    light.target.position.set(0, 0, 0);
    light.castShadow = true;
    //Set up shadow properties for the light
    light.shadow.mapSize.width = 512; // default
    light.shadow.mapSize.height = 512; // default
    light.shadow.camera.near = 0.5; // default
    light.shadow.camera.far = 500; // default
    this.scene.add(light);
    this.scene.add(light.target);

    this.componentSlots = [];

    this.chassis = getChassisModel(serverModel)
      .then((chassis) => {
        const box = new THREE.Box3().setFromObject(chassis);
        const center = new THREE.Vector3();
        box.getCenter(center);
        chassis.position.set(-center.x, -center.y, -center.z);
        chassis.updateMatrix();
        chassis.updateMatrixWorld(true);
        chassis.traverse((obj) => {
          obj.castShadow = true;
          obj.receiveShadow = true;
          if (typeof obj.userData.Slot === "string") {
            if (isDriveSlotType(obj.userData.DriveType)) {
              this.componentSlots.push(
                new ServerDriveSlot(this.scene, obj, obj.userData.Slot, obj.userData.DriveType)
              );
            } else {
              this.componentSlots.push(new ServerComponentSlot(this.scene, obj, obj.userData.Slot));
            }
          }
        });
        this.scene.add(chassis);
        return chassis;
      });

    this.mouseEventTranslator = new MouseEventTranslator(
      this.renderer.domElement,
      this.camera,
      this.scene,
      opts.enableSelection,
      this.componentSlots
    );
    this.mouseEventTranslator.addEventListener("selectionchange", (e) => this.dispatchEvent(e));

    this.parentResizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        this.fixCameraAspect(entry.contentRect.width, entry.contentRect.height, true);
        this.chassis
          // .then((chassis) => chassis.loaded)
          .then(() => {
            this.zoomFit();
          });
      }
    });
  }

  async start(parent: HTMLElement) {
    this.renderer.setAnimationLoop(() => this.animate());
    parent.appendChild(this.renderer.domElement);
    this.parentResizeObserver.observe(parent);
  }

  stop() {
    if (this.renderer.domElement.parentElement) {
      this.parentResizeObserver.unobserve(this.renderer.domElement.parentElement);
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
    this.renderer.setAnimationLoop(null);
  }

  private fixCameraAspect(
    elementWidth: number,
    elementHeight: number,
    updateStyle: boolean = false
  ) {
    if (elementWidth === 0 || elementHeight === 0) {
      return;
    }
    this.renderer.setSize(elementWidth, elementHeight, updateStyle);

    const aspect = elementWidth / elementHeight;
    if (this.camera instanceof THREE.OrthographicCamera) {
      let width = this.camera.right - this.camera.left;
      let height = this.camera.top - this.camera.bottom;

      if (aspect >= 1) {
        width = height * aspect;
      } else {
        height = width / aspect;
      }

      this.camera.left = -width / 2;
      this.camera.right = width / 2;
      this.camera.top = height / 2;
      this.camera.bottom = -height / 2;
    } else if (this.camera instanceof THREE.PerspectiveCamera) {
      this.camera.aspect = aspect;
    } else {
      throw new Error("not implemented");
    }

    this.camera.updateProjectionMatrix();

    this.controls.update();
  }

  async zoomFit(margin: number = 0.9) {
    const chassisBounds = new THREE.Box3().setFromObject(await this.chassis);

    if (this.camera instanceof THREE.OrthographicCamera) {
      this.camera.zoom = 1;
      this.camera.updateProjectionMatrix();
    } else {
      throw new Error("not implemented");
    }

    const projectedBounds = chassisBounds.clone().applyMatrix4(this.camera.projectionMatrix);
    console.log("projected bounds:", projectedBounds);

    const projectedSize = new THREE.Vector3();
    projectedBounds.getSize(projectedSize);
    console.log("projected size:", projectedSize);

    if (this.camera instanceof THREE.OrthographicCamera) {
      this.camera.zoom = (2 / Math.max(projectedSize.x, projectedSize.y)) * margin;
    } else {
      throw new Error("not implemented");
    }

    this.camera.updateProjectionMatrix();

    this.controls.update();
  }

  /**
   * Set background color hex
   * @param bg color hex e.g. 0xFFFFFF = white
   */
  setBackground(bg: number) {
    this.scene.background = new THREE.Color(bg);
  }

  async setDriveSlotInfo(slots: DriveSlot[]) {
    await this.chassis;
    this.dispatchEvent({ type: "driveslotchange", slots });
    slots.forEach((slot) => {
      const componentSlot = this.componentSlots.find((s) => s.slotId === slot.slotId);
      if (componentSlot instanceof ServerDriveSlot) {
        componentSlot.setDrive(slot.drive);
      } else if (componentSlot !== undefined) {
        console.log("not a drive slot:", componentSlot);
        console.log("is component slot:", componentSlot instanceof ServerComponentSlot);
      } else {
        console.log(Object.fromEntries(this.componentSlots.entries()));
        globalThis.reportHoustonError(new Error(`Drive slot not found: ${slot.slotId}`));
      }
    });
    const selected = this.getSelectedComponents();
    if (selected.length) {
      this.dispatchEvent({ type: "selectionchange", components: selected });
    }
  }

  set enableControls(value: boolean) {
    this.controls.enabled = value;
  }
  get enableControls() {
    return this.controls.enabled;
  }

  set enableSelection(value: boolean) {
    this.mouseEventTranslator.enableSelection = value;
  }
  get enableSelection() {
    return this.mouseEventTranslator.enableSelection;
  }

  set enableRotate(value: boolean) {
    this.controls.enableRotate = value;
  }
  get enableRotate() {
    return this.controls.enableRotate;
  }

  set enablePan(value: boolean) {
    this.controls.enablePan = value;
  }
  get enablePan() {
    return this.controls.enablePan;
  }

  set enableZoom(value: boolean) {
    this.controls.enableZoom = value;
  }
  get enableZoom() {
    return this.controls.enableZoom;
  }

  getSelectedComponents() {
    return [...this.componentSlots.values()].filter((slot) => slot.selected);
  }

  private animate() {
    this.controls.update();
    this.mouseEventTranslator.animate();
    this.renderer.render(this.scene, this.camera);
  }
}
