import { ref, type Component, type Ref } from "vue";
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
  return {
    entries: entries.map(e => ({...e, key: Symbol()})),
    index: ref(0),
  };
}
