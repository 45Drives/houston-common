<template>
  <!-- <img :src="driveBaysImage" alt="Drive bays" /> -->
  <div ref="canvasParent"></div>
</template>

<script setup lang="ts">
import { ref, watch, useTemplateRef, onBeforeUnmount, watchEffect, shallowRef } from "vue";
import {
  Server,
  type DriveSlot,
  type LSDevDisk,
  type ServerModel,
} from "@45drives/houston-common-lib";

import * as THREE from "three";

import { DriveSlotComponent } from "./DriveSlot";

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

const serverView = new ServerView(props.server);

const selectedDisks = defineModel<DriveSlot[]>("selectedDisks", { default: [] });

serverView.addEventListener("selectionchange", (e) => {
  selectedDisks.value = e.components
    .filter((c): c is DriveSlotComponent => c instanceof DriveSlotComponent)
    .map((driveSlot) => driveSlot.userData);
});

watchEffect(() => {
  if (!canvasParent.value) {
    return;
  }
  serverView.start(canvasParent.value);
});

watchEffect(() => {
  serverView.enableSelection = props.enableSelection;
  serverView.enableRotate = props.enableRotate;
  serverView.enablePan = props.enablePan;
  serverView.enableZoom = props.enableZoom;
});

const darkMode = useDarkModeState();

watchEffect(() => {
  serverView.setBackground(new THREE.Color(darkMode.value ? 0x262626 : 0xffffff));
});

onBeforeUnmount(() => {
  serverView.stop(canvasParent.value);
});
</script>
