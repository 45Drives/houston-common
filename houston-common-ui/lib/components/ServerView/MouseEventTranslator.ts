import {
  ServerComponentSlot,
  SlotBoundingBox,
  type ServerComponentSlotEventMap,
  type ServerComponentSlotMouseEvent,
  type ServerComponentSlotMouseEventTypes,
} from "./ServerComponent";
import * as THREE from "three";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LAYER_NO_SELECT } from "./constants";
import { intersection } from "zod";

export class SelectionBox extends LineSegments2 {
  private corners = [
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
  ];

  constructor() {
    // const positions = new Float32Array(8 * 3);
    // const geometry = new THREE.BufferGeometry();
    // geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const geometry = new LineSegmentsGeometry();

    super(geometry, new LineMaterial({ color: 0x00ff00, linewidth: 2 }));

    this.hide();
    this.layers.set(LAYER_NO_SELECT);
  }

  updateSelectionBox(
    camera: THREE.Camera,
    mouseDownCoordsNormalized: THREE.Vector2,
    currentMouseCoordsNormalized: THREE.Vector2,
    depth = -0.99
  ) {
    // const positions = this.geometry.attributes.position.array;

    // Convert NDC coordinates to world space at a fixed depth in front of the camera
    this.corners[0].set(mouseDownCoordsNormalized.x, mouseDownCoordsNormalized.y, depth);
    this.corners[1].set(currentMouseCoordsNormalized.x, mouseDownCoordsNormalized.y, depth);
    this.corners[2].set(currentMouseCoordsNormalized.x, currentMouseCoordsNormalized.y, depth);
    this.corners[3].set(mouseDownCoordsNormalized.x, currentMouseCoordsNormalized.y, depth);

    // Convert to world space
    for (let i = 0; i < this.corners.length; i++) {
      this.corners[i].unproject(camera);
    }

    // Define line segments to connect corners
    const edges = [
      this.corners[0],
      this.corners[1], // Bottom
      this.corners[1],
      this.corners[2], // Right
      this.corners[2],
      this.corners[3], // Top
      this.corners[3],
      this.corners[0], // Left
    ].flatMap((vec) => [vec.x, vec.y, vec.z]);

    // Update positions in geometry
    // for (let i = 0; i < edges.length; i++) {
    //   positions[i * 3] = edges[i].x;
    //   positions[i * 3 + 1] = edges[i].y;
    //   positions[i * 3 + 2] = edges[i].z;
    // }

    this.geometry.setPositions(edges);

    // this.geometry.attributes.position.needsUpdate = true;
    this.visible = true;
  }

  hide() {
    this.visible = false;
  }
}

export class MouseEventTranslator extends THREE.EventDispatcher<{
  selectionchange: { type: "selectionchange"; components: ServerComponentSlot[] };
}> {
  private raycaster = new THREE.Raycaster();

  private componentUnderCursor?: ServerComponentSlot;

  private mouseDownCoordsNormalized?: THREE.Vector2;

  private clickDeltaThreshold = 0.1; // normalized -1 to 1

  private selectionBox = new SelectionBox();

  constructor(
    public domElement: HTMLElement,
    public camera: THREE.Camera,
    public scene: THREE.Scene,
    public enableSelection: boolean,
    private componentSlots: ServerComponentSlot[]
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
      this.componentUnderCursor = undefined;
      this.selectionBox.updateSelectionBox(
        this.camera,
        this.mouseDownCoordsNormalized!,
        mouseCoords
      );
      const selectionBoxNormalized = new THREE.Box2().setFromPoints([
        this.mouseDownCoordsNormalized!,
        mouseCoords,
      ]);
      const frustum = this.createSelectionFrustum(selectionBoxNormalized);
      for (const slot of this.componentSlots) {
        slot.highlight = frustum.intersectsBox(slot.boundingBox.bound);
      }
    } else {
      this.selectionBox.hide();
      const obj = this.getMouseEventIntersections(event, mouseCoords)[0] as
        | ServerComponentSlot
        | undefined;
      if (obj && obj instanceof ServerComponentSlot) {
        this.domElement.style.cursor = "pointer";
      } else {
        this.domElement.style.cursor = "default";
      }
      if (this.componentUnderCursor) {
        this.componentUnderCursor.highlight = false;
      }
      if (obj) {
        obj.highlight = true;
      }
      this.componentUnderCursor = obj;
    }
  }

  selectAll(filter?: (slot: ServerComponentSlot) => boolean) {
    return this.setSelectedAll(true, filter);
  }

  deselectAll(filter?: (slot: ServerComponentSlot) => boolean) {
    return this.setSelectedAll(false, filter);
  }

  toggleSelectAll(filter?: (slot: ServerComponentSlot) => boolean) {
    const changed: ServerComponentSlot[] = [];

    this.componentSlots.forEach((object) => {
      if (filter && !filter(object)) {
        return;
      }
      object.selected = !object.selected;
      changed.push(object);
    });
    return changed;
  }

  animate() {}

  private setSelectedAll(selected: boolean, filter?: (slot: ServerComponentSlot) => boolean) {
    const unfiltered = this.componentSlots.filter((slot) => slot.selected === !selected);
    return (filter ? unfiltered.filter(filter) : unfiltered).map((obj) => {
      obj.selected = selected;
      return obj;
    });
  }

  private isDragging(currentMouseCoordsNormalized: THREE.Vector2) {
    return (
      this.mouseDownCoordsNormalized &&
      currentMouseCoordsNormalized.distanceToSquared(this.mouseDownCoordsNormalized) >
        this.clickDeltaThreshold ** 2
    );
  }

  private handleMouseUp(event: MouseEvent & { type: "mousedown" | "mouseup" }) {
    this.selectionBox.hide();
    if (this.mouseDownCoordsNormalized === undefined) {
      return;
    }

    let selectedBefore: ServerComponentSlot[];
    if (this.enableSelection) {
      selectedBefore = this.componentSlots.filter((slot) => slot.selected);
    }

    // deselect if not ctrl or shift TODO: fix toggle select on regular click
    if (this.enableSelection && !event.shiftKey && !event.ctrlKey) {
      this.deselectAll();
    }

    const mouseUpCoordsNormalized = this.normalizedMouseEventCoords(event);
    if (this.isDragging(mouseUpCoordsNormalized)) {
      // drag select
      if (this.enableSelection) {
        for (const slot of this.componentSlots) {
          slot.highlight = false;
        }
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
      const selectedAfter = this.componentSlots.filter((slot) => slot.selected);
      if (
        selectedAfter.length !== selectedBefore!.length ||
        !selectedBefore!.every((obj) => selectedAfter.includes(obj))
      ) {
        this.dispatchEvent({ type: "selectionchange", components: selectedAfter });
      }
    }
  }

  private handleRegularClick(
    event: MouseEvent & { type: "mousedown" | "mouseup" },
    mouseUpCoordsNormalized: THREE.Vector2
  ) {
    const intersection = this.getMouseEventIntersections(event, mouseUpCoordsNormalized)[0] as
      | ServerComponentSlot
      | undefined;

    if (this.enableSelection && intersection) {
      intersection.selected = event.shiftKey || !intersection.selected;
    }
  }

  private _selectionCorners = [
    new THREE.Vector3(), // Near-bottom-left
    new THREE.Vector3(), // Near-bottom-right
    new THREE.Vector3(), // Near-top-right
    new THREE.Vector3(), // Near-top-left
    new THREE.Vector3(), // Far-bottom-left
    new THREE.Vector3(), // Far-bottom-right
    new THREE.Vector3(), // Far-top-right
    new THREE.Vector3(), // Far-top-left
  ];
  private _selectionFrustum = new THREE.Frustum();
  private createSelectionFrustum(selectionBoxNormalized: THREE.Box2): THREE.Frustum {
    // Define the 8 corners of the selection box in NDC space
    this._selectionCorners[0].set(selectionBoxNormalized.min.x, selectionBoxNormalized.min.y, -1); // Near-bottom-left
    this._selectionCorners[1].set(selectionBoxNormalized.max.x, selectionBoxNormalized.min.y, -1); // Near-bottom-right
    this._selectionCorners[2].set(selectionBoxNormalized.max.x, selectionBoxNormalized.max.y, -1); // Near-top-right
    this._selectionCorners[3].set(selectionBoxNormalized.min.x, selectionBoxNormalized.max.y, -1); // Near-top-left
    this._selectionCorners[4].set(selectionBoxNormalized.min.x, selectionBoxNormalized.min.y, 1); // Far-bottom-left
    this._selectionCorners[5].set(selectionBoxNormalized.max.x, selectionBoxNormalized.min.y, 1); // Far-bottom-right
    this._selectionCorners[6].set(selectionBoxNormalized.max.x, selectionBoxNormalized.max.y, 1); // Far-top-right
    this._selectionCorners[7].set(selectionBoxNormalized.min.x, selectionBoxNormalized.max.y, 1); // Far-top-left

    // Convert from NDC space to world space
    for (let i = 0; i < this._selectionCorners.length; i++) {
      this._selectionCorners[i].unproject(this.camera);
    }

    // Create frustum planes ensuring they face inward
    this._selectionFrustum.planes = [
      new THREE.Plane().setFromCoplanarPoints(
        this._selectionCorners[0],
        this._selectionCorners[2],
        this._selectionCorners[1]
      ), // Near
      new THREE.Plane().setFromCoplanarPoints(
        this._selectionCorners[5],
        this._selectionCorners[6],
        this._selectionCorners[4]
      ), // Far
      new THREE.Plane().setFromCoplanarPoints(
        this._selectionCorners[4],
        this._selectionCorners[3],
        this._selectionCorners[0]
      ), // Left
      new THREE.Plane().setFromCoplanarPoints(
        this._selectionCorners[1],
        this._selectionCorners[2],
        this._selectionCorners[5]
      ), // Right
      new THREE.Plane().setFromCoplanarPoints(
        this._selectionCorners[3],
        this._selectionCorners[6],
        this._selectionCorners[2]
      ), // Top
      new THREE.Plane().setFromCoplanarPoints(
        this._selectionCorners[4],
        this._selectionCorners[1],
        this._selectionCorners[5]
      ), // Bottom
    ];

    return this._selectionFrustum;
  }

  private handleDragSelect(selectionBoxNormalized: THREE.Box2, ctrlKey: boolean) {
    const frustum = this.createSelectionFrustum(selectionBoxNormalized);

    const withinSelection = (slot: ServerComponentSlot) => {
      return frustum.intersectsBox(slot.boundingBox.bound);
    };

    if (ctrlKey) {
      this.toggleSelectAll(withinSelection);
    } else {
      this.selectAll(withinSelection);
    }
  }

  // private makeEvent<Type extends ServerComponentSlotMouseEventTypes>(
  //   type: Type,
  //   event: MouseEvent,
  //   intersectionPoint?: THREE.Vector3
  // ): ServerComponentSlotMouseEvent<Type> {
  //   return {
  //     type,
  //     ctrlKey: event.ctrlKey,
  //     altKey: event.altKey,
  //     button: event.button,
  //     buttons: event.buttons,
  //     metaKey: event.metaKey,
  //     shiftKey: event.shiftKey,
  //     ray: this.raycaster.ray.clone(),
  //     point: intersectionPoint,
  //   };
  // }

  private normalizedMouseEventCoords(event: MouseEvent): THREE.Vector2 {
    const canvasRect = this.domElement.getBoundingClientRect();
    return new THREE.Vector2(
      ((event.clientX - canvasRect.left) / canvasRect.width) * 2 - 1,
      -((event.clientY - canvasRect.top) / canvasRect.height) * 2 + 1
    );
  }

  // private static getServerComponentSlotParent(obj: THREE.Object3D): ServerComponentSlot | null {
  //   if (obj instanceof ServerComponentSlot) {
  //     return obj;
  //   }
  //   if (obj.parent) {
  //     return MouseEventTranslator.getServerComponentSlotParent(obj.parent);
  //   }
  //   return null;
  // }

  private getMouseEventIntersections(
    event: MouseEvent,
    mouseUpCoordsNormalized?: THREE.Vector2
  ): ServerComponentSlot[] {
    this.raycaster.setFromCamera(
      mouseUpCoordsNormalized ?? this.normalizedMouseEventCoords(event),
      this.camera
    );
    return this.raycaster
      .intersectObjects(
        this.componentSlots.map((slot) => slot.boundingBox),
        false
      )
      .map((intersection) => {
        if (!(intersection.object instanceof SlotBoundingBox)) {
          return;
        }
        return intersection.object.slotRef;
      })
      .filter((slot): slot is ServerComponentSlot => slot !== undefined);
    // return this.raycaster
    //   .intersectObjects(
    //     this.componentSlots.map((slot) => slot.boundingBox),
    //     false
    //   )
    //   .map((intersection) =>
    //     this.componentSlots.find((slot) => slot.boundingBox === intersection.object)
    //   )
    //   .filter((slot): slot is ServerComponentSlot => slot !== undefined);
  }
}
