<template>
  <!-- <img :src="driveBaysImage" alt="Drive bays" /> -->
  <div ref="canvasParent"></div>
</template>

<script setup lang="ts">
import {
  ref,
  provide,
  reactive,
  onMounted,
  computed,
  watch,
  useTemplateRef,
  onUnmounted,
  onBeforeUnmount,
  watchEffect,
} from "vue";
import {
  Server,
  type DiskInfo,
  type ServerModel,
  type SlotType,
} from "@45drives/houston-common-lib";

import * as THREE from "three";

import diskTextures from "./textures";

const props = withDefaults(defineProps<{ server?: Server }>(), { server: () => new Server() });

const canvasParent = useTemplateRef<HTMLDivElement>("canvasParent");

const diskInfo = ref<DiskInfo>();

const serverModel = ref<ServerModel>();

const scale = ref<number>(1);

watch(
  () => props.server,
  (server) => {
    server.getServerModel().map((model) => {
      serverModel.value = model;
    });

    server.getDiskInfo().map((d) => {
      diskInfo.value = d as DiskInfo;
    });
  },
  { immediate: true }
);

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
const textureLoader = new THREE.TextureLoader();

const bgPlane = new THREE.Mesh();
scene.add(bgPlane);

camera.position.z = 5;

const diskMeshes: THREE.Mesh[] = [];

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function animate() {
  renderer.render(scene, camera);
}

renderer.domElement.addEventListener("click", (event) => {
  // Convert mouse position to normalized device coordinates (-1 to +1) for both axes
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  console.log("click event:", event, mouse);

  // Cast a ray from the camera to the mouse position
  raycaster.setFromCamera(mouse, camera);

  // Check for intersections with objects in the scene
  const intersects = raycaster.intersectObjects(scene.children);

  // If an intersection occurs, print information or do something with the object
  if (intersects.length > 0) {
    const object = intersects[0].object;
    console.log("You clicked on: ", object.userData.name ?? "bg");
  }
});

onMounted(() => {
  if (!canvasParent.value) {
    throw new Error("Canvas parent was null in onMounted!");
  }
  renderer.setSize(canvasParent.value.clientWidth, canvasParent.value.clientWidth);
  canvasParent.value.appendChild(renderer.domElement);
  renderer.setAnimationLoop(animate);
});

onBeforeUnmount(() => {
  renderer.setAnimationLoop(null);
  canvasParent.value?.removeChild(renderer.domElement);
});

watchEffect(() => {
  if (!serverModel.value || !canvasParent.value) {
    return;
  }
  textureLoader.load(serverModel.value.imageURLs.driveBays, (bgTexture) => {
    bgTexture.magFilter = THREE.NearestFilter;
    const aspectRatio = (bgTexture.image.width / bgTexture.image.height) as number;
    camera.left = -aspectRatio;
    camera.right = aspectRatio;
    camera.updateProjectionMatrix();
    renderer.setSize(
      canvasParent.value!.clientWidth,
      canvasParent.value!.clientWidth / aspectRatio
    );
    scale.value = 2.0 / bgTexture.image.height;
    bgPlane.geometry = new THREE.PlaneGeometry(aspectRatio * 2, 2);
    bgPlane.material = new THREE.MeshBasicMaterial({ map: bgTexture });

    diskMeshes.length = 0;

    for (const slot of serverModel.value!.slotLocations) {
      console.log("a", slot.name);
      const disk = new THREE.Mesh();
      disk.userData = { name: slot.name };
      disk.position.x = camera.left + slot.x * scale.value;
      disk.position.y = camera.top - slot.y * scale.value;
      disk.position.z = 1;
      disk.rotation.z += (Math.PI / 180) * slot.rotation;
      diskMeshes.push(disk);
      scene.add(disk);
    }
  });
});

watchEffect(() => {
  if (!serverModel.value || !diskInfo.value) {
    return;
  }
  console.log(diskInfo.value.rows);
  for (const [index, bay] of diskInfo.value.rows.entries()) {
    let texture;
    console.log("b", bay["bay-id"]);
    if (!bay.occupied) {
      diskMeshes[index].material = new THREE.MeshBasicMaterial();
      continue;
    }
    switch (bay.disk_type) {
      case "HDD":
        texture = diskTextures.HDD;
        break;
      default:
      case "SSD":
        texture = diskTextures.SSD_7mm;
        break;
    }
    diskMeshes[index].material = new THREE.MeshBasicMaterial({ map: texture });
    diskMeshes[index].geometry = new THREE.PlaneGeometry(
      texture.image.width * scale.value,
      texture.image.height * scale.value
    );
  }
});

// watch([diskInfo, serverGraphics], () => {
//   if ([diskInfo.value, serverGraphics.value, canvasParent.value].some((v) => !v)) {
//     return;
//   }
//   const bg = PIXI.Sprite.from(serverGraphics.value.drivebay);
//   const app = new PIXI.Application<HTMLCanvasElement>({ width: bg.width, height: bg.height });

//   app.stage.addChild(bg);

//   canvasParent.value!.appendChild(app.view);
// });
</script>
