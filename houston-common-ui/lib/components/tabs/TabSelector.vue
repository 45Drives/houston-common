<!--
Copyright (C) 2022 Josh Boudreau <jboudreau@45drives.com>

This file is part of Cockpit File Sharing.

Cockpit File Sharing is free software: you can redistribute it and/or modify it under the terms
of the GNU General Public License as published by the Free Software Foundation, either version 3
of the License, or (at your option) any later version.

Cockpit File Sharing is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License along with Cockpit File Sharing.
If not, see <https://www.gnu.org/licenses/>. 
-->

<script setup lang="ts">
import { defineProps } from "vue";

const props = defineProps<{
  labels: string[];
}>();

const index = defineModel<number>("index", { required: true });

</script>

<template>
  <div class="flex flex-row flex-nowrap items-stretch self-stretch gap-2">
    <button
      v-for="(label, i) in labels"
      :key="label"
      :class="[
        'px-2 border-b-2 border-b-transparent hover:border-b-neutral-400 dark:hover:border-b-neutral-600 text-lg font-medium sm:pt-2',
        i === index ? '!border-b-red-700 dark:!border-b-red-800' : 'text-muted hover:text-default',
      ]"
      @click="index = i"
    >
      {{ label }}
    </button>
  </div>
</template>

<style scoped>
@import "@45drives/houston-common-css/src/index.css";
</style>
