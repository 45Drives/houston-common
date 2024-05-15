<template>
	<ModalPopup
		:show="show ?? show_"
		:fullWidth="opts_.fullWidth ?? fullWidth"
		@click-outside="() => { if (opts_.clickOutsideCancels ?? clickOutsideCancels) respond(false); $emit('click-outside') }"
		@after-enter="$emit('after-enter')"
		@after-leave="reset"
	>
		<template #header>
			<!-- Header slot - content appears in h3 tag, overrides headerText passed to ask() -->
			<slot name="header">
				{{ headerText_ }}
			</slot>
		</template>
		<!-- Default slot - overrides bodyText passed to ask() -->
		<slot>
			{{ bodyText_ }}
		</slot>
		<template #footer>
			<!-- Footer slot - content appears in flex row, overrides the cancel and confirm buttons -->
			<slot name="footer">
				<button
					type="button"
					class="btn btn-secondary"
					autofocus
					@click="respond(false)"
				>
					{{ opts_.cancelText ?? cancelText }}
				</button>
				<button
					type="button"
					:class="['btn', (opts_.confirmDangerous ?? confirmDangerous) ? 'btn-danger' : 'btn-primary']"
					autofocus
					:disabled="disabled"
					@click="respond(true)"
				>
					{{ opts_.confirmText ?? confirmText }}
				</button>
			</slot>
		</template>
	</ModalPopup>
</template>

<script lang="ts">
import { ref, defineComponent } from 'vue';
import ModalPopup from './ModalPopup.vue';

/**
 * Override options set through props
 * @public
 */
export interface ModalConfirmOpts {
	/**
	 * Allow modal to grow to fit content instead of squeezing
	 */
	fullWidth?: boolean;
	/**
	 * Allow clicking outside of modal to act as clicking 'Cancel'
	 */
	clickOutsideCancels?: boolean;
	/**
	 * Override cancel button text
	 */
	cancelText?: string;
	/**
	 * Override confirm button text
	 */
	confirmText?: string;
	/**
	 * Make confirm button red
	 */
	confirmDangerous?: boolean;
}

/**
 * Component to get confirmation from user. Like window.confirm(), but stylized.
 * @example
 * in `<template>`:
 * ```html
 * <ModalConfirm ref="modalConfirmRef" />
 * ```
 * in `<script>`:
 * ```typescript
 * import { ref, onMounted } from 'vue';
 * import { ModalConfirm } from '@45drives/cockpit-vue-components';
 * 
 * const modalConfirmRef = ref<InstanceType<typeof ModalConfirm> | null>(null); // ref(null) if plain javascript
 * 
 * onMounted(async () => {
 * 	if (await modalConfirmRef.value?.ask(
 * 			'Warning',
 * 			'Erase all data?',
 * 			{ confirmText: "Yes", cancelText: "No" })) {
 * 		eraseAllData();
 * 	}
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
		 * Allow clicking outside of modal to act as clicking 'Cancel'
		 */
		clickOutsideCancels: Boolean,
		/**
		 * Make confirm button red
		 */
		confirmDangerous: Boolean,
		/**
		 * Override cancel button text
		 */
		cancelText: {
			type: String,
			required: false,
			default: 'Cancel',
		},
		/**
		 * Override confirm button text
		 */
		confirmText: {
			type: String,
			required: false,
			default: 'OK',
		},
		/**
		 * Make it impossible to click 'OK'
		 */
		disabled: Boolean,
		/**
		 * Disable autofocus on cancel button
		 */
		noAutofocus: Boolean,
	},
	setup(props, { emit }) {
		const show_ = ref(false);
		const headerText_ = ref("");
		const bodyText_ = ref("");
		const opts_ = ref<ModalConfirmOpts>({});
		const onReponse_ = ref((_value: boolean) => { });
		/**
		 * Show the modal. Pass content through args or override with slots.
		 * Promise resolves true if 'OK' clicked, false if 'Cancel' or outside modal clicked.
		 * @param headerText - Text to display in modal header
		 * @param bodyText - Text to diplay in modal body
		 */
		const ask = (headerText?: string, bodyText?: string, opts: ModalConfirmOpts = {}): Promise<boolean> => {
			return new Promise(resolve => {
				opts_.value = opts;
				headerText_.value = headerText ?? "";
				bodyText_.value = bodyText ?? "";
				onReponse_.value = resolve;
				show_.value = true;
			});
		};
		/**
		 * @private
		 */
		const respond = (response: boolean) => {
			onReponse_.value(response);
			show_.value = false;
			if (response)
				emit('confirm');
			else
				emit('cancel');
		}
		/**
		 * @private
		 */
		const reset = () => {
			headerText_.value = "";
			bodyText_.value = "";
			opts_.value = {};
			onReponse_.value = () => { };
			emit('after-leave');
		}
		return {
			show_,
			headerText_,
			bodyText_,
			opts_,
			ask,
			respond,
			reset,
		}
	},
	components: {
		ModalPopup,
	},
	emits: [
		'cancel',
		'confirm',
		'after-leave',
		'click-outside',
		'after-enter',
	],
});
</script>

<style scoped>
@import "houston-common-css/src/index.css";
</style>
