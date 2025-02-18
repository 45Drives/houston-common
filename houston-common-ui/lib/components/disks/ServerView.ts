import { Chassis } from "@/components/disks/Chassis";
import { MouseEventTranslator } from "@/components/disks/MouseEventTranslator";
import {
  ServerComponent,
  type ServerComponentEventMap,
  type ServerComponentMouseEvent,
} from "@/components/disks/ServerComponent";
import {
  Server,
  unwrap,
  type DriveSlot,
  type LiveDriveSlotsHandle,
} from "@45drives/houston-common-lib";
import * as THREE from "three";

import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import { LAYER_DEFAULT, LAYER_NO_SELECT } from "./constants";

export class ServerView extends THREE.EventDispatcher<
  ServerComponentEventMap & {
    selectionchange: { type: "selectionchange"; components: ServerComponent[] };
    driveslotchange: { type: "driveslotchange"; slots: DriveSlot[] };
  }
> {
  private renderer = new THREE.WebGLRenderer();
  private camera: THREE.Camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
  private scene: THREE.Scene = new THREE.Scene();
  private controls = new OrbitControls(this.camera, this.renderer.domElement);
  private mouseEventTranslator: MouseEventTranslator;

  private chassis: Promise<Chassis>;

  private resetCameraControlsTimeoutHandle?: number;
  private static resetCameraControlsTimeout = 5000;

  private slotInfoWatchHandle?: LiveDriveSlotsHandle;

  private parentResizeObserver: ResizeObserver;

  constructor(
    public readonly server: Server,
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

    this.camera.position.z = 24;
    this.camera.layers.enable(LAYER_DEFAULT);
    this.camera.layers.enable(LAYER_NO_SELECT);
    this.controls.enableDamping = true;
    this.controls.enablePan = opts.enablePan;
    this.controls.enableZoom = opts.enableZoom;
    this.controls.enableRotate = opts.enableRotate;
    this.controls.enabled = true;
    this.controls.mouseButtons = {
      MIDDLE: THREE.MOUSE.ROTATE,
      RIGHT: THREE.MOUSE.PAN,
      LEFT: null,
    };
    this.controls.update();
    this.controls.saveState();

    this.chassis = unwrap(this.server.getServerModel()).then(
      (modelNumber) => new Chassis(modelNumber.modelNumber)
    );
    this.chassis.then((chassis) => {
      this.scene.add(chassis);
      chassis.addEventListener("selected", (e) => {
        this.dispatchEvent(e);
      });
      chassis.addEventListener("deselected", (e) => {
        this.dispatchEvent(e);
      });
    });

    this.mouseEventTranslator = new MouseEventTranslator(
      this.renderer.domElement,
      this.camera,
      this.scene,
      opts.enableSelection
    );
    this.mouseEventTranslator.addEventListener("selectionchange", (e) => this.dispatchEvent(e));

    this.parentResizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        this.fixCameraAspect(entry.contentRect.width, entry.contentRect.height, true);
        this.chassis
          .then((chassis) => chassis.loaded)
          .then(() => {
            this.zoomFit();
          });
      }
    });
  }

  async start(parent: HTMLElement) {
    this.renderer.setAnimationLoop(() => this.animate());
    parent.appendChild(this.renderer.domElement);
    this.slotInfoWatchHandle = this.server.setupLiveDriveSlotInfo((slotInfo) => {
      this.dispatchEvent({ type: "driveslotchange", slots: slotInfo });
      this.setDriveSlotInfo(slotInfo);
    });
    this.parentResizeObserver.observe(parent);
  }

  stop() {
    if (this.renderer.domElement.parentElement) {
      this.parentResizeObserver.unobserve(this.renderer.domElement.parentElement);
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
    this.renderer.setAnimationLoop(null);
    this.slotInfoWatchHandle?.stop();
  }

  private fixCameraAspect(
    elementWidth: number,
    elementHeight: number,
    updateStyle: boolean = false
  ) {
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
    const chassisBounds = new THREE.Box3().setFromObject(
      await this.chassis.then((chassis) => chassis.loaded).then(() => this.chassis)
    );

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
      this.camera.zoom = 2 / Math.max(projectedSize.x, projectedSize.y);
    } else {
      throw new Error("not implemented");
    }

    this.camera.updateProjectionMatrix();

    this.controls.update();
  }

  setBackground(bg: typeof this.scene.background) {
    this.scene.background = bg;
  }

  async setDriveSlotInfo(slots: DriveSlot[]) {
    (await this.chassis).setDriveSlotInfo(slots);
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
    return this.scene.getObjectsByProperty("selected", true) as ServerComponent[];
  }

  private animate() {
    this.controls.update();
    this.mouseEventTranslator.animate();
    this.renderer.render(this.scene, this.camera);
  }
}
