<template>
  <div ref="canvasParent" class="overflow-hidden relative">
    <div
      class="absolute inset-0 pointer-events-none flex flex-col items-center justify-center transition-opacity ease-out duration-1000 z-10"
      :class="[showLoading ? 'opacity-100' : 'opacity-0']"
    >
      <div
        class="inline-flex flex-col items-center justify-center gap-2 bg-default p-2 rounded-md w-1/2"
      >
        <div class="text-default text-sm text-center">
          {{ loadingText }}
        </div>
        <ProgressBar :percent="loadingPercent" class="w-full rounded-md" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  useTemplateRef,
  onBeforeUnmount,
  watchEffect,
  type WatchHandle,
  onMounted,
  reactive,
  ref,
  watch,
} from "vue";
import { Server, unwrap, type DriveSlot } from "@45drives/houston-common-lib";

import { useDarkModeState } from "@/composables";

import { ProgressBar } from "@/components";

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

const showLoading = ref(true);
const loadingText = ref("Loading...");
const loadingPercent = ref(0);

const canvasParent = useTemplateRef<HTMLDivElement>("canvasParent");

const selectedDriveSlots = defineModel<DriveSlot[]>("selectedDriveSlots", { default: [] });

const driveSlots = defineModel<DriveSlot[]>("driveSlots", { default: [] });

const darkMode = useDarkModeState();
/* 
const serverView = Promise.all([import("./ServerView"), props.server.getServerModel()]).then(
  async ([{ ServerView, ServerDriveSlot }, serverModel]) => {
    const watchHandles: WatchHandle[] = [];

    const serverView = new ServerView(await unwrap(serverModel));

    let hideLoadingTimeout: ReturnType<typeof setTimeout> | undefined = undefined;

    serverView.onLoadingStart = (status, loaded, total) => {
      clearTimeout(hideLoadingTimeout);
      showLoading.value = true;
      loadingText.value = `${status} (${loaded}/${total})`;
      loadingPercent.value = Math.round((loaded / total) * 100);
    };
    serverView.onLoadingProgress = (status, loaded, total) => {
      clearTimeout(hideLoadingTimeout);
      showLoading.value = true;
      loadingText.value = `${status} (${loaded}/${total})`;
      loadingPercent.value = Math.round((loaded / total) * 100);
    };
    serverView.onLoadingEnd = (status) => {
      clearTimeout(hideLoadingTimeout);
      hideLoadingTimeout = setTimeout(() => {
        showLoading.value = false;
      }, 1000);
      loadingText.value = status;
      loadingPercent.value = 100;
    };

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
);*/
// DiskCanvas.vue (inside <script setup>)

type AnyServerView = {
  start(parent: HTMLElement): void;
  stop(): void;
  setView(view: "InitialView" | "DriveView"): Promise<void>;
  revealDrives(): Promise<void>;
  hideDrives(): Promise<void>;
  setBackground(bg: number): void;
  setDriveSlotInfo(slots: DriveSlot[]): Promise<void> | void;
  setSlotHighlights(flag: any, ids: string[], value?: boolean): Promise<void> | void;
  addEventListener(type: "selectionchange", cb: (e: any) => void): void;
  enableSelection: boolean;
  enableRotate: boolean;
  enablePan: boolean;
  enableZoom: boolean;
  onLoadingStart?: (s: string, l: number, t: number) => void;
  onLoadingProgress?: (s: string, l: number, t: number) => void;
  onLoadingEnd?: (s: string, l: number, t: number) => void;
  setBanner?(text: string): void;
};

const serverView = Promise.all([
  import("./ServerView"),
  import("@/components/ServerView/assets"),
  props.server.getServerModel(),
]).then(async ([svMod, assetsMod, serverModelPromise]) => {
  const [{ ServerView }, { supportsChassisModel }] = [svMod, assetsMod];
  const modelNumber = await unwrap(serverModelPromise);

  const watchHandles: WatchHandle[] = [];
  let view: AnyServerView;
  let hideLoadingTimeout: ReturnType<typeof setTimeout> | undefined;

  const wireLoading = (sv: AnyServerView) => {
    sv.onLoadingStart = (status, loaded, total) => {
      clearTimeout(hideLoadingTimeout);
      showLoading.value = true;
      loadingText.value = `${status} (${loaded}/${total})`;
      loadingPercent.value = Math.round((loaded / total) * 100);
    };
    sv.onLoadingProgress = (status, loaded, total) => {
      clearTimeout(hideLoadingTimeout);
      showLoading.value = true;
      loadingText.value = `${status} (${loaded}/${total})`;
      loadingPercent.value = Math.round((loaded / total) * 100);
    };
    sv.onLoadingEnd = (status) => {
      clearTimeout(hideLoadingTimeout);
      hideLoadingTimeout = setTimeout(() => (showLoading.value = false), 1000);
      loadingText.value = status;
      loadingPercent.value = 100;
    };
  };

  let usedFallback = false;

  try {
    if (supportsChassisModel?.(modelNumber)) {
      view = new ServerView(modelNumber) as unknown as AnyServerView;
    } else {
      const { FallbackServerView } = await import("./ServerView/FallbackServerView");
      const fb = new FallbackServerView();
      fb.setBanner?.(
        `3D model not found for ${modelNumber} (coming soon). Rendering generic view for now.`
      );
      view = fb;
      usedFallback = true;
    }
  } catch (e) {
    console.warn("[DiskCanvas] Falling back to generic view:", e);
    const { FallbackServerView } = await import("./ServerView/FallbackServerView");
    const fb = new FallbackServerView();
    fb.setBanner?.(
      `3D model not found for ${modelNumber} (coming soon). Rendering generic view for now.`
    );
    view = fb;
    usedFallback = true;
  }

  wireLoading(view);

  // Selection handler compatible with both implementations
  view.addEventListener("selectionchange", (e: any) => {
    const comps = Array.isArray(e?.components) ? e.components : [];
    selectedDriveSlots.value = comps
      .map((c: any) => c?.driveSlot)
      .filter((x: any): x is DriveSlot => !!x);
  });

  const liveDriveSlotsHandle = props.server.setupLiveDriveSlotInfo((slots) => {
    driveSlots.value = slots;
    view.setDriveSlotInfo(slots);
  });

  watchHandles.push(
    watchEffect(() => {
      if (!canvasParent.value) return;
      view.start(canvasParent.value);
      view
        .setView("InitialView")
        .then(() => new Promise((r) => setTimeout(r, 1000)))
        .then(() => {
          view.revealDrives?.();
          view.setView("DriveView");
        });
    })
  );

  watchHandles.push(
    watchEffect(() => {
      view.enableSelection = props.enableSelection;
      view.enableRotate = props.enableRotate;
      view.enablePan = props.enablePan;
      view.enableZoom = props.enableZoom;
    })
  );

  watchHandles.push(
    watchEffect(() => {
      view.setBackground(darkMode.value ? 0x262626 : 0xffffff);
    })
  );

  unmountCallback = () => {
    liveDriveSlotsHandle.stop();
    view.stop();
    for (const wh of watchHandles) wh.stop();
  };

  return view;
});



defineExpose({
  serverView,
});

onBeforeUnmount(() => {
  unmountCallback?.();
});
</script>
