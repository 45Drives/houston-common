import { Chassis } from "@/components/disks/Chassis";
import { MouseEventTranslator } from "@/components/disks/MouseEventTranslator";
import {
  ServerComponent,
  type ServerComponentEventMap,
  type ServerComponentMouseEvent,
} from "@/components/disks/ServerComponent";
import type { LSDevDisk, SlotType } from "@45drives/houston-common-lib";
import * as THREE from "three";

import { OrbitControls } from "three/addons/controls/OrbitControls.js";

function projectBox3ToCamera(box3: THREE.Box3, camera: THREE.Camera) {
  const points = [
    new THREE.Vector3(box3.min.x, box3.min.y, box3.min.z),
    new THREE.Vector3(box3.min.x, box3.min.y, box3.max.z),
    new THREE.Vector3(box3.min.x, box3.max.y, box3.min.z),
    new THREE.Vector3(box3.min.x, box3.max.y, box3.max.z),
    new THREE.Vector3(box3.max.x, box3.min.y, box3.min.z),
    new THREE.Vector3(box3.max.x, box3.min.y, box3.max.z),
    new THREE.Vector3(box3.max.x, box3.max.y, box3.min.z),
    new THREE.Vector3(box3.max.x, box3.max.y, box3.max.z),
  ];

  const projectedPoints = points.map((point) => {
    // Convert world position to normalized device coordinates (NDC)
    const ndc = point.project(camera);
    return new THREE.Vector2(ndc.x, ndc.y);
  });

  // Find the min and max coordinates in screen space
  const minX = Math.min(...projectedPoints.map((p) => p.x));
  const maxX = Math.max(...projectedPoints.map((p) => p.x));
  const minY = Math.min(...projectedPoints.map((p) => p.y));
  const maxY = Math.max(...projectedPoints.map((p) => p.y));

  return new THREE.Box2(new THREE.Vector2(minX, minY), new THREE.Vector2(maxX, maxY));
}

export class ServerView extends THREE.EventDispatcher<
  ServerComponentEventMap & {
    selectionchange: { type: "selectionchange"; components: ServerComponent[] };
  }
> {
  private renderer = new THREE.WebGLRenderer();
  // private camera: THREE.Camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
  private camera: THREE.Camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
  private scene: THREE.Scene = new THREE.Scene();
  private controls = new OrbitControls(this.camera, this.renderer.domElement);
  private mouseEventTranslator: MouseEventTranslator;

  private chassis: Chassis;

  private resetCameraControlsTimeoutHandle?: number;
  private static resetCameraControlsTimeout = 5000;

  constructor(
    modelNumber: string,
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
    this.mouseEventTranslator = new MouseEventTranslator(
      this.renderer.domElement,
      this.camera,
      this.scene,
      opts.enableSelection
    );
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.camera.position.z = 24;
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
    this.renderer.domElement.addEventListener("mouseleave", () => {
      window.clearTimeout(this.resetCameraControlsTimeoutHandle);
      this.resetCameraControlsTimeoutHandle = window.setTimeout(() => {
        this.controls.reset();
        this.controls.update();
      }, ServerView.resetCameraControlsTimeout);
    });
    this.renderer.domElement.addEventListener("mousemove", () => {
      window.clearTimeout(this.resetCameraControlsTimeoutHandle);
      this.resetCameraControlsTimeoutHandle = undefined;
    });

    this.chassis = new Chassis(modelNumber);
    this.scene.add(this.chassis);

    this.chassis.addEventListener("selected", (e) => {
      this.dispatchEvent(e);
    });
    this.chassis.addEventListener("deselected", (e) => {
      this.dispatchEvent(e);
    });
    this.mouseEventTranslator.addEventListener("selectionchange", (e) => this.dispatchEvent(e));

    this.chassis.loaded.then(() => {
      this.zoomFit();
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
  }

  start(parent?: HTMLElement | null) {
    this.renderer.setAnimationLoop(() => this.animate());
    parent?.appendChild(this.renderer.domElement);
  }

  stop(parent?: HTMLElement | null) {
    parent?.removeChild(this.renderer.domElement);
    this.renderer.setAnimationLoop(null);
  }

  zoomFit() {
    const aspect = this.renderer.domElement.width / this.renderer.domElement.height;
    const chassisBounds = new THREE.Box3().setFromObject(this.chassis);

    const projectedBounds = projectBox3ToCamera(chassisBounds, this.camera);

    if (this.camera instanceof THREE.OrthographicCamera) {
      let width = this.camera.right - this.camera.left;
      let height = this.camera.top - this.camera.bottom;

      if (aspect >= 1) {
        height = projectedBounds.max.y - projectedBounds.min.y;
        width = height * aspect;
      } else {
        width = projectedBounds.max.x - projectedBounds.min.x;
        height = width / aspect;
      }

      console.log("zoomFit size", width, height);

      this.camera.left = -width / 2;
      this.camera.right = width / 2;
      this.camera.top = height / 2;
      this.camera.bottom = -height / 2;

      this.camera.updateProjectionMatrix();

      this.controls.update();
    } else {
      throw new Error("not implemented");
    }
  }

  setBackground(bg: typeof this.scene.background) {
    this.scene.background = bg;
  }

  setDiskSlotInfo(slots: LSDevDisk[]) {
    this.chassis.setDiskSlotInfo(slots);
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
    return this.scene.getObjectsByProperty("selected", true);
  }

  private animate() {
    this.controls.update();
    this.mouseEventTranslator.animate();
    this.renderer.render(this.scene, this.camera);
  }
}
