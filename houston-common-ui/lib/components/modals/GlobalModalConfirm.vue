<script setup lang="ts">
import { ref, watchEffect } from "vue";
import { ModalConfirm } from ".";
import { _internal } from "@/composables/globalModalConfirm";

const globalModalConfirm = ref<InstanceType<typeof ModalConfirm> | null>(null);

watchEffect(() => {
  if (globalModalConfirm.value !== null) {
    _internal.provideGlobalModalFuncs(globalModalConfirm.value);
  }
});
</script>

<template>
  <ModalConfirm ref="globalModalConfirm" />
</template>
