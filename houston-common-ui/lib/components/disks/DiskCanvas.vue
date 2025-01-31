<template>
  <img :src="driveBaysImage" alt="Drive bays" />
  <!-- <div ref="canvasParent"></div> -->
</template>

<script setup lang="ts">
import { ref, provide, reactive, onMounted, computed, watch, useTemplateRef } from "vue";
import { Server, type DiskInfo } from "@45drives/houston-common-lib";
import { lookupImages } from "@/img";
// import * as PIXI from "pixijs";

const props = withDefaults(defineProps<{ server?: Server }>(), { server: () => new Server() });

const canvasParent = useTemplateRef<HTMLDivElement>("canvasParent");

const modelNumber = ref("");

const diskInfo = ref<DiskInfo>();

watch(
  () => props.server,
  (server) => {
    server.getServerInfo().map((info) => {
      modelNumber.value = info.Model ?? "";
    });

    server.getDiskInfo().map((d) => {
      diskInfo.value = d as DiskInfo;
    });
  },
  { immediate: true }
);

const serverGraphics = computed(() => lookupImages(modelNumber.value));

const driveBaysImage = computed(() => serverGraphics.value.drivebay);


// watch([diskInfo, serverGraphics], () => {
//   if ([diskInfo.value, serverGraphics.value, canvasParent.value].some((v) => !v)) {
//     return;
//   }
//   const bg = PIXI.Sprite.from(serverGraphics.value.drivebay);
//   const app = new PIXI.Application<HTMLCanvasElement>({width: bg.width, height: bg.height});

//   app.stage.addChild(bg);


//   canvasParent.value!.appendChild(app.view);
// });
</script>
