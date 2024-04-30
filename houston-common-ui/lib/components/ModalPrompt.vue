<template>
	<ModalConfirm
		:show="show ?? show_"
		:clickOutsideCancels="opts_.clickOutsideCancels ?? clickOutsideCancels"
		:confirmDangerous="opts_.confirmDangerous ?? confirmDangerous"
		:cancelText="opts_.cancelText ?? cancelText"
		:confirmText="opts_.confirmText ?? confirmText"
		:fullWidth="opts_.fullWidth ?? fullWidth"
		:disabled="!valid_"
		noAutofocus
		@cancel="cancel"
		@confirm="confirm"
		@after-leave="reset"
		@after-enter="focusFirstInput()"
		@click-outside="$emit('click-outside')"
	>
		<template #header>
			<slot name="header">
				{{ headerText_ }}
			</slot>
		</template>
		<DynamicFormRenderer
			:inputs="inputs_"
			:uid="uid_"
			:requiredLabelAsterisk="opts_.requiredLabelAsterisk ?? requiredLabelAsterisk"
		/>
	</ModalConfirm>
</template>

<script lang="ts" setup>
import { ref, defineExpose } from 'vue';
import ModalConfirm from './ModalConfirm.vue';
// import { DynamicFormResult } from '../composables/useDynamicFormGeneration';
import { useDynamicFormGenerationPromise, DynamicFormPromise } from '../composables/useDynamicFormGenerationPromise';
import DynamicFormRenderer from './DynamicFormRenderer.vue';

/**
 * Override options set through props
 * @public
 */
export interface IPromptOpts {
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
	/**
	 * Put asterisk after any inputs with property `required: true`
	 */
	requiredLabelAsterisk?: boolean;
}

const props = defineProps({
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
	 * Put asterisk after any inputs with property `required: true`
	 */
	requiredLabelAsterisk: Boolean,
});

const show_ = ref(false);
const headerText_ = ref("");
const opts_ = ref<IPromptOpts>({});

const {
	uid_,
	inputs_,
	valid_,
	ask: generatorAsk,
	resolvePromise,
	cancelPromise,
	focusFirstInput,
	validate,
	reset: generatorReset,
} = useDynamicFormGenerationPromise({ requiredLabelAsterisk: props.requiredLabelAsterisk });

/**
 * Prompt user for input, returning promise that resolves with provided values
 * in an object indexed by {@link PromptInput#key}, or null if the dialog was cancelled.
 * 
 * @example
 * ```
 * ModalPromptRef.ask("What is your name?")
 * 	.addTextInput({
 * 		key: 'fname', label: 'First name', placeholder: 'Jane',
 * 		validate: (val: string) => !val ? 'Cannot be empty' : true
 * 	})
 * 	.addTextInput({
 * 		key: 'lname', label: 'Last name', placeholder: 'Doe',
 * 		validate: (val: string) => !val ? 'Cannot be empty' : true
 * 	})
 * 	.then(response => {
 * 		if (response)
 * 			console.log(`Hello, ${response.fname} ${response.lname}!`);
 * 		else
 * 			console.log('Dialog was cancelled');
 * 	});
 * ```
 * 
 * @param headerText - Text to display in popup header
 * @param opts - Options for prompt popup
 * @public
 */
const ask = (headerText?: string, opts: IPromptOpts = {}): DynamicFormPromise => {
	opts_.value = opts;
	headerText_.value = headerText ?? "";
	show_.value = true;
	return generatorAsk();
};

const confirm = () => {
	validate();
	if (!valid_.value)
		return;
	const response = resolvePromise();
	show_.value = false;
	emit('confirm', response);
};

const cancel = () => {
	cancelPromise();
	show_.value = false;
	emit('cancel');
};

const reset = () => {
	headerText_.value = "";
	opts_.value = {};
	generatorReset();
	emit('after-leave');
};

defineExpose({
	isValid: valid_,
	ask,
	cancel,
	focusFirstInput,
});

const emit = defineEmits([
	'confirm',
	'cancel',
	'after-leave',
	'click-outside',
]);
</script>

<style scoped>
@import "@45drives/houston-common-css/src/index.css";
</style>
