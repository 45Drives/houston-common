import * as THREE from "three";

import { MouseEventTranslator } from "@/components/ServerView/MouseEventTranslator";
import {
  Server,
  unwrap,
  ValueError,
  type DriveSlot,
  type LiveDriveSlotsHandle,
} from "@45drives/houston-common-lib";

import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

import { LAYER_DEFAULT, LAYER_NO_SELECT } from "./constants";

import { getChassisModel, type DriveOrientation } from "@/components/ServerView/assets";
import {
  isDriveSlotType,
  ServerComponentSlot,
  ServerDriveSlot,
  SlotHighlight,
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

  private relSpherical = new THREE.Spherical();
  private targetRelSpherical = new THREE.Spherical();
  private workingVector = new THREE.Vector3();

  private dampClamp(x: number, y: number, lambda: number, dt: number, maxSpeed: number) {
    const damped = THREE.MathUtils.damp(x, y, lambda, dt);
    const dx = THREE.MathUtils.clamp(damped - x, -maxSpeed * dt, maxSpeed * dt);
    return x + dx;
  }

  updateCameraPosition(
    camera: THREE.OrthographicCamera | THREE.PerspectiveCamera,
    dt: number,
    force: boolean = false
  ) {
    const threshSq = 0.001 ** 2;
    const zoomThresh = 0.001;

    if (
      force ||
      (camera.position.distanceToSquared(this.setpoint.position) < threshSq &&
        this.focusPoint.distanceToSquared(this.setpoint.focusPoint) < threshSq &&
        Math.abs(camera.zoom - this.setpoint.zoom) < zoomThresh)
    ) {
      camera.position.copy(this.setpoint.position);
      camera.updateMatrix();
      this.focusPoint = this.setpoint.focusPoint;
      camera.lookAt(this.focusPoint);
      camera.zoom = this.setpoint.zoom;
      camera.updateProjectionMatrix();
      this.atFocusPointResolver?.();
      return;
    }

    // const dampClamp = (
    //   x: number,
    //   y: number,
    //   lambda: number,
    //   dt: number,
    //   maxSpeed: number
    // ): number => {
    //   const damped = THREE.MathUtils.damp(x, y, lambda, dt);
    //   const dx = THREE.MathUtils.clamp(damped - x, -maxSpeed * dt, maxSpeed * dt);
    //   return x + dx;
    // };

    this.focusPoint.x = this.dampClamp(
      this.focusPoint.x,
      this.setpoint.focusPoint.x,
      this.lambda,
      dt,
      0.001
    );
    this.focusPoint.y = this.dampClamp(
      this.focusPoint.y,
      this.setpoint.focusPoint.y,
      this.lambda,
      dt,
      0.001
    );
    this.focusPoint.z = this.dampClamp(
      this.focusPoint.z,
      this.setpoint.focusPoint.z,
      this.lambda,
      dt,
      0.001
    );

    this.workingVector.subVectors(camera.position, this.focusPoint);
    this.relSpherical.setFromVector3(this.workingVector).makeSafe();
    this.workingVector.subVectors(this.setpoint.position, this.setpoint.focusPoint);
    this.targetRelSpherical.setFromVector3(this.workingVector).makeSafe();

    // const relSpherical = new THREE.Spherical()
    //   .setFromVector3(camera.position.clone().sub(this.focusPoint))
    //   .makeSafe();
    // const targetRelSpherical = new THREE.Spherical()
    //   .setFromVector3(this.setpoint.position.clone().sub(this.setpoint.focusPoint))
    //   .makeSafe();

    this.relSpherical.radius = this.dampClamp(
      this.relSpherical.radius,
      this.targetRelSpherical.radius,
      this.lambda,
      dt,
      0.0005
    );
    this.relSpherical.phi = this.dampClamp(
      this.relSpherical.phi,
      this.targetRelSpherical.phi,
      this.lambda,
      dt,
      0.001
    );
    this.relSpherical.theta = this.dampClamp(
      this.relSpherical.theta,
      this.targetRelSpherical.theta,
      this.lambda,
      dt,
      0.0005
    );

    camera.position.setFromSpherical(this.relSpherical).add(this.focusPoint);
    camera.zoom = this.dampClamp(camera.zoom, this.setpoint.zoom, this.lambda, dt, 0.01);

    camera.updateMatrix();
    camera.lookAt(this.focusPoint);

    camera.updateProjectionMatrix();
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
      ...focusOn: [THREE.Object3D, ...THREE.Object3D[]]
    ): CameraSetPoint => {
      camera.position.copy(position);

      const bounds = new THREE.Box3().setFromObject(focusOn[0]);
      const objBounds = new THREE.Box3();

      for (const obj of focusOn) {
        obj.updateMatrixWorld(true);
        objBounds.setFromObject(obj);
        bounds.union(objBounds);
      }

      const focusPoint = new THREE.Vector3();
      bounds.getCenter(focusPoint);

      camera.lookAt(focusPoint);

      if (camera instanceof THREE.OrthographicCamera) {
        camera.zoom = 1;
        camera.updateProjectionMatrix();
      } else {
        throw new Error("not implemented");
      }

      const projectedBounds = bounds.applyMatrix4(camera.projectionMatrix);
      console.log("projected bounds:", projectedBounds);

      const projectedSize = this.workingVector;
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
    const position = this.workingVector;
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

    let driveSlotFocus: THREE.Object3D[] = componentSlots
      .filter((slot) => slot instanceof ServerDriveSlot)
      .map((slot) => slot.boundingBox);

    if (driveSlotFocus.length === 0) {
      driveSlotFocus = [chassis];
    }

    const driveView: CameraSetPoint = getView(
      position,
      0.75,
      ...(driveSlotFocus as [THREE.Object3D, ...THREE.Object3D[]])
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
  private renderer = new THREE.WebGLRenderer({ antialias: true });
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
  private cameraSetpointControllerPromise: Promise<CameraSetpointController>;
  private cameraSetpointController?: CameraSetpointController;

  private animations: {
    revealDrives: Promise<THREE.AnimationAction | undefined>;
  };

  private animationMixer: THREE.AnimationMixer;

  private t0?: number;

  private materials = {
    powdercoat: new THREE.MeshPhysicalMaterial({ roughness: 0.5, color: 0x000000 }),
    acrylic: new THREE.MeshPhysicalMaterial({
      roughness: 0.1,
      color: 0xffffff,
      transmission: 0.9,
    }),
    aluminum: new THREE.MeshPhysicalMaterial({ roughness: 0.25, metalness: 1, color: 0xe7e7e7ff }),
    steel: new THREE.MeshPhysicalMaterial({ roughness: 0.125, metalness: 1, color: 0xe7e7e7ff }),
    plastic: new THREE.MeshPhysicalMaterial({ roughness: 0.125, color: 0x000000 }),
    labels: new THREE.MeshPhysicalMaterial({ roughness: 0.8, color: 0xffffff }),
  };

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
    this.renderer.domElement.addEventListener("mouseleave", (event) => {
      this.setSlotHighlights(
        "highlight",
        this.componentSlots.map((s) => s.slotId),
        false
      );
    });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // default THREE.PCFShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;

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

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.125));
    const light = new THREE.PointLight();
    light.castShadow = true;
    //Set up shadow properties for the light
    light.shadow.mapSize.width = 512;
    light.shadow.mapSize.height = 512;
    light.shadow.camera.near = 0;
    light.shadow.camera.far = 10;
    light.intensity = 1;
    for (const [position, intensity] of [
      [new THREE.Vector3(-0.125, 0.07, 1), 1], // front
      [new THREE.Vector3(0, 2.5, 0), 90], // ceil
    ] as [THREE.Vector3, number][]) {
      light.position.copy(position);
      light.intensity = intensity;
      this.scene.add(light.clone());
    }
    light.dispose();

    // generate env map
    const roomCube = new THREE.Mesh(
      new THREE.BoxGeometry(10, 5.1, 10),
      new THREE.MeshStandardMaterial({ color: 0x807774, side: THREE.BackSide, roughness: 1 })
    );
    this.scene.add(roomCube);
    this.scene.environment = new THREE.PMREMGenerator(this.renderer).fromScene(
      this.scene,
      0.05
    ).texture;
    this.scene.remove(roomCube);

    this.componentSlots = [];

    const {
      model: chassisModelPromise,
      animations,
      driveOrientation,
    } = getChassisModel(serverModel);
    this.driveOrientation = driveOrientation;
    this.chassis = chassisModelPromise.then((chassis) => {
      const box = new THREE.Box3().setFromObject(chassis);
      const center = new THREE.Vector3();
      box.getCenter(center);
      chassis.position.set(-center.x, -center.y, -center.z);
      chassis.updateMatrix();
      chassis.updateMatrixWorld(true);
      chassis.traverse((obj) => {
        if (typeof obj.userData.SLOT === "string") {
          if (isDriveSlotType(obj.userData.DRIVE_TYPE)) {
            this.componentSlots.push(
              new ServerDriveSlot(
                this.scene,
                obj,
                obj.userData.SLOT,
                obj.userData.DRIVE_TYPE,
                this.driveOrientation
              )
            );
          } else {
            this.componentSlots.push(new ServerComponentSlot(this.scene, obj, obj.userData.SLOT));
          }
        }
        if (obj instanceof THREE.Mesh && obj.material instanceof THREE.Material) {
          switch (obj.material.name) {
            case "POWDER_COAT":
              obj.material = this.materials.powdercoat;
              break;
            case "ALUMINUM":
              obj.material = this.materials.aluminum;
              break;
            case "ACRYLIC":
              obj.material = this.materials.acrylic;
              break;
            case "PLASTIC":
              obj.material = this.materials.plastic;
              break;
            case "STEEL":
              obj.material = this.materials.steel;
              break;
            default:
              break;
          }
        }
      });
      this.scene.add(chassis);
      return chassis;
    });

    this.animationMixer = new THREE.AnimationMixer(this.scene);
    this.animationMixer.timeScale = 0.001;

    this.animations = {
      revealDrives: animations.then((animations) => {
        const revealDrives = THREE.AnimationClip.findByName(animations, "REVEAL_DRIVES");
        if (revealDrives) {
          const action = this.animationMixer.clipAction(revealDrives);
          action.setLoop(THREE.LoopOnce, 0);
          action.clampWhenFinished = true;
          action.enabled = false;
          return action;
        }
        return undefined;
      }),
    };

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

    this.cameraSetpointControllerPromise = this.chassis.then((chassis) => {
      const ctrlr = new CameraSetpointController(
        this.camera,
        chassis,
        this.componentSlots,
        this.driveOrientation
      );
      ctrlr.forceView("InitialView", this.camera);
      this.cameraSetpointController = ctrlr;
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

  private waitForAction(action: THREE.AnimationAction) {
    return new Promise<void>((resolve) => {
      const cb = (
        e: {
          action: THREE.AnimationAction;
          direction: number;
        } & THREE.Event<"finished", THREE.AnimationMixer>
      ) => {
        if (e.action === action) {
          this.animationMixer.removeEventListener("finished", cb);
          resolve();
        }
      };
      this.animationMixer.addEventListener("finished", cb);
    });
  }

  revealDrives() {
    return this.animations.revealDrives.then((action) => {
      if (action) {
        action.reset();
        action.enabled = true;
        action.timeScale = 1;
        action.play();
        return this.waitForAction(action);
      }
    });
  }

  hideDrives() {
    return this.animations.revealDrives.then((action) => {
      if (action) {
        action.reset();
        action.time = action.getClip().duration;
        action.enabled = true;
        action.timeScale = -1;
        action.play();
        return this.waitForAction(action);
      }
    });
  }

  setView(view: CameraView) {
    return this.cameraSetpointControllerPromise.then((c) => c.setView(view));
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
      this.cameraSetpointControllerPromise.then((c) =>
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

  setPowdercoatColor(color: number, gloss: boolean) {
    this.materials.powdercoat.color.set(color);
    this.materials.powdercoat.roughness = gloss ? 0 : 0.5;
  }

  setLabelColor(color: number) {
    this.materials.labels.color.set(color);
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
        console.log(this.componentSlots);
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

  async setSlotHighlights(
    colorFlag: keyof typeof SlotHighlight.colors | (keyof typeof SlotHighlight.colors)[],
    slotIds: string[],
    value: boolean = true
  ) {
    await this.chassis;
    for (const slotId of slotIds) {
      const componentSlot = this.componentSlots.find((s) => s.slotId === slotId);
      if (componentSlot === undefined) {
        continue;
      }
      if (Array.isArray(colorFlag)) {
        for (const key of colorFlag) {
          componentSlot.highlightBox[key] = value;
        }
      } else {
        componentSlot.highlightBox[colorFlag] = value;
      }
    }
  }

  private animate(time: number) {
    if (this.t0 === undefined) {
      this.t0 = time;
      return;
    }

    const dt = time - this.t0;
    this.t0 = time;

    this.animationMixer.update(dt);
    this.cameraSetpointController?.updateCameraPosition(this.camera, dt);
    // this.controls.object = new THREE.Object3D();
    // this.controls.update();
    // this.controls.object = this.camera;
    // this.controls.update();
    this.mouseEventTranslator.animate();

    for (const slot of this.componentSlots) {
      slot.animate(time);
    }

    this.renderer.render(this.scene, this.camera);
  }
}
