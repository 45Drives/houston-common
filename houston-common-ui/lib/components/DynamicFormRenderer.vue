<template>
	<div
		:id="uid"
		class="grid grid-cols-[max-content_max-content_1fr] gap-2 items-center text-sm"
	>
		<template
			v-for="input in inputs"
			:key="input.uid"
		>
			<template v-if="input.type === 'radio'">
				<label class="text-sm font-semibold col-span-3">{{ input.label }}</label>
				<template
					v-for="option, optionIndex in input.options"
					:key="`${input.uid}-${optionIndex}`"
				>
					<input
						:id="`${input.uid}-${optionIndex}`"
						class="mx-1"
						:name="input.key"
						type="radio"
						autofocus
						:value="option.value"
						v-model="input.value"
						@change="$emit('change', input)"
						:title="input.title"
					/>
					<label
						class="text-sm font-semibold col-span-2 max-w-[50vw]"
						:for="`${input.uid}-${optionIndex}`"
						:title="input.title"
					>
						{{ option.label }}
					</label>
				</template>
			</template>
			<template v-else-if="input.type === 'checkbox'">
				<label
					:key="input.key"
					class="text-sm font-semibold col-span-2 max-w-[50vw]"
					:for="input.uid"
					:title="input.title"
				>
					{{ input.label }}
				</label>
				<input
					:id="input.uid"
					:key="input.key"
					class="input-checkbox"
					type="checkbox"
					autofocus
					v-model="input.value"
					:true-value="input.values[0]"
					:false-value="input.values[1]"
					@change="$emit('change', input)"
					:title="input.title"
				/>
			</template>
			<template v-else-if="input.type === 'select'">
				<label
					:key="input.key"
					class="text-sm font-semibold col-span-2 max-w-[50vw]"
					:for="input.uid"
					:title="input.title"
				>
					{{ input.label }}
				</label>
				<select
					v-model="input.value"
					:multiple="input.multiple"
					class="input-textlike inline w-fit"
					@change="$emit('change', input)"
				>
					<option
						disabled
						:value="undefined"
						selected
					>{{ input.placeholder }}</option>
					<option
						v-for="option in input.options"
						:key="option.label"
						:title="option.title"
						:value="option.value"
					>{{ option.label }}</option>
				</select>
			</template>
			<template v-else-if="input.type === 'textarea'">
				<label
					:key="input.key"
					class="text-sm font-semibold col-span-3"
					:for="input.uid"
					:title="input.title"
				>
					{{ input.label }}
				</label>
				<textarea
					:id="input.uid"
					:key="input.key"
					class="input-textlike col-span-3 w-full"
					autofocus
					v-model.lazy="input.value"
					:placeholder="input.placeholder"
					@change="$emit('change', input)"
					:title="input.title"
					:rows="input.rows ?? 4"
					style="resize: veritcal;"
				/>
			</template>
			<template v-else>
				<label
					:key="input.key"
					class="text-sm font-semibold col-span-3"
					:for="input.uid"
					:title="input.title"
				>
					{{ input.label }}
				</label>
				<input
					:id="input.uid"
					:key="input.key"
					class="input-textlike col-span-3 w-full"
					:type="input.type"
					autofocus
					v-model.lazy="input.value"
					:placeholder="input.placeholder"
					@change="$emit('change', input)"
					:title="input.title"
					:list="`${input.uid}-dl`"
				/>
				<datalist
					v-if="input.suggestions"
					:id="`${input.uid}-dl`"
				>
					<option
						v-for="choice in input.suggestions(input.value)"
						:key="choice.label"
						:value="choice.value"
					>{{ choice.label }}</option>
				</datalist>
			</template>
			<div
				v-if="input.feedback"
				:key="input.key"
				class="feedback-group col-span-3 !mt-0 mb-2"
			>
				<ExclamationCircleIcon class="size-icon icon-error" />
				<span class="text-sm text-error">{{ input.feedback }}</span>
			</div>
		</template>
		<div
			class="col-span-3 text-sm text-muted"
			v-if="requiredLabelAsterisk && inputs?.some(input => input.required)"
		>
			* Required field
		</div>
	</div>
</template>

<script setup lang="ts">
/**
 * Component to render inputs array from {@link useDynamicFormGeneration} via prop
 */

import { type AnyTemplateReqs } from '../composables/useDynamicFormGeneration';
import { ExclamationCircleIcon } from '@heroicons/vue/20/solid';

type Props = {
	/**
	 * Array of input objects (returned from {@link useDynamicFormGeneration})
	 */
	inputs: AnyTemplateReqs[],
	/**
	 * Unique identifier string (returned from {@link useDynamicFormGeneration})
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

defineEmits<{
	/**
	 * Fired when an input changes value
	 */
	(e: 'change', input: AnyTemplateReqs): void;
}>();
</script>

<style scoped>
@import "@45drives/houston-common-css/src/index.css";
</style>
