import {
  ref,
  watch,
  watchEffect,
  type Component,
  type Ref,
  computed,
  type ComputedRef,
  type WritableComputedRef,
} from "vue";
export { default as TabSelector } from "./TabSelector.vue";
export { default as TabView } from "./TabView.vue";

export type HoustonAppTabEntry = {
  label: string;
  component: Component;
};

export type HoustonAppTabEntrySpec = HoustonAppTabEntry; // compat

export type HoustonAppTabState = {
  labels: ComputedRef<string[]>;
  index: WritableComputedRef<number>;
  currentComponent: ComputedRef<Component | undefined>;
};

export function defineHoustonAppTabState(
  entries: HoustonAppTabEntry[] | ComputedRef<HoustonAppTabEntry[]>
): HoustonAppTabState {
  const entries_ = Array.isArray(entries) ? computed(() => entries) : entries;
  const index_ = ref(parseInt(cockpit.localStorage.getItem("HoustonHeaderTabIndex") ?? "") || 0);
  const index = computed({
    get: () => Math.min(Math.max(0, index_.value), Math.max(0, entries_.value.length - 1)),
    set: (value) => {
      index_.value = Math.min(Math.max(0, value), Math.max(0, entries_.value.length - 1));
      cockpit.localStorage.setItem("HoustonHeaderTabIndex", index_.value.toString());
    },
  });
  const currentComponent = computed(() => entries_.value[index.value]?.component);

  return {
    labels: computed(() => entries_.value.map(({ label }) => label)),
    index,
    currentComponent,
  };
}
