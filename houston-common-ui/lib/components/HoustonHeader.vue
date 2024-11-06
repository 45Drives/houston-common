<!--
Copyright (C) 2022 Mark Hooper <mhooper@45drives.com>
                   Josh Boudreau <jboudreau@45drives.com>

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
import { ref, watch, inject, defineComponent, type Ref, type WatchSource } from "vue";
import LoadingSpinner from "@/components/LoadingSpinner.vue";
import { useGlobalProcessingState } from '@/composables/useGlobalProcessingState';
import Logo45Drives from '@/components/Logo45Drives.vue';

/**
 * Default header for Cockpit (Houston) plugins
 */
export default defineComponent({
	props: {
		moduleName: String,
	},
	setup(props) {
		const globalProcessingState = useGlobalProcessingState();
		function home() {
			cockpit.location.go('/');
		}
		function vape(event: MouseEvent) {
			if (!event.ctrlKey)
				return;
			function makeWide(string: string) {
				let bytesOut: number[] = [];
				let bytesIn = new TextEncoder().encode(string);
				if (bytesIn.indexOf(0xef) !== -1) // already wide
					return string;
				bytesIn.forEach(byte => {
					if (/^[a-z]$/.test(String.fromCharCode(byte)))
						bytesOut.push(0xef, 0xbd, byte + 0x20);
					else if (/^[A-Z0-9]$/.test(String.fromCharCode(byte)))
						bytesOut.push(0xef, 0xbc, byte + 0x60);
					else if (String.fromCharCode(byte) === ' ')
						bytesOut.push(0xe2, 0x80, 0x83);
					else
						bytesOut.push(byte);
				});
				return new TextDecoder().decode(new Uint8Array(bytesOut));
			}
			setInterval(() => {
				let elems = document.querySelectorAll('#app *') as NodeListOf<HTMLElement>;
				for (let i = 0; i < elems.length; i++) {
					const element = elems[i]!;
					if (element.children.length > 0)
						continue;
					if (element.textContent) {
						element.textContent = makeWide(element.textContent);
						element.style.color = "#ff00fb";
					}
				}
			}, 500);
		}

		return {
			globalProcessingState,
			home,
			vape,
		};
	},
	components: {
		LoadingSpinner,
		Logo45Drives,
	}
});
</script>

<template>
	<div class="px-3 sm:px-5 flex items-center bg-plugin-header font-redhat font-normal shadow-lg z-10">
		<div class="flex flex-row flex-wrap items-baseline basis-32 grow shrink-0 gap-x-4 content-between">
			<div class="flex flex-row items-center my-5">
				<Logo45Drives class="h-6" />
			</div>
			<slot name="header-left"></slot>
		</div>
		<h1
			class="text-red-800 dark:text-white text-base sm:text-2xl cursor-pointer grow-0 text-center px-2"
			@click="home"
		>{{ moduleName }}</h1>
		<div class="flex basis-32 justify-end items-center grow shrink-0 gap-buttons">
			<LoadingSpinner
				v-if="globalProcessingState"
				class="self-center grow-0"
			/>
			<div class="grow"></div>
			<slot name="header-right"></slot>
		</div>
	</div>
</template>

<style scoped>
@import "@45drives/houston-common-css/src/index.css";
</style>
