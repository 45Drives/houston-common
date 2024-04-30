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

<template>
	<div class="px-3 sm:px-5 flex items-center bg-plugin-header font-redhat shadow-lg z-10">
		<div class="flex flex-row flex-wrap items-baseline basis-32 grow shrink-0 gap-x-4">
			<div class="flex flex-row items-center my-5">
				<Logo
					:darkMode="darkMode"
					class="h-6"
				/>
			</div>
			<slot />
			<LoadingSpinner
				v-if="showSpinner"
				class="size-icon self-center"
			/>
		</div>
		<h1
			class="text-red-800 dark:text-white text-base sm:text-2xl cursor-pointer grow-0 text-center"
			@click="home"
		>{{ moduleName }}</h1>
		<div class="flex basis-32 justify-end items-center grow shrink-0 gap-buttons">
			<div
				:class="[infoButtonInHeader ? '' : 'md:fixed md:right-2 md:bottom-2 md:z-50 flex flex-row items-stretch']">
				<button @click="showInfo = true">
					<QuestionMarkCircleIcon class="size-icon icon-default" />
				</button>
				<div
					class="overflow-y-auto"
					:style="{ 'scrollbar-gutter': infoNudgeScrollbar ? 'stable' : 'auto' }"
				></div>
			</div>
			<button
				@click="darkMode = !darkMode"
				@click.right.prevent="vape"
			>
				<SunIcon
					v-if="darkMode"
					class="size-icon-lg icon-default"
				/>
				<MoonIcon
					v-else
					class="size-icon-lg icon-default"
				/>
			</button>
		</div>
	</div>
	<ModalPopup
		:show="showInfo"
		:headerText="`${moduleName} ${pluginVersion}`"
		confirmText="Close"
		@close="showInfo = false"
	>
		<div class="flex flex-col">
			<span>
				Created by
				<a
					class="text-link"
					href="https://www.45drives.com/?utm_source=Houston&utm_medium=UI&utm_campaign=OS-Link"
					target="_blank"
				>45Drives</a> for Houston UI (Cockpit)
			</span>
			<a
				class="text-link"
				:href="sourceURL"
				target="_blank"
			>Source Code</a>
			<a
				class="text-link"
				:href="issuesURL"
				target="_blank"
			>Issue Tracker</a>
		</div>
	</ModalPopup>
</template>

<script lang="ts">
import { SunIcon, MoonIcon, QuestionMarkCircleIcon } from "@heroicons/vue/solid";
import { ref, watch, inject, defineComponent, type Ref, type WatchSource } from "vue";
import LoadingSpinner from "./LoadingSpinner.vue";
import ModalPopup from './ModalPopup.vue';
import Logo from './Logo.vue';
import cockpit from 'cockpit';

/**
 * Default header for Cockpit (Houston) plugins
 */
export default defineComponent({
	props: {
		moduleName: String,
		sourceURL: String,
		issuesURL: String,
		showSpinner: Boolean,
		infoButtonInHeader: Boolean,
		infoNudgeScrollbar: Boolean,
		pluginVersion: Number
	},
	setup(props) {
		const showInfo = ref(false);
		const darkMode = inject<Ref<boolean>>('darkModeInjectionKey') ?? ref(false);
		function getTheme() {
			let prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
			let theme = cockpit.localStorage.getItem("houston-color-theme");
			if (theme === null)
				return prefersDark;
			return theme === "dark";
		}
		darkMode.value = getTheme();
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
					const element = elems[i];
					if (element.children.length > 0)
						continue;
					if (element.textContent) {
						element.textContent = makeWide(element.textContent);
						element.style.color = "#ff00fb";
					}
				}
			}, 500);
		}
		watch(() => darkMode.value, (darkMode: WatchSource<boolean>, _oldDarkMode: WatchSource<boolean> | undefined) => {
			cockpit.localStorage.setItem("houston-color-theme", darkMode ? "dark" : "light");
			if (darkMode) {
				document.documentElement.classList.add("dark");
			} else {
				document.documentElement.classList.remove("dark");
			}
		}, { immediate: true });
		cockpit.onvisibilitychange = () => darkMode.value = getTheme();
		return {
			showInfo,
			darkMode,
			home,
			vape,
		};
	},
	components: {
		SunIcon,
		MoonIcon,
		LoadingSpinner,
		ModalPopup,
		QuestionMarkCircleIcon,
		Logo,
	}
});
</script>

<style scoped>
@import "@45drives/houston-common-css/src/index.css";
</style>
