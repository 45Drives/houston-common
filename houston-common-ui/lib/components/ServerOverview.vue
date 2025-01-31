<template>
  <img :src="image" alt="Server Image" />
</template>
<script setup lang="ts">
import { ref, defineProps, withDefaults, computed, watch } from "vue";
import { lookupImages } from "@/img";
import { Server } from "@45drives/houston-common-lib";

const props = withDefaults(defineProps<{ server?: Server }>(), { server: () => new Server() });

const modelNumber = ref("");
const image = computed(() => lookupImages(modelNumber.value).overview);

watch(
  () => props.server,
  () => {
    props.server.getServerInfo().map((info) => {
      modelNumber.value = info.Model ?? "";
    });
  },
  { immediate: true }
);
</script>
