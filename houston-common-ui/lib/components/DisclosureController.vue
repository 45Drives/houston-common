<script setup lang="ts">
import { defineModel } from "vue";

const show = defineModel("show", { default: false });

const setShow = (value: boolean) => show.value = value;
</script>

<template>
  <slot :show :setShow />
</template>
