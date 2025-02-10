<template>
  <!-- <img :src="driveBaysImage" alt="Drive bays" /> -->
  <div ref="canvasParent"></div>
</template>

<script setup lang="ts">
import {
  ref,
  watch,
  useTemplateRef,
  onBeforeUnmount,
  watchEffect,
  shallowRef,
} from "vue";
import { Server, type LSDevDisk, type ServerModel } from "@45drives/houston-common-lib";

import * as THREE from "three";

import { ServerView } from "./ServerView";

import { useDarkModeState } from "@/composables";

const props = withDefaults(
  defineProps<{
    server?: Server;
    enableSelection: boolean;
    enableRotate: boolean;
    enablePan: boolean;
    enableZoom: boolean;
  }>(),
  {
    server: () => new Server(),
    enableSelection: false,
    enableRotate: false,
    enablePan: false,
    enableZoom: false,
  }
);

const canvasParent = useTemplateRef<HTMLDivElement>("canvasParent");

const diskInfo = ref<LSDevDisk[]>();

const serverModel = ref<ServerModel>();

const selectedDisks = defineModel<LSDevDisk[]>("selectedDisks", { default: [] });

watch(
  () => props.server,
  (server) => {
    server.getServerModel().map((model) => {
      serverModel.value = model;
    });

    server.getLsDev().map((d) => {
      diskInfo.value = d;
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
  serverView.value.addEventListener("selectionchange", (e) => {
    selectedDisks.value = e.components.map((component) => component.userData as LSDevDisk);
  });
});

watchEffect(() => {
  if (!serverView.value) {
    return;
  }
  serverView.value.enableSelection = props.enableSelection;
  serverView.value.enableRotate = props.enableRotate;
  serverView.value.enablePan = props.enablePan;
  serverView.value.enableZoom = props.enableZoom;
});

const darkMode = useDarkModeState();

watchEffect(() => {
  serverView.value?.setBackground(new THREE.Color(darkMode.value ? 0x262626 : 0xffffff));
});

onBeforeUnmount(() => {
  serverView.value?.stop(canvasParent.value);
});

watchEffect(() => {
  if (!serverModel.value || !diskInfo.value) {
    return;
  }
  serverView.value?.setDiskSlotInfo(diskInfo.value);
});
</script>
