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
  shallowRef,
} from "vue";
import {
  Server,
  type DiskInfo,
  type ServerModel,
  type SlotType,
} from "@45drives/houston-common-lib";

import * as THREE from "three";

import diskTextures from "./textures";
import { ServerView } from "./ServerView";

import { useDarkModeState } from "@/composables";

const props = withDefaults(defineProps<{ server?: Server }>(), { server: () => new Server() });

const canvasParent = useTemplateRef<HTMLDivElement>("canvasParent");

const diskInfo = ref<DiskInfo>();

const serverModel = ref<ServerModel>();

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

const serverView = shallowRef<ServerView>();

watchEffect(() => {
  if (!serverModel.value || !canvasParent.value) {
    return;
  }
  serverView.value = new ServerView(serverModel.value.modelNumber);
  serverView.value.start(canvasParent.value);
});

const darkMode = useDarkModeState();

watchEffect(() => {
  serverView.value?.setBackground(new THREE.Color(darkMode.value ? 0x262626 : 0xffffff));
});

// onMounted(() => {
//   if (!canvasParent.value) {
//     throw new Error("Canvas parent was null in onMounted!");
//   }
//   renderer.setSize(canvasParent.value.clientWidth, canvasParent.value.clientWidth);
//   canvasParent.value.appendChild(renderer.domElement);
//   renderer.setAnimationLoop(animate);
// });

onBeforeUnmount(() => {
  serverView.value?.stop(canvasParent.value);
});

// watchEffect(() => {
//   if (!serverModel.value || !canvasParent.value) {
//     return;
//   }
//   textureLoader.load(serverModel.value.imageURLs.driveBays, (bgTexture) => {
//     bgTexture.magFilter = THREE.NearestFilter;
//     const aspectRatio = (bgTexture.image.width / bgTexture.image.height) as number;
//     camera.left = -aspectRatio;
//     camera.right = aspectRatio;
//     camera.updateProjectionMatrix();
//     renderer.setSize(
//       canvasParent.value!.clientWidth,
//       canvasParent.value!.clientWidth / aspectRatio
//     );
//     scale.value = 2.0 / bgTexture.image.height;
//     bgPlane.geometry = new THREE.PlaneGeometry(aspectRatio * 2, 2);
//     bgPlane.material = new THREE.MeshBasicMaterial({ map: bgTexture });

//     diskMeshes.length = 0;

//     for (const slot of serverModel.value!.slotLocations) {
//       console.log("a", slot.name);
//       const disk = new THREE.Mesh();
//       disk.userData = { name: slot.name };
//       disk.position.x = camera.left + slot.x * scale.value;
//       disk.position.y = camera.top - slot.y * scale.value;
//       disk.position.z = 1;
//       disk.rotation.z += (Math.PI / 180) * slot.rotation;
//       diskMeshes.push(disk);
//       scene.add(disk);
//     }
//   });
// });

watchEffect(() => {
  if (!serverModel.value || !diskInfo.value) {
    return;
  }
  serverView.value?.setDiskSlotInfo(
    diskInfo.value.rows.map((info) => ({ occupiedBy: info.occupied ? info.disk_type : null }))
  );
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
