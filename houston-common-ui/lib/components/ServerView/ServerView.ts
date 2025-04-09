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

import { getChassisModel, type DriveOrientation } from "@/components/ServerView/assets";
import {
  isDriveSlotType,
  ServerComponentSlot,
  ServerDriveSlot,
  type ServerComponentSlotEventMap,
} from "./ServerComponent";

export type PIDParams = {
  kp: number;
  ki: number;
  kd: number;
};

class PIDController {
  private i: number;
  private e0: number;
  private t0: number;
  public setpoint: number;

  constructor(
    public params: PIDParams,
    initial: number
  ) {
    this.i = 0;
    this.e0 = 0;
    this.setpoint = initial;
    this.t0 = performance.now();
  }

  reset(value?: number, time?: number) {
    this.i = 0;
    this.e0 = 0;
    this.t0 = time ?? performance.now();
    this.setpoint = value ?? this.setpoint;
  }

  next(n1: number, time?: number): number {
    const t1 = time ?? performance.now();
    const dt = t1 - this.t0;

    const e1 = this.setpoint - n1;

    const p = e1;
    this.i += e1 * dt;
    this.i = Math.min(Math.max(-1000, this.i), 1000);
    const d = (e1 - this.e0) / dt;

    this.e0 = e1;
    this.t0 = t1;

    return this.params.kp * p + this.params.ki * this.i + this.params.kd * d;
  }
}

class PIDController3 {
  private x: PIDController;
  private y: PIDController;
  private z: PIDController;

  constructor(params: PIDParams, initial: THREE.Vector3Like) {
    this.x = new PIDController(params, initial.x);
    this.y = new PIDController(params, initial.y);
    this.z = new PIDController(params, initial.z);
  }

  reset(value?: THREE.Vector3Like, time?: number) {
    this.x.reset(value?.x, time);
    this.y.reset(value?.y, time);
    this.z.reset(value?.z, time);
  }

  next(n1: THREE.Vector3Like, time?: number): THREE.Vector3 {
    return new THREE.Vector3(
      this.x.next(n1.x, time),
      this.y.next(n1.y, time),
      this.z.next(n1.z, time)
    );
  }

  get setpoint() {
    return new THREE.Vector3(this.x.setpoint, this.y.setpoint, this.z.setpoint);
  }

  set setpoint(value: THREE.Vector3Like) {
    this.x.setpoint = value.x;
    this.y.setpoint = value.y;
    this.z.setpoint = value.z;
  }
}

type CameraSetPoint = {
  position: THREE.Vector3;
  rotation: THREE.Euler;
  zoom: number;
};

type CameraView = "InitialView" | "DriveView";

class CameraSetpointController {
  private initialView: Promise<CameraSetPoint>;
  private driveView: Promise<CameraSetPoint>;
  private view: CameraView;
  private positionPID: PIDController3;
  private rotationPID: PIDController3;
  private zoomPID: PIDController;
  private t0: number;
  constructor(
    camera: THREE.OrthographicCamera | THREE.PerspectiveCamera,
    chassis: Promise<THREE.Object3D>,
    driveOrientation: DriveOrientation,
    pidParams: PIDParams,
    zoomMargin: number = 0.9
  ) {
    this.view = "InitialView";
    const views = this.getViews(camera, chassis, driveOrientation, zoomMargin);
    this.initialView = views.then(({ initialView }) => initialView);
    this.driveView = views.then(({ driveView }) => driveView);
    this.positionPID = new PIDController3(pidParams, camera.position);
    this.rotationPID = new PIDController3(pidParams, camera.rotation);
    this.zoomPID = new PIDController(pidParams, 1);
    this.t0 = performance.now();
    this.setView(this.view);
  }

  reset() {
    this.positionPID.reset();
    this.rotationPID.reset();
    this.zoomPID.reset();
  }

  setView(view: CameraView) {
    this.view = view;
    switch (view) {
      case "InitialView":
        return this.initialView.then((cameraSetpoint) => {
          this.positionPID.setpoint = cameraSetpoint.position.clone();
          this.rotationPID.setpoint = cameraSetpoint.rotation.clone();
          this.zoomPID.setpoint = cameraSetpoint.zoom;
        });
      case "DriveView":
        return this.driveView.then((cameraSetpoint) => {
          this.positionPID.setpoint = cameraSetpoint.position;
          this.rotationPID.setpoint = cameraSetpoint.rotation;
          this.zoomPID.setpoint = cameraSetpoint.zoom;
        });
      default:
        return Promise.resolve();
    }
  }

  updateCameraPosition(
    camera: THREE.OrthographicCamera | THREE.PerspectiveCamera,
    time: number,
    force: boolean = false
  ) {
    console.log(
      "camera position in:",
      JSON.stringify(camera.position),
      JSON.stringify(camera.rotation),
      camera.zoom
    );
    if (force) {
      camera.position.copy(this.positionPID.setpoint);
      camera.rotation.set(
        this.rotationPID.setpoint.x,
        this.rotationPID.setpoint.y,
        this.rotationPID.setpoint.z
      );
      camera.zoom = this.zoomPID.setpoint;
      this.positionPID.reset(undefined, time);
      this.rotationPID.reset(undefined, time);
      this.zoomPID.reset(undefined, time);
      return;
    }
    const dt = time - this.t0;
    this.t0 = time;
    const positionDelta = this.positionPID.next(camera.position, time).multiplyScalar(dt);
    const rotationDelta = this.rotationPID.next(camera.rotation, time).multiplyScalar(dt);
    const zoomDelta = this.zoomPID.next(camera.zoom, time) * dt;

    camera.position.add(positionDelta);
    // camera.rotation.x += rotationDelta.x;
    // camera.rotation.y += rotationDelta.y;
    // camera.rotation.z += rotationDelta.z;
    camera.lookAt(0, 0, 0);
    camera.zoom += zoomDelta;
    camera.updateMatrix();
    camera.updateProjectionMatrix();
    console.log(
      "camera position out:",
      JSON.stringify(camera.position),
      JSON.stringify(camera.rotation),
      camera.zoom
    );
  }

  updateViews(
    camera: THREE.OrthographicCamera | THREE.PerspectiveCamera,
    chassis: Promise<THREE.Object3D>,
    driveOrientation: DriveOrientation,
    zoomMargin: number = 0.9
  ) {
    const views = this.getViews(camera, chassis, driveOrientation, zoomMargin);
    this.initialView = views.then(({ initialView }) => initialView);
    this.driveView = views.then(({ driveView }) => driveView);
    this.setView(this.view);
  }

  private getViews(
    camera: THREE.OrthographicCamera | THREE.PerspectiveCamera,
    chassis: Promise<THREE.Object3D>,
    driveOrientation: DriveOrientation,
    zoomMargin: number
  ) {
    camera = camera.clone(); // don't affect passed in camera
    const views = chassis.then((chassis) => {
      const origin = new THREE.Vector3(0, 0, 0);
      const getView = (position: THREE.Vector3): CameraSetPoint => {
        const chassisBounds = new THREE.Box3().setFromObject(chassis);

        camera.position.copy(position);
        camera.lookAt(origin);

        if (camera instanceof THREE.OrthographicCamera) {
          camera.zoom = 1;
          camera.updateProjectionMatrix();
        } else {
          throw new Error("not implemented");
        }

        const projectedBounds = chassisBounds.clone().applyMatrix4(camera.projectionMatrix);
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
          rotation: camera.rotation.clone(),
          zoom: camera.zoom,
        };
      };
      const position = new THREE.Vector3();
      position.set(2, 2, 2);
      const initialView: CameraSetPoint = getView(position);
      switch (driveOrientation) {
        case "FrontLoader":
          position.set(0, 0, 2);
          break;
        case "TopLoader":
          position.set(0, 2, 0);
          break;
        default:
          throw new Error(`DriveOrientation not implemented: ${driveOrientation}`);
      }
      const driveView: CameraSetPoint = getView(position);
      return {
        initialView,
        driveView,
      };
    });
    return views;
  }

  // private getCurrentCameraLocation(
  //   camera: THREE.OrthographicCamera | THREE.PerspectiveCamera
  // ): CameraSetPoint {
  //   return {
  //     position: camera.position,
  //     rotation: camera.rotation,
  //     zoom: camera.zoom,
  //   };
  // }

  // private getError(camera: THREE.OrthographicCamera | THREE.PerspectiveCamera): CameraSetPoint {
  //   if (this.setPoint === null) {
  //     return {
  //       position: new THREE.Vector3(),
  //       rotation: new THREE.Euler(),
  //       zoom: 1,
  //     };
  //   }
  //   const current = this.getCurrentCameraLocation(camera);
  //   const setPoint = this.setPoint;
  //   return {
  //     position: setPoint.position.sub(current.position),
  //     rotation: new THREE.Euler(
  //       setPoint.rotation.x - current.rotation.x,
  //       setPoint.rotation.y - current.rotation.y,
  //       setPoint.rotation.z - current.rotation.z
  //     ),
  //     zoom: setPoint.zoom / current.zoom,
  //   };
  // }

  // private scaleError(error: CameraSetPoint, factor: number) {
  //   return {
  //     position: error.position.multiplyScalar(factor),
  //     rotation: new THREE.Euler(
  //       error.rotation.x * factor,
  //       error.rotation.y * factor,
  //       error.rotation.z * factor
  //     ),
  //     zoom: error.zoom * factor,
  //   };
  // }
}

export class ServerView extends THREE.EventDispatcher<
  ServerComponentSlotEventMap & {
    selectionchange: { type: "selectionchange"; components: ServerComponentSlot[] };
    driveslotchange: { type: "driveslotchange"; slots: DriveSlot[] };
  }
> {
  private renderer = new THREE.WebGLRenderer();
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
  private cameraSetpointController: CameraSetpointController;

  constructor(
    public readonly serverModel: string,
    opts: {
      enableSelection?: boolean;
      enableRotate?: boolean;
      enablePan?: boolean;
      enableZoom?: boolean;
      pidParams?: PIDParams;
      view?: CameraView;
    } = {}
  ) {
    super();
    opts.enableSelection ??= false;
    opts.enableRotate ??= false;
    opts.enablePan ??= false;
    opts.enableZoom ??= false;
    opts.pidParams ??= { kp: 0.00, ki: 0.00001, kd: 0.01 };

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

    this.scene.add(new THREE.AmbientLight(0xffffff, 1));
    const light = new THREE.PointLight();
    light.castShadow = true;
    //Set up shadow properties for the light
    light.shadow.mapSize.width = 1024;
    light.shadow.mapSize.height = 1024;
    light.shadow.camera.near = 0;
    light.shadow.camera.far = 500;
    light.position.set(-0.1, 0.1, 0);
    light.intensity = 2;
    this.camera.add(light);

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
        // this.chassis
        //   // .then((chassis) => chassis.loaded)
        //   .then(() => {
        //     this.zoomFit();
        //   });
      }
    });

    this.cameraSetpointController = new CameraSetpointController(
      this.camera,
      this.chassis,
      this.driveOrientation,
      opts.pidParams
    );
    this.cameraSetpointController.setView("InitialView").then(() => {
      this.cameraSetpointController.updateCameraPosition(this.camera, 0, true);
      this.controls.update();
      if (opts.view) {
        this.cameraSetpointController.setView(opts.view);
      }
    });

    this.controls.addEventListener("end", () => {
      this.cameraSetpointController.reset();
    });
  }

  async start(parent: HTMLElement) {
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
    this.cameraSetpointController.setView(view);
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

    this.cameraSetpointController.updateViews(this.camera, this.chassis, this.driveOrientation);

    // this.controls.update();
  }

  // async zoomFit(margin: number = 0.9) {
  //   const chassisBounds = new THREE.Box3().setFromObject(await this.chassis);

  //   if (this.camera instanceof THREE.OrthographicCamera) {
  //     this.camera.zoom = 1;
  //     this.camera.updateProjectionMatrix();
  //   } else {
  //     throw new Error("not implemented");
  //   }

  //   const projectedBounds = chassisBounds.clone().applyMatrix4(this.camera.projectionMatrix);
  //   console.log("projected bounds:", projectedBounds);

  //   const projectedSize = new THREE.Vector3();
  //   projectedBounds.getSize(projectedSize);
  //   console.log("projected size:", projectedSize);

  //   if (this.camera instanceof THREE.OrthographicCamera) {
  //     this.camera.zoom = (2 / Math.max(projectedSize.x, projectedSize.y)) * margin;
  //   } else {
  //     throw new Error("not implemented");
  //   }

  //   this.camera.updateProjectionMatrix();

  //   this.controls.update();

  //   console.log("camera position:", this.camera.position);
  // }

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
    this.cameraSetpointController.updateCameraPosition(this.camera, time);
    this.controls.object = new THREE.Object3D();
    this.controls.update();
    this.controls.object = this.camera;
    // this.controls.update();
    this.mouseEventTranslator.animate();
    this.renderer.render(this.scene, this.camera);
  }
}
