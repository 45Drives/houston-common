<template>
  <div ref="canvasParent" class="overflow-hidden"></div>
</template>

<script setup lang="ts">
import { useTemplateRef, onBeforeUnmount, watchEffect, type WatchHandle, onMounted } from "vue";
import { Server, type DriveSlot } from "@45drives/houston-common-lib";

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

let unmountCallback: (() => void) | undefined = undefined;

const canvasParent = useTemplateRef<HTMLDivElement>("canvasParent");

const selectedDriveSlots = defineModel<DriveSlot[]>("selectedDriveSlots", { default: [] });

const driveSlots = defineModel<DriveSlot[]>("driveSlots", { default: [] });

const darkMode = useDarkModeState();

import("./ServerView").then(({ ServerView, ServerDriveSlot }) => {
  const watchHandles: WatchHandle[] = [];

  const serverView = new ServerView(props.server);

  serverView.addEventListener("selectionchange", (e) => {
    selectedDriveSlots.value = e.components
      .filter((c): c is InstanceType<typeof ServerDriveSlot> => c instanceof ServerDriveSlot)
      .map((driveSlot) => driveSlot.driveSlot);
  });

  serverView.addEventListener("driveslotchange", (e) => {
    driveSlots.value = [...e.slots];
  });

  watchHandles.push(
    watchEffect(() => {
      if (!canvasParent.value) {
        return;
      }
      serverView.start(canvasParent.value);
    })
  );

  watchHandles.push(
    watchEffect(() => {
      serverView.enableSelection = props.enableSelection;
      serverView.enableRotate = props.enableRotate;
      serverView.enablePan = props.enablePan;
      serverView.enableZoom = props.enableZoom;
    })
  );

  watchHandles.push(
    watchEffect(() => {
      serverView.setBackground(darkMode.value ? 0x262626 : 0xffffff);
    })
  );

  unmountCallback = () => {
    serverView.stop();
    for (const wh of watchHandles) {
      wh.stop();
    }
  };
});

onBeforeUnmount(() => {
  unmountCallback?.();
});
</script>
