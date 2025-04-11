import * as THREE from "three";

import { MouseEventTranslator } from "@/components/ServerView/MouseEventTranslator";
import {
  Server,
  unwrap,
  type DriveSlot,
  type LiveDriveSlotsHandle,
} from "@45drives/houston-common-lib";

import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import { LAYER_DEFAULT, LAYER_NO_SELECT } from "./constants";

import { getChassisModel, type DriveOrientation } from "@/components/ServerView/assets";
import {
  isDriveSlotType,
  ServerComponentSlot,
  ServerDriveSlot,
  type ServerComponentSlotEventMap,
} from "./ServerComponent";

type CameraSetPoint = {
  position: THREE.Vector3;
  focusPoint: THREE.Vector3;
  zoom: number;
};

type CameraView = "InitialView" | "DriveView";

class CameraSetpointController {
  private initialView: CameraSetPoint;
  private driveView: CameraSetPoint;
  private view: CameraView;
  private t0?: number;
  private setpoint: CameraSetPoint;
  private lambda: number;
  private focusPoint: THREE.Vector3;
  private atFocusPointResolver?: () => void;
  constructor(
    camera: THREE.OrthographicCamera | THREE.PerspectiveCamera,
    chassis: THREE.Object3D,
    componentSlots: ServerComponentSlot[],
    driveOrientation: DriveOrientation
  ) {
    this.lambda = 0.005;
    this.focusPoint = new THREE.Vector3(0, 0, 0);
    this.view = "InitialView";
    const views = this.getViews(camera, chassis, componentSlots, driveOrientation);
    this.initialView = views.initialView;
    this.driveView = views.driveView;
    this.setpoint = this.lookupSetpoint(this.view);
  }

  forceView(view: CameraView, camera: THREE.OrthographicCamera | THREE.PerspectiveCamera) {
    this.view = view;
    this.setpoint = this.lookupSetpoint(this.view);
    this.updateCameraPosition(camera, 0, true);
  }

  setView(view: CameraView) {
    this.view = view;
    this.setpoint = this.lookupSetpoint(this.view);
    return new Promise<void>((resolve) => {
      this.atFocusPointResolver = resolve;
    })
      .then(() => {
        console.log("at setpoint", view);
      })
      .finally(() => {
        this.atFocusPointResolver = undefined;
      });
  }

  private lookupSetpoint(view: CameraView) {
    switch (view) {
      case "InitialView":
        return this.initialView;
      case "DriveView":
        return this.driveView;
      default:
        throw new Error(`Invalid camera view: ${this.view}`);
    }
  }

  updateCameraPosition(
    camera: THREE.OrthographicCamera | THREE.PerspectiveCamera,
    time: number,
    force: boolean = false
  ) {
    if (force) {
      camera.position.copy(this.setpoint.position);
      camera.updateMatrix();
      this.focusPoint = this.setpoint.focusPoint;
      camera.lookAt(this.focusPoint);
      camera.zoom = this.setpoint.zoom;
      camera.updateProjectionMatrix();
      this.atFocusPointResolver?.();
      return;
    }
    if (this.t0 === undefined) {
      this.t0 = time;
      return;
    }
    const dt = time - this.t0;
    this.t0 = time;
    const dampClamp = (
      x: number,
      y: number,
      lambda: number,
      dt: number,
      maxSpeed: number
    ): number => {
      const damped = THREE.MathUtils.damp(x, y, lambda, dt);
      const dx = THREE.MathUtils.clamp(damped - x, -maxSpeed * dt, maxSpeed * dt);
      return x + dx;
    };

    this.focusPoint.x = dampClamp(
      this.focusPoint.x,
      this.setpoint.focusPoint.x,
      this.lambda,
      dt,
      0.001
    );
    this.focusPoint.y = dampClamp(
      this.focusPoint.y,
      this.setpoint.focusPoint.y,
      this.lambda,
      dt,
      0.001
    );
    this.focusPoint.z = dampClamp(
      this.focusPoint.z,
      this.setpoint.focusPoint.z,
      this.lambda,
      dt,
      0.001
    );

    const relSpherical = new THREE.Spherical()
      .setFromVector3(camera.position.clone().sub(this.focusPoint))
      .makeSafe();
    const targetRelSpherical = new THREE.Spherical()
      .setFromVector3(this.setpoint.position.clone().sub(this.setpoint.focusPoint))
      .makeSafe();
    relSpherical.radius = dampClamp(
      relSpherical.radius,
      targetRelSpherical.radius,
      this.lambda,
      dt,
      0.0005
    );
    relSpherical.phi = dampClamp(relSpherical.phi, targetRelSpherical.phi, this.lambda, dt, 0.001);
    relSpherical.theta = dampClamp(
      relSpherical.theta,
      targetRelSpherical.theta,
      this.lambda,
      dt,
      0.0005
    );

    camera.position.copy(new THREE.Vector3().setFromSpherical(relSpherical).add(this.focusPoint));
    camera.zoom = dampClamp(camera.zoom, this.setpoint.zoom, this.lambda, dt, 0.01);

    camera.lookAt(this.focusPoint);

    camera.updateProjectionMatrix();

    const threshSq = 0.002 ** 2;

    if (
      camera.position.distanceToSquared(this.setpoint.position) < threshSq &&
      this.focusPoint.distanceToSquared(this.setpoint.focusPoint) < threshSq &&
      Math.abs(camera.zoom - this.setpoint.zoom) < 0.01
    ) {
      this.atFocusPointResolver?.();
    }
  }

  updateViews(
    camera: THREE.OrthographicCamera | THREE.PerspectiveCamera,
    chassis: THREE.Object3D,
    componentSlots: ServerComponentSlot[],
    driveOrientation: DriveOrientation
  ) {
    const views = this.getViews(camera, chassis, componentSlots, driveOrientation);
    this.initialView = views.initialView;
    this.driveView = views.driveView;
    this.setpoint = this.lookupSetpoint(this.view);
  }

  private getViews(
    camera: THREE.OrthographicCamera | THREE.PerspectiveCamera,
    chassis: THREE.Object3D,
    componentSlots: ServerComponentSlot[],
    driveOrientation: DriveOrientation
  ) {
    camera = camera.clone(false); // don't affect passed in camera
    const getView = (
      position: THREE.Vector3,
      zoomMargin: number,
      ...focusOn: THREE.Object3D[]
    ): CameraSetPoint => {
      camera.position.copy(position);

      const bounds = focusOn
        .map((obj) => {
          obj.updateMatrixWorld(true);
          return new THREE.Box3().setFromObject(obj);
        })
        .reduce(
          (bounds, objBounds, index) =>
            index === 0 ? bounds.copy(objBounds) : bounds.union(objBounds),
          new THREE.Box3()
        );

      const focusPoint = new THREE.Vector3();
      bounds.getCenter(focusPoint);

      camera.lookAt(focusPoint);

      if (camera instanceof THREE.OrthographicCamera) {
        camera.zoom = 1;
        camera.updateProjectionMatrix();
      } else {
        throw new Error("not implemented");
      }

      const projectedBounds = bounds.clone().applyMatrix4(camera.projectionMatrix);
      console.log("projected bounds:", projectedBounds);

      const projectedSize = new THREE.Vector3();
      projectedBounds.getSize(projectedSize);
      console.log("projected size:", projectedSize);

      if (camera instanceof THREE.OrthographicCamera) {
        camera.zoom = (2 / Math.max(projectedSize.x, projectedSize.y)) * zoomMargin;
      } else {
        throw new Error("not implemented");
      }

      camera.updateProjectionMatrix();

      return {
        position: camera.position.clone(),
        focusPoint,
        zoom: camera.zoom,
      };
    };
    const position = new THREE.Vector3();
    position.set(2, 2, 2);
    const initialView: CameraSetPoint = getView(position, 0.75, chassis);
    switch (driveOrientation) {
      case "FrontLoader":
        position.set(0, 0, 2);
        break;
      case "TopLoader":
        position.set(0, 2, 0.1);
        break;
      default:
        throw new Error(`DriveOrientation not implemented: ${driveOrientation}`);
    }

    const driveView: CameraSetPoint = getView(
      position,
      0.75,
      ...componentSlots
        .filter((slot) => slot instanceof ServerDriveSlot)
        .map((slot) => slot.boundingBox)
    );
    return {
      initialView,
      driveView,
    };
  }
}

export class ServerView extends THREE.EventDispatcher<
  ServerComponentSlotEventMap & {
    selectionchange: { type: "selectionchange"; components: ServerComponentSlot[] };
    driveslotchange: { type: "driveslotchange"; slots: DriveSlot[] };
  }
> {
  private renderer = new THREE.WebGLRenderer({ antialias: false });
  private camera: THREE.OrthographicCamera | THREE.PerspectiveCamera = new THREE.OrthographicCamera(
    -1,
    1,
    1,
    -1,
    0,
    100
  );
  private scene: THREE.Scene = new THREE.Scene();
  private controls = new OrbitControls(this.camera, this.renderer.domElement);
  private mouseEventTranslator: MouseEventTranslator;

  private chassis: Promise<THREE.Object3D>;

  private resetCameraControlsTimeoutHandle?: number;
  private static resetCameraControlsTimeout = 5000;

  private parentResizeObserver: ResizeObserver;

  private componentSlots: ServerComponentSlot[];

  private driveOrientation: DriveOrientation;
  private cameraSetpointController: Promise<CameraSetpointController>;

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
    // this.renderer.domElement.addEventListener("mouseleave", () => {
    //   window.clearTimeout(this.resetCameraControlsTimeoutHandle);
    //   this.resetCameraControlsTimeoutHandle = window.setTimeout(() => {
    //     this.controls.reset();
    //     this.controls.update();
    //     this.zoomFit();
    //   }, ServerView.resetCameraControlsTimeout);
    // });
    // this.renderer.domElement.addEventListener("mousemove", () => {
    //   window.clearTimeout(this.resetCameraControlsTimeoutHandle);
    //   this.resetCameraControlsTimeoutHandle = undefined;
    // });
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
    // this.controls.enableDamping = true;
    this.controls.enablePan = opts.enablePan;
    this.controls.enableZoom = opts.enableZoom;
    this.controls.enableRotate = opts.enableRotate;
    this.controls.enabled = true;
    this.controls.mouseButtons = { MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN, LEFT: null };
    // this.controls.update();
    // this.controls.saveState();
    // this.controls.zoomToCursor = true;
    this.scene.add(this.camera);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.75));

    this.componentSlots = [];

    const { model: chassisModelPromise, driveOrientation } = getChassisModel(serverModel);
    this.driveOrientation = driveOrientation;
    this.chassis = chassisModelPromise.then((chassis) => {
      const box = new THREE.Box3().setFromObject(chassis);
      const center = new THREE.Vector3();
      box.getCenter(center);
      chassis.position.set(-center.x, -center.y, -center.z);
      chassis.updateMatrix();
      chassis.updateMatrixWorld(true);
      chassis.traverse((obj) => {
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
      const light = new THREE.PointLight();
      light.castShadow = true;
      //Set up shadow properties for the light
      light.shadow.mapSize.width = 512;
      light.shadow.mapSize.height = 512;
      light.shadow.camera.near = 0;
      light.shadow.camera.far = 10;
      light.intensity = 1;
      for (const [position, intensity] of [
        [new THREE.Vector3(-0.25, 0, 1), 1], // front
        [new THREE.Vector3(0, 0.5, 0), 0.5], // top
        [new THREE.Vector3(0, 0.25, -1), 1], // rear
      ] as [THREE.Vector3, number][]) {
        light.position.copy(position);
        light.intensity = intensity;
        chassis.add(light.clone());
      }
      light.dispose();
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
      }
    });

    this.cameraSetpointController = this.chassis.then((chassis) => {
      const ctrlr = new CameraSetpointController(
        this.camera,
        chassis,
        this.componentSlots,
        this.driveOrientation
      );
      ctrlr.forceView("InitialView", this.camera);
      return ctrlr;
    });
  }

  start(parent: HTMLElement) {
    this.renderer.setAnimationLoop((time) => this.animate(time));
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

  setView(view: CameraView) {
    return this.cameraSetpointController.then((c) => c.setView(view));
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

    this.chassis.then((chassis) => {
      this.cameraSetpointController.then((c) =>
        c.updateViews(this.camera, chassis, this.componentSlots, this.driveOrientation)
      );
    });
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

  private animate(time: number) {
    this.cameraSetpointController.then((c) => c.updateCameraPosition(this.camera, time));
    // this.controls.object = new THREE.Object3D();
    // this.controls.update();
    // this.controls.object = this.camera;
    // this.controls.update();
    this.mouseEventTranslator.animate();
    this.renderer.render(this.scene, this.camera);
  }
}
