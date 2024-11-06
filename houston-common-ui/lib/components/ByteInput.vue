<script setup lang="ts">
import { StringToIntCaster } from '@45drives/houston-common-lib';
import { InputField, SelectMenu, type SelectMenuOption } from '@/components';
import { Maybe } from 'monet';
import { computed, type ComputedRef, ref, watchEffect } from 'vue';

const _ = cockpit.gettext;

const bytes = defineModel<number | undefined>();

const props = withDefaults(defineProps<{
  siUnits: boolean,

}>(),
{
  siUnits: false
}
)

const quotaUnitBase = computed(() => props.siUnits ? 1000 : 1024);
const quotaUnitExponentOptions: ComputedRef<SelectMenuOption<number>[]> = computed(() => [
  { label: "MiB", value: 2 },
  { label: "GiB", value: 3 },
  { label: "TiB", value: 4 },
].map(({label, value}) => ({label: props.siUnits ? label.replace('i', '') : label, value})));

const quotaUnitExponentRange = computed(() => quotaUnitExponentOptions.value
  .map(({ value }) => value)
  .reduce(
    ({ min, max }, exp) => {
      return {
        min: Math.min(min, exp),
        max: Math.max(max, exp),
      };
    },
    {
      min: Infinity,
      max: -Infinity,
    }
  )
);

const quotaUnitExponentInput = ref(3); // default to GiB

const quotaInputMultiplier = computed(() => quotaUnitBase.value ** quotaUnitExponentInput.value);

const quotaInput = computed<string>({
  get: () =>
    Maybe.fromUndefined(bytes.value)
      .map((bytesValue) => bytesValue / quotaInputMultiplier.value)
      .cata(
        () => "",
        (quota) => quota.toString(10)
      ),
  set: (newQuota) =>
    Maybe.fromEmpty(newQuota)
      .flatMap(StringToIntCaster(10))
      .map((q) => Math.round(q * quotaInputMultiplier.value))
      .cata(
        () => bytes.value = undefined,
        (value) => bytes.value = value,
      )
});
</script>

<template>
    <div class="min-w-40 inline-flex flex-row space-x-1">
        <InputField v-model="quotaInput" type="number"/>
        <SelectMenu v-model="quotaUnitExponentInput" :options="quotaUnitExponentOptions" />
    </div>
</template>
