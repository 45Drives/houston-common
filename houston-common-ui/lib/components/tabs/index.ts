import { ref, watch, type Component, type Ref } from "vue";
export { default as TabSelector } from "./TabSelector.vue";
export { default as TabView } from "./TabView.vue";

export type HoustonAppTabEntrySpec = {
  label: string;
  component: Component;
};

export type HoustonAppTabEntry = HoustonAppTabEntrySpec & {
  key: symbol;
};

export type HoustonAppTabState = {
  entries: HoustonAppTabEntry[];
  index: Ref<number>;
};

export function defineHoustonAppTabState(
  entries: HoustonAppTabEntrySpec[]
): HoustonAppTabState {
  const lastIndex = parseInt(
    cockpit.localStorage.getItem("HoustonHeaderTabIndex") ?? ""
  );
  const index = ref(
    isNaN(lastIndex) ? 0 : Math.min(lastIndex, entries.length - 1)
  );
  watch(index, (newIndex) => {
    cockpit.localStorage.setItem("HoustonHeaderTabIndex", newIndex.toString());
  });
  return {
    entries: entries.map((e) => ({ ...e, key: Symbol() })),
    index,
  };
}
