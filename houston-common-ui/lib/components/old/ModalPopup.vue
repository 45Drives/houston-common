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

<template>
	<Teleport
		to="body"
	>
		<div class="fixed">
			<Transition
				enter-active-class="ease-out duration-500"
				enter-from-class="opacity-0"
				enter-to-class="opacity-100"
				leave-active-class="ease-in duration-500"
				leave-from-class="opacity-100"
				leave-to-class="opacity-0"
			>
				<div
					v-if="show ?? show_"
					class="fixed z-10 inset-0 bg-neutral-500/75 dark:bg-black/50 transition-opacity pointer"
				/>
			</Transition>
			<Transition
				enter-active-class="ease-out duration-300"
				enter-from-class="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-90"
				enter-to-class="opacity-100 translate-y-0 sm:scale-100"
				leave-active-class="ease-in duration-100"
				leave-from-class="opacity-100 translate-y-0 sm:scale-100"
				leave-to-class="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-75"
				@after-leave="reset"
				@after-enter="() => $emit('after-enter')"
			>
				<div
					v-if="show ?? show_"
					v-bind="$attrs"
					class="fixed z-10 inset-0 overflow-hidden flex items-end sm:items-center justify-center px-4 pb-20 sm:p-0"
					@click.self="close(false); $emit('click-outside')"
				>
					<div
						:class="[(opts_.fullWidth ?? fullWidth) ? 'sm:max-w-full' : 'sm:max-w-lg', 'inline-flex flex-col items-stretch overflow-hidden transform transition-all text-left z-10 bg-default text-default']">
						<div class="block w-[512px]" /> <!-- set min width of div -->
						<div class="card flex flex-col items-stretch overflow-hidden">
							<div class="card-header">
								<h3 class="text-header">
									<slot name="header">
										{{ headerText_ }}
									</slot>
								</h3>
							</div>
							<div class="card-body flex flex-row items-center gap-2">
								<slot name="icon" />
								<div class="grow overflow-x-auto whitespace-pre">
									<slot>
										{{ bodyText_ }}
									</slot>
								</div>
							</div>
							<div class="card-footer w-full">
								<div class="button-group-row justify-end overflow-x-auto">
									<slot name="footer">
										<button
											type="button"
											class="btn btn-primary"
											:autofocus="noAutofocus"
											@click="close(true)"
										>
											{{ opts_.confirmText ?? confirmText }}
										</button>
									</slot>
								</div>
							</div>
						</div>
					</div>
				</div>
			</Transition>
		</div>
	</Teleport>
</template>

<script lang="ts">
import {
	ref, defineComponent
} from 'vue';

/**
 * Override options set through props
 * @public
 */
export interface ModalPopupOpts {
	/**
	 * Allow modal to grow to fit content instead of squeezing
	 */
	fullWidth?: boolean;
	/**
	 * Override confirm button text
	 */
	confirmText?: string;
}

/**
 * # Modal Popup component
 * Use for creating a information popup that can be close by user
 * @example
 * ```js
 * // in template
 * <ModalPopup ref="modalPopupRef" />
 * // in setup
 * import { ModalPopup } from '@45drives/cockpit-vue-components';
 * import { onMounted, ref } from 'vue';
 * 
 * const modalPopupRef = ref(null);
 * 
 * onMounted(async () => {
 * 	await modalPopupRef.value?.open("Warning", "This component is top notch!", { confirmText: "I know right?" });
 * 	// do other things
 * });
 * ```
 * @public
 */
export default defineComponent({
	props: {
		/**
		 * Force show modal, default is controlled by ModalPopup.open()
		 */
		show: {
			type: Boolean,
			required: false,
			default: null,
		},
		/**
		 * Allow content to grow to fit content instead of squeezing
		 */
		fullWidth: Boolean,
		/**
		 * Override confirm button text
		 */
		confirmText: {
			type: String,
			required: false,
			default: 'OK',
		},
		/**
		 * Disable autofocus on OK button
		 */
		noAutofocus: Boolean,
	},
	setup(props, { emit, slots, expose }) {
		const show_ = ref(false);
		const headerText_ = ref("");
		const bodyText_ = ref("");
		const opts_ = ref<ModalPopupOpts>({});
		const onClose_ = ref((_value: boolean) => { });
		/**
		 * Show the modal. Pass content through args or override with slots.
		 * Promise resolves true if 'OK' clicked, false if clicked outside modal to close.
		 * @param headerText - Text to display in modal header
		 * @param bodyText - Text to diplay in modal body
		 */
		const open = (headerText?: string, bodyText?: string, opts: ModalPopupOpts = {}): Promise<boolean> => {
			return new Promise((resolve) => {
				opts_.value = opts;
				headerText_.value = headerText ?? "";
				bodyText_.value = bodyText ?? "";
				onClose_.value = resolve;
				show_.value = true;
			});
		};
		/**
		 * @internal
		 */
		const close = (clickedOk: boolean) => {
			onClose_.value(clickedOk);
			show_.value = false;
			emit('close');
		};
		/**
		 * @internal
		 */
		const reset = () => {
			headerText_.value = '';
			bodyText_.value = '';
			opts_.value = {};
			onClose_.value = () => { };
			console.log('after-leave');
			emit('after-leave');
		}
		return {
			show_,
			headerText_,
			bodyText_,
			opts_,
			onClose_,
			open,
			close,
			reset,
		}
	},
	emits: {
		/**
		 * Either OK or outside was clicked, causing modal to close
		 */
		'close': null,
		/**
		 * Triggered after modal is hidden after closing
		 */
		'after-leave': null,
		/**
		 * Triggered when outside of modal was clicked
		 */
		'click-outside': null,
		/**
		 * Triggered after modal is fully visible
		 */
		'after-enter': null,
	},
});
</script>

<style scoped>
@import "@45drives/houston-common-css/src/index.css";
</style>
