import {
  ref,
  watch,
  watchEffect,
  type Component,
  type Ref,
  computed,
  type ComputedRef,
  type WritableComputedRef,
  provide,
  type InjectionKey,
  inject,
} from "vue";
// export { default as TabSelector } from "./TabSelector.vue";
export { default as Wizard } from "./Wizard.vue";

export type WizardStep = {
  label: string;
  component: Component;
};

export type WizardState = {
  labels: ComputedRef<string[]>;
  index: WritableComputedRef<number>;
  currentComponent: ComputedRef<Component>;
  completedSteps: Ref<boolean[]>;
};

export const WizardStateInjectionKey = Symbol() as InjectionKey<WizardState>;

export function defineWizardSteps(steps: WizardStep[]): WizardState {
  // const steps_ = Array.isArray(steps) ? computed(() => steps) : steps;
  const index_ = ref(0);
  const index = computed({
    get: () => Math.min(Math.max(0, index_.value), Math.max(0, steps.length - 1)),
    set: (value) => {
      index_.value = Math.min(Math.max(0, value), Math.max(0, steps.length - 1));
    },
  });
  const currentComponent = computed(() => steps[index.value]!.component);

  const state = {
    labels: computed(() => steps.map(({ label }) => label)),
    index,
    currentComponent,
    completedSteps: ref(steps.map(() => false)),
  };

  provide(WizardStateInjectionKey, state);

  return state;
}

export function useWizardSteps() {
  const state = inject(WizardStateInjectionKey);
  if (!state) {
    throw new Error("defineWizardSteps not called before useWizardSteps!");
  }
  const reset = () => {
    state.index.value = 0;
  };

  const refresh = () => {
    state.index.value = state.index.value;
  };

  const nextStep = () => {
    state.index.value++;
  };

  const prevStep = () => {
    state.index.value--;
  };

  const setStep = (newIndex: number) => {
    state.index.value = newIndex;
  };

  const completeCurrentStep = (gotoNext: boolean = true) => {
    state.completedSteps.value = state.completedSteps.value.map((isComplete, index) =>
      index === state.index.value ? true : isComplete
    );

    if (gotoNext) {
      nextStep();
    }
  };

  return {
    steps: state.labels,
    activeStepIndex: state.index,
    nextStep,
    prevStep,
    reset,
    refresh,
    setStep,
    completeCurrentStep,
  };
}
