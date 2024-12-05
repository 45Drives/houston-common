import { ref, watch, watchEffect, type Component, type Ref, computed, type ComputedRef } from "vue";
export { default as TabSelector } from "./TabSelector.vue";
export { default as TabView } from "./TabView.vue";

export type HoustonAppTabEntry = {
  label: string;
  component: Component;
};

export type HoustonAppTabEntrySpec = HoustonAppTabEntry; // compat

export type HoustonAppTabState = {
  entries: ComputedRef<HoustonAppTabEntry[]>;
  labels: ComputedRef<string[]>;
  index: Ref<number>;
};

export function defineHoustonAppTabState(
  entries: HoustonAppTabEntry[] | ComputedRef<HoustonAppTabEntry[]>
): HoustonAppTabState {
  const entries_ = Array.isArray(entries) ? computed(() => entries) : entries;
  const index = ref(0);
  const lastIndex = parseInt(cockpit.localStorage.getItem("HoustonHeaderTabIndex") ?? "");
  if (!isNaN(lastIndex)) {
    index.value = lastIndex;
  }
  watch(
    entries_,
    (entries) => {
      index.value = Math.min(Math.max(0, index.value), entries.length - 1);
    },
    { immediate: true }
  );
  watch(index, (newIndex) => {
    cockpit.localStorage.setItem("HoustonHeaderTabIndex", newIndex.toString());
  });
  return {
    entries: entries_,
    labels: computed(() => entries_.value.map(({label}) => label)),
    index,
  };
}
