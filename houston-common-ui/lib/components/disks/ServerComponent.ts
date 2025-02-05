import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

THREE.Cache.enabled = true;

export type ModelLoader = () => Promise<THREE.Object3D>;

export type ServerComponentEventMap = {
  click: MouseEvent;
  dblclick: MouseEvent;
  mouseenter: MouseEvent;
  mouseleave: MouseEvent;
  selected: { component: ServerComponent };
  deselected: { component: ServerComponent };
} & THREE.Object3DEventMap;

export class ServerComponent extends THREE.Group<ServerComponentEventMap> {
  loaded: Promise<boolean>;

  constructor(modelLoader?: ModelLoader) {
    super();
    if (modelLoader) {
      this.loaded = modelLoader().then((model) => {
        this.add(model);
        return true;
      });
    } else {
      this.loaded = Promise.resolve(true);
    }
  }

  static isValidEvent(event: { type: string }): event is { type: keyof ServerComponentEventMap } {
    return ["click", "dblclick", "mouseenter", "mouseleave"].includes(event.type);
  }
}

const gltfLoader = new GLTFLoader();
export function gltfModelLoader(url: string): ModelLoader {
  return () => gltfLoader.loadAsync(url).then((gltf) => gltf.scene);
}

const textureLoader = new THREE.TextureLoader();
export function imageModelLoader(
  url: string,
  size: { width?: number; height?: number } = {}
): ModelLoader {
  return () =>
    textureLoader.loadAsync(url).then((texture) => {
      texture.magFilter = THREE.NearestFilter;
      const aspect = texture.image.width / texture.image.height;
      let { width, height } = size;
      if (width === undefined && height === undefined) {
        width = texture.image.width as number;
        height = texture.image.height as number;
      } else if (width) {
        height = width / aspect;
      } else if (height) {
        width = height * aspect;
      }
      console.log("imageModelLoader size", width, height);
      return new THREE.Mesh(
        new THREE.PlaneGeometry(width, height),
        new THREE.MeshBasicMaterial({ map: texture })
      );
    });
}

export class SelectionHighlight extends THREE.Mesh {
  private static material: THREE.MeshBasicMaterial = new THREE.MeshBasicMaterial({
    color: 0x00ff00,
    transparent: true,
    opacity: 0.25,
  });
  constructor(object: THREE.Object3D) {
    super();
    this.material = SelectionHighlight.material;
    this.resizeTo(object);
  }

  resizeTo(object: THREE.Object3D) {
    const bound = new THREE.Box3().setFromObject(object);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    bound.getSize(size);
    bound.getCenter(center);
    this.geometry = new THREE.BoxGeometry(size.x, size.y);
    this.position.x = center.x;
    this.position.y = center.y;
    this.position.z = center.z;
  }
}

type Constructor<T = {}> = new (...args: any[]) => T;
export function Selectable<TBase extends Constructor<ServerComponent>>(Base: TBase) {
  return class Selectable extends Base {
    _selected: boolean = false;
    _selectionHighlightBox: SelectionHighlight;
    constructor(...args: any[]) {
      super(...args);
      this._selectionHighlightBox = new SelectionHighlight(this);
      this.addEventListener("click", (event) => {
        if (event.shiftKey) {
          this.selected = true;
        } else {
          this.selected = !this.selected;
        }
        this.dispatchEvent({ type: this.selected ? "selected" : "deselected", component: this });
      });
    }

    get selected(): boolean {
      return this._selected;
    }

    set selected(value: boolean) {
      if (value === this._selected) {
        return;
      }
      if (value) {
        this._selectionHighlightBox.resizeTo(this);
        this.add(this._selectionHighlightBox);
      } else {
        this.remove(this._selectionHighlightBox);
      }
      this._selected = value;
    }
  };
}
