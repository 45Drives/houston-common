<template>
  <div ref="canvasParent" class="overflow-hidden"></div>
</template>

<script setup lang="ts">
import {
  useTemplateRef,
  onBeforeUnmount,
  watchEffect,
  type WatchHandle,
  onMounted,
  reactive,
} from "vue";
import { Server, unwrap, type DriveSlot } from "@45drives/houston-common-lib";

import { useDarkModeState } from "@/composables";

// const pidParams = reactive({ kp: 0.005, ki: 0, kd: 0 });

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

const serverView = Promise.all([import("./ServerView"), props.server.getServerModel()]).then(
  async ([{ ServerView, ServerDriveSlot }, serverModel]) => {
    const watchHandles: WatchHandle[] = [];

    const serverView = new ServerView(await unwrap(serverModel));

    serverView.addEventListener("selectionchange", (e) => {
      selectedDriveSlots.value = e.components
        .filter((c): c is InstanceType<typeof ServerDriveSlot> => c instanceof ServerDriveSlot)
        .map((driveSlot) => driveSlot.driveSlot);
    });

    const liveDriveSlotsHandle = props.server.setupLiveDriveSlotInfo((slots) => {
      driveSlots.value = slots;
      serverView.setDriveSlotInfo(slots);
    });

    watchHandles.push(
      watchEffect(() => {
        if (!canvasParent.value) {
          return;
        }
        serverView.start(canvasParent.value);
        serverView
          .setView("InitialView")
          .then(() => new Promise((resolve) => setTimeout(resolve, 1000)))
          .then(() => {
            serverView.revealDrives();
            serverView.setView("DriveView");
          });
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
      liveDriveSlotsHandle.stop();
      serverView.stop();
      for (const wh of watchHandles) {
        wh.stop();
      }
    };

    return serverView;
  }
);

defineExpose({
  serverView,
});

onBeforeUnmount(() => {
  unmountCallback?.();
});
</script>
