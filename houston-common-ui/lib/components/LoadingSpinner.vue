<!--
Copyright (C) 2022 Josh Boudreau <jboudreau@45drives.com>

This file is part of 45Drives cockpit-vue-components.

45Drives cockpit-vue-components is free software: you can redistribute it and/or modify it under the terms
of the GNU General Public License as published by the Free Software Foundation, either version 3
of the License, or (at your option) any later version.

45Drives cockpit-vue-components is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License along with 45Drives cockpit-vue-components.
If not, see <https://www.gnu.org/licenses/>. 
-->

<script lang="ts">
import { defineComponent } from "vue";

/**
 * Simple animated loading spinner
 * @public
 */
export default defineComponent({});
</script>

<template>
	<div
		class="size-icon aspect-square animate-spin border-2 border-neutral-300 border-t-neutral-500 dark:border-neutral-500 dark:border-t-neutral-200 rounded-full">
	</div>
</template>

<style scoped>
@import "@45drives/houston-common-css/src/index.css";
</style>
