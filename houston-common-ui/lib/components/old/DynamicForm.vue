<!-- TODO: optional hint popup -->

<template>
	<DynamicFormRenderer
		:inputs="inputs_"
		:uid="uid_"
		:requiredLabelAsterisk="requiredLabelAsterisk"
	/>
</template>

<script lang="ts" setup>
import { watch } from 'vue';
import DynamicFormRenderer from './DynamicFormRenderer.vue';
import { useDynamicFormGeneration, type DynamicFormInputsSchema } from '../../composables/useDynamicFormGeneration';

type Props = {
	/**
	 * Inputs
	 */
	inputs: DynamicFormInputsSchema,
	/**
	 * Unique identifier string
	 */
	uid: string,
	/**
	 * Put asterisk after any inputs with property `required: true`
	 */
	requiredLabelAsterisk?: boolean,
};

const props = withDefaults(defineProps<Props>(), {
	inputs: [] as any,
	uid: '',
	requiredLabelAsterisk: false,
});

const {
	uid_,
	inputs_,
	valid_,
	addTextInput,
	addTextarea,
	addNumberInput,
	addCheckboxInput,
	addAdvancedCheckboxInput,
	addRadioInput,
	addSelect,
	addMultiSelect,
	addFromSchema,
	removeInput,
	reset,
	getResult,
	validate,
	setDefaults,
	resetValidation,
	focusFirstInput,
} = useDynamicFormGeneration({ uid: props.uid ?? "df", requiredLabelAsterisk: props.requiredLabelAsterisk });

watch(() => props.inputs, (inputs) => {
	if (!inputs)
		return;
	addFromSchema(inputs, false);
}, { immediate: true });

defineExpose({
	isValid: valid_,
	addTextInput,
	addTextarea,
	addNumberInput,
	addCheckboxInput,
	addAdvancedCheckboxInput,
	addRadioInput,
	addSelect,
	addMultiSelect,
	removeInput,
	reset,
	getResult,
	validate,
	setDefaults,
	resetValidation,
	focusFirstInput,
});
</script>

<style scoped>
@import "houston-common-css/src/index.css";
</style>
