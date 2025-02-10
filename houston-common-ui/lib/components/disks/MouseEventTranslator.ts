import {
  ServerComponent,
  type ServerComponentEventMap,
  type ServerComponentMouseEvent,
  type ServerComponentMouseEventTypes,
} from "./ServerComponent";
import * as THREE from "three";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";

export class SelectionBox extends THREE.LineSegments {
  constructor() {
    const positions = new Float32Array(8 * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    super(
      geometry,
      new THREE.LineBasicMaterial({
        color: 0x00ff00,
        linewidth: 2,
      })
    );
  }
  updateSelectionBox(
    camera: THREE.Camera,
    mouseDownCoordsNormalized: THREE.Vector2,
    currentMouseCoordsNormalized: THREE.Vector2,
    depth = -0.99
  ) {
    const positions = this.geometry.attributes.position.array;

    // Convert NDC coordinates to world space at a fixed depth in front of the camera
    const corners = [
      new THREE.Vector3(mouseDownCoordsNormalized.x, mouseDownCoordsNormalized.y, depth),
      new THREE.Vector3(currentMouseCoordsNormalized.x, mouseDownCoordsNormalized.y, depth),
      new THREE.Vector3(currentMouseCoordsNormalized.x, currentMouseCoordsNormalized.y, depth),
      new THREE.Vector3(mouseDownCoordsNormalized.x, currentMouseCoordsNormalized.y, depth),
    ];

    // Convert to world space
    for (let i = 0; i < corners.length; i++) {
      corners[i].unproject(camera);
    }

    // Define line segments to connect corners
    const edges = [
      corners[0],
      corners[1], // Bottom
      corners[1],
      corners[2], // Right
      corners[2],
      corners[3], // Top
      corners[3],
      corners[0], // Left
    ];

    // Update positions in geometry
    for (let i = 0; i < edges.length; i++) {
      positions[i * 3] = edges[i].x;
      positions[i * 3 + 1] = edges[i].y;
      positions[i * 3 + 2] = edges[i].z;
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.visible = true;
  }

  hide() {
    this.visible = false;
  }
}

export class MouseEventTranslator extends THREE.EventDispatcher<{
  selectionchange: { type: "selectionchange"; components: ServerComponent[] };
}> {
  private raycaster = new THREE.Raycaster();

  private componentUnderCursor?: ServerComponent;

  private mouseDownCoordsNormalized?: THREE.Vector2;

  private clickDeltaThreshold = 0.1; // normalized -1 to 1

  private selectionBox = new SelectionBox();

  constructor(
    public domElement: HTMLElement,
    public camera: THREE.Camera,
    public scene: THREE.Scene,
    public enableSelection: boolean
  ) {
    super();
    this.scene.add(this.selectionBox);
  }

  translateMouseClick(event: MouseEvent & { type: "mousedown" | "mouseup" }) {
    if (event.button !== 0) {
      // only handle left mouse button
      return;
    }
    if (event.type === "mousedown") {
      this.mouseDownCoordsNormalized = this.normalizedMouseEventCoords(event);
    } else {
      this.handleMouseUp(event);
    }
  }

  translateMouseOver(event: MouseEvent & { type: "mousemove" }) {
    const mouseCoords = this.normalizedMouseEventCoords(event);
    if (this.isDragging(mouseCoords)) {
      this.selectionBox.updateSelectionBox(
        this.camera,
        this.mouseDownCoordsNormalized!,
        mouseCoords
      );
    }
    const intersection = this.getMouseEventIntersections(event, mouseCoords)[0] as
      | (THREE.Intersection & { object: ServerComponent })
      | undefined;
    const obj = intersection?.object;
    if (obj && "selected" in obj) {
      this.domElement.style.cursor = "pointer";
    } else {
      this.domElement.style.cursor = "default";
    }
    if (obj === this.componentUnderCursor) {
      return;
    }
    this.componentUnderCursor?.dispatchEvent(this.makeEvent("mouseleave", event));
    obj?.dispatchEvent(this.makeEvent("mouseenter", event, intersection?.point));
    this.componentUnderCursor = obj;
  }

  selectAll(filter?: (obj: THREE.Object3D) => boolean) {
    return this.setSelectedAll(true, filter);
  }

  deselectAll(filter?: (obj: THREE.Object3D) => boolean) {
    return this.setSelectedAll(false, filter);
  }

  toggleSelectAll(filter?: (obj: THREE.Object3D) => boolean) {
    const changed: THREE.Object3D[] = [];
    this.scene.traverse((object) => {
      if (!("selected" in object) || (filter && !filter(object))) {
        return;
      }
      if (typeof object.selected === "boolean") {
        object.selected = !object.selected;
        changed.push(object);
      }
    });
    return changed;
  }

  animate() {}

  private setSelectedAll(selected: boolean, filter?: (obj: THREE.Object3D) => boolean) {
    const unfiltered = this.scene.getObjectsByProperty("selected", !selected);
    return (filter ? unfiltered.filter(filter) : unfiltered).map((obj) => {
      (obj as any as { selected: boolean }).selected = selected;
      return obj;
    });
  }

  private isDragging(currentMouseCoordsNormalized: THREE.Vector2) {
    return (
      this.mouseDownCoordsNormalized &&
      Math.abs(currentMouseCoordsNormalized.distanceToSquared(this.mouseDownCoordsNormalized)) >
        this.clickDeltaThreshold ** 2
    );
  }

  private handleMouseUp(event: MouseEvent & { type: "mousedown" | "mouseup" }) {
    this.selectionBox.hide();
    if (this.mouseDownCoordsNormalized === undefined) {
      return;
    }

    let selectedBefore: ServerComponent[];
    if (this.enableSelection) {
      selectedBefore = this.scene.getObjectsByProperty("selected", true) as ServerComponent[];
    }

    // deselect if not ctrl or shift TODO: fix toggle select on regular click
    if (this.enableSelection && !event.shiftKey && !event.ctrlKey) {
      this.deselectAll();
    }

    const mouseUpCoordsNormalized = this.normalizedMouseEventCoords(event);
    if (this.isDragging(mouseUpCoordsNormalized)) {
      // drag select
      if (this.enableSelection) {
        const selectionBoxNormalized = new THREE.Box2().setFromPoints([
          this.mouseDownCoordsNormalized,
          mouseUpCoordsNormalized,
        ]);

        this.handleDragSelect(selectionBoxNormalized, event.ctrlKey);
      }
    } else {
      // regular click
      this.handleRegularClick(event, mouseUpCoordsNormalized);
    }
    this.mouseDownCoordsNormalized = undefined;

    if (this.enableSelection) {
      const selectedAfter = this.scene.getObjectsByProperty("selected", true) as ServerComponent[];
      if (
        selectedAfter.length !== selectedBefore!.length ||
        !selectedBefore!.every((obj) => selectedAfter.includes(obj))
      ) {
        this.dispatchEvent({
          type: "selectionchange",
          components: selectedAfter,
        });
      }
    }
  }

  private handleRegularClick(
    event: MouseEvent & { type: "mousedown" | "mouseup" },
    mouseUpCoordsNormalized: THREE.Vector2
  ) {
    const intersection = this.getMouseEventIntersections(event, mouseUpCoordsNormalized)[0] as
      | (THREE.Intersection & { object: ServerComponent })
      | undefined;

    if (
      this.enableSelection &&
      intersection?.object &&
      "selected" in intersection.object &&
      typeof intersection.object.selected === "boolean"
    ) {
      intersection.object.selected = event.shiftKey || !intersection.object.selected;
    }

    intersection?.object.dispatchEvent(this.makeEvent("click", event, intersection.point));
  }

  private createSelectionFrustum(selectionBoxNormalized: THREE.Box2): THREE.Frustum {
    // Define the 8 corners of the selection box in NDC space
    const corners = [
      new THREE.Vector3(selectionBoxNormalized.min.x, selectionBoxNormalized.min.y, -1), // Near-bottom-left
      new THREE.Vector3(selectionBoxNormalized.max.x, selectionBoxNormalized.min.y, -1), // Near-bottom-right
      new THREE.Vector3(selectionBoxNormalized.max.x, selectionBoxNormalized.max.y, -1), // Near-top-right
      new THREE.Vector3(selectionBoxNormalized.min.x, selectionBoxNormalized.max.y, -1), // Near-top-left
      new THREE.Vector3(selectionBoxNormalized.min.x, selectionBoxNormalized.min.y, 1), // Far-bottom-left
      new THREE.Vector3(selectionBoxNormalized.max.x, selectionBoxNormalized.min.y, 1), // Far-bottom-right
      new THREE.Vector3(selectionBoxNormalized.max.x, selectionBoxNormalized.max.y, 1), // Far-top-right
      new THREE.Vector3(selectionBoxNormalized.min.x, selectionBoxNormalized.max.y, 1), // Far-top-left
    ];

    // Convert from NDC space to world space
    for (let i = 0; i < corners.length; i++) {
      corners[i].unproject(this.camera);
    }

    // Create frustum planes ensuring they face inward
    const frustum = new THREE.Frustum();
    frustum.planes = [
      new THREE.Plane().setFromCoplanarPoints(corners[0], corners[2], corners[1]), // Near
      new THREE.Plane().setFromCoplanarPoints(corners[5], corners[6], corners[4]), // Far
      new THREE.Plane().setFromCoplanarPoints(corners[4], corners[3], corners[0]), // Left
      new THREE.Plane().setFromCoplanarPoints(corners[1], corners[2], corners[5]), // Right
      new THREE.Plane().setFromCoplanarPoints(corners[3], corners[6], corners[2]), // Top
      new THREE.Plane().setFromCoplanarPoints(corners[4], corners[1], corners[5]), // Bottom
    ];

    return frustum;
  }

  private handleDragSelect(selectionBoxNormalized: THREE.Box2, ctrlKey: boolean) {
    const frustum = this.createSelectionFrustum(selectionBoxNormalized);

    const withinSelection = (selectable: THREE.Object3D) => {
      const boundsBox = new THREE.Box3().setFromObject(selectable);
      return frustum.intersectsBox(boundsBox);
    };

    if (ctrlKey) {
      this.toggleSelectAll(withinSelection);
    } else {
      this.selectAll(withinSelection);
    }
  }

  private makeEvent<Type extends ServerComponentMouseEventTypes>(
    type: Type,
    event: MouseEvent,
    intersectionPoint?: THREE.Vector3
  ): ServerComponentMouseEvent<Type> {
    return {
      type,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      button: event.button,
      buttons: event.buttons,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
      ray: this.raycaster.ray.clone(),
      point: intersectionPoint,
    };
  }

  private normalizedMouseEventCoords(event: MouseEvent): THREE.Vector2 {
    const canvasRect = this.domElement.getBoundingClientRect();
    return new THREE.Vector2(
      ((event.clientX - canvasRect.left) / canvasRect.width) * 2 - 1,
      -((event.clientY - canvasRect.top) / canvasRect.height) * 2 + 1
    );
  }

  private static getServerComponentParent(obj: THREE.Object3D): ServerComponent | null {
    if (obj instanceof ServerComponent) {
      return obj;
    }
    if (obj.parent) {
      return MouseEventTranslator.getServerComponentParent(obj.parent);
    }
    return null;
  }

  private getMouseEventIntersections(event: MouseEvent, mouseUpCoordsNormalized?: THREE.Vector2) {
    this.raycaster.setFromCamera(
      mouseUpCoordsNormalized ?? this.normalizedMouseEventCoords(event),
      this.camera
    );
    return this.raycaster
      .intersectObjects(this.scene.children)
      .map((intersection) => {
        const object = MouseEventTranslator.getServerComponentParent(intersection.object);
        if (!object) return null;
        return { ...intersection, object };
      })
      .filter((i): i is THREE.Intersection & { object: ServerComponent } => i !== null);
  }
}
