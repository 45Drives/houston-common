import { Chassis } from "@/components/disks/Chassis";
import { ServerComponent } from "@/components/disks/ServerComponent";
import type { SlotType } from "@45drives/houston-common-lib";
import * as THREE from "three";

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

export class ServerView {
  private renderer = new THREE.WebGLRenderer();
  private camera: THREE.Camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
  private scene: THREE.Scene = new THREE.Scene();
  private raycaster = new THREE.Raycaster();

  private componentUnderCursor?: ServerComponent;

  private chassis: Chassis;

  constructor(modelNumber: string) {
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.camera.position.z = 5;

    this.chassis = new Chassis(modelNumber);
    this.scene.add(this.chassis);

    this.chassis.loaded.then(() => {
      this.zoomFit();
    });

    this.renderer.domElement.addEventListener("click", (event) => {
      this.handleMouseEvent(event);
    });
    this.renderer.domElement.addEventListener("dblclick", (event) => {
      this.handleMouseEvent(event);
    });
    this.renderer.domElement.addEventListener("mousemove", (event) => {
      this.handleMouseEvent(event);
    });
  }

  getBoundingClientRect() {
    return this.renderer.domElement.getBoundingClientRect();
  }

  getCamera() {
    return this.camera;
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
    } else {
      throw new Error("not implemented");
    }
  }

  setBackground(bg: typeof this.scene.background) {
    this.scene.background = bg;
  }

  setDiskSlotInfo(slots: { occupiedBy: SlotType | string | null }[]) {
    this.chassis.setDiskSlotInfo(slots);
  }

  private animate() {
    this.renderer.render(this.scene, this.camera);
  }

  private normalizedMouseEventCoords(event: MouseEvent): THREE.Vector2 {
    const canvasRect = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(
      ((event.clientX - canvasRect.left) / canvasRect.width) * 2 - 1,
      -((event.clientY - canvasRect.top) / canvasRect.height) * 2 + 1
    );
  }

  private getMouseEventInterstions(event: MouseEvent): THREE.Intersection[] {
    this.raycaster.setFromCamera(this.normalizedMouseEventCoords(event), this.camera);
    return this.raycaster.intersectObjects(this.scene.children);
  }

  private handleMouseEvent(event: MouseEvent) {
    const intersections = this.getMouseEventInterstions(event).filter(
      (i): i is THREE.Intersection & { object: ServerComponent } =>
        i.object instanceof ServerComponent
    );

    const obj = intersections[0]?.object as ServerComponent | undefined;

    if (event.type === "mousemove") {
      if (obj === this.componentUnderCursor) {
        return;
      }
      this.componentUnderCursor?.dispatchEvent({ ...event, type: "mouseleave" });
      obj?.dispatchEvent({ ...event, type: "mouseenter" });
      this.componentUnderCursor = obj;
    }

    if (obj && ServerComponent.isValidEvent(event)) {
      obj.dispatchEvent(event);
    }
  }
}
