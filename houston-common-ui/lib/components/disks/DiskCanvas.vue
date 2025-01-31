<template>
    <div id="canvas-viewer" class="card inline-flex flex-col flex-auto bg-default h-full text-default">
        <div class="card-header flex flex-row items-center">
            <h3 class="text-header text-default">Disk Viewer</h3>
        </div>
        <div ref="canvasCardBody"
            class="card-body flex-auto flex flex-col items-center content-center p-0 overflow-visible">
            <P5HomeLabHL4 />
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, provide, reactive, onMounted } from "vue";
import P5HomeLabHL4 from "./P5HomeLabHL4.vue";
import { Disks } from "@45drives/houston-common-lib";

const serverModel = ref<string | null>(null);
const currentDisk = ref<string>("");
const lsdevState = ref<string>("");
const lsdevJson = reactive<Record<string, any>>({});
const diskInfo = reactive<Record<string, any>>({});

const { fetchLsdev, fetchDiskInfo } = Disks;

provide("currentDisk", currentDisk);
provide("lsdevState", lsdevState);
provide("lsdevJson", lsdevJson);
provide("diskInfo", diskInfo);

const init = async () => {
    lsdevJson.value = fetchLsdev();
    diskInfo.value = fetchDiskInfo();
};

onMounted(() => {
    init();
});
</script>
