<template>
  <div id="p5-hl4-homelab" class="self-stretch m-2 flex justify-center"></div>
</template>

<script setup lang="ts">
// import { ref, watch, onMounted, inject } from "vue";
// import type { Ref } from "vue";
// import loadingAnimation from "./loadingAnimation";
// import resizeHook from "./resizeHook";

// import P5 from "p5";

// interface DiskLocation {
//   x: number;
//   y: number;
//   BAY: string;
//   HDD: boolean;
//   occupied: boolean;
//   image: any;
// }

// // Image assets with updated paths
// const assets = {
//   chassis: { path: "img/disks-module/chassis/hl4-homelab.png", image: null },
//   disks: {
//     caddy: {
//       default: { path: "img/disks-module/disks/caddy-generic.png", image: null },
//       micron5200: { path: "img/disks-module/disks/caddy-micron.png", image: null },
//       micron5300: { path: "img/disks-module/disks/caddy-micron-5300.png", image: null },
//       seagate: { path: "img/disks-module/disks/caddy-seagate.png", image: null },
//       seagateSas: { path: "img/disks-module/disks/caddy-seagate-sas.png", image: null },
//       loading: { path: "img/disks-module/disks/caddy-loading.png", image: null },
//       empty: { path: "img/disks-module/disks/empty-caddy.png", image: null },
//     },
//     ssd: {
//       loading: { path: "img/disks-module/disks/ssd-loading.png", image: null },
//       default: { path: "img/disks-module/disks/ssd-generic.png", image: null },
//       empty: { path: "img/disks-module/disks/empty-ssd.png", image: null },
//     },
//     hdd: {
//       default: { path: "img/disks-module/disks/hdd-generic.png", image: null },
//       seagateSt: { path: "img/disks-module/disks/hdd-seagate-st.png", image: null },
//       seagate: { path: "img/disks-module/disks/hdd-seagate.png", image: null },
//       toshiba: { path: "img/disks-module/disks/hdd-toshiba.png", image: null },
//       loading: { path: "img/disks-module/disks/hdd-loading.png", image: null },
//       empty: { path: "img/disks-module/disks/empty-hdd.png", image: null },
//     },
//   },
//   loadingFlag: true,
// };

// const diskLocations: DiskLocation[] = [
//   { x: 9, y: 33, BAY: "1-1", HDD: true, occupied: false, image: null },
//   { x: 41, y: 33, BAY: "1-2", HDD: true, occupied: false, image: null },
//   { x: 72, y: 33, BAY: "1-3", HDD: true, occupied: false, image: null },
//   { x: 104, y: 33, BAY: "1-4", HDD: true, occupied: false, image: null },
// ];

// const diskInfoObj = ref<Record<string, any>>({});
// const currentDisk = inject<Ref<string>>("currentDisk", ref(""));
// const lsdevJson = inject<Record<string, any>>("lsdevJson") || {};
// const diskInfo = inject<Record<string, any>>("diskInfo") || {};

// watch(
//   diskInfo,
//   () => {
//     if (!diskInfo) return;
//     diskInfoObj.value = diskInfo;
//     updateDiskLocations(diskInfoObj.value.rows.flat());
//   },
//   { immediate: true, deep: true }
// );

// watch(
//   lsdevJson,
//   () => {
//     if (!lsdevJson) return;
//     diskInfoObj.value = lsdevJson;
//     assets.loadingFlag = false;
//     updateDiskLocations(diskInfoObj.value.rows.flat());
//   },
//   { immediate: false, deep: true }
// );

// function updateDiskLocations(slots: any[]) {
//   slots.forEach((slot) => {
//     const index = diskLocations.findIndex((loc) => loc.BAY === slot["bay-id"]);
//     if (index === -1) return;
//     diskLocations[index].occupied = slot.occupied;
//     diskLocations[index].image = getDiskImage(slot.occupied, slot["disk_type"], diskLocations[index].HDD);
//   });
// }

// function getDiskImage(occupied: boolean, diskType: string, slotHdd: boolean) {
//   if (!occupied) return slotHdd ? assets.disks.hdd.empty.image : assets.disks.ssd.empty.image;
//   if (assets.loadingFlag) return slotHdd ? assets.disks.caddy.loading.image : assets.disks.ssd.loading.image;
//   return diskType === "HDD" ? assets.disks.hdd.default.image : assets.disks.caddy.default.image;
// }

// const p5Script = (p5: P5) => {
//   loadingAnimation(p5);

//   p5.setup = () => {
//     const image = assets.chassis.image as HTMLImageElement | null;
//     if (!image) {
//       console.error("Chassis image not loaded yet!");
//       return;
//     }

//     const canvas = p5.createCanvas(image.width, image.height);
//     canvas.parent("p5-hl4-homelab");
//     resizeHook(p5, canvas.id(), image.width, "p5-hl4-homelab");
//   };

//   p5.draw = () => {
//     p5.image(assets.chassis.image!, 0, 0);
//     diskLocations.forEach((loc) => {
//       if (loc.occupied && loc.image) {
//         p5.image(loc.image, loc.x, loc.y);
//       }
//     });
//     if (currentDisk?.value) {
//       highlightCurrentDisk(p5);
//     }
//   };

//   p5.mouseClicked = () => {
//     const { mouseX, mouseY } = p5;
//     diskLocations.forEach((loc) => {
//       if (loc.image && mouseX > loc.x && mouseX < loc.x + loc.image.width && mouseY > loc.y && mouseY < loc.y + loc.image.height) {
//         if (currentDisk) currentDisk.value = loc.BAY;
//       }
//     });
//   };
// };

// function highlightCurrentDisk(p5: P5) {
//   const idx = diskLocations.findIndex((loc) => loc.BAY === currentDisk.value);
//   if (diskLocations[idx].image) {
//     p5.fill(255, 255, 255, 50);
//     p5.stroke(206, 242, 212);
//     p5.strokeWeight(2);
//     p5.rect(diskLocations[idx].x, diskLocations[idx].y, diskLocations[idx].image.width, diskLocations[idx].image.height);
//   }
// }

// onMounted(() => {
//   p5.then((p5) => new p5.default(p5Script));
// });
</script>
