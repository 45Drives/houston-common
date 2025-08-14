import { type InjectionKey, computed, ref, provide, inject, type Ref, type ComputedRef, type WritableComputedRef, type Component } from "vue";


export type WizardState = {
  labels: ComputedRef<string[]>;
  index: WritableComputedRef<number>;
  currentComponent: ComputedRef<Component>;
  completedSteps: Ref<boolean[]>;
  data: Record<string, any>;
  determineNextStep: (data: Record<string, any>, currentIndex: number) => number;
  determinePreviousStep: (currentIndex: number) => number;
};

export { default as Wizard } from "./Wizard.vue";

export interface WizardStep {
  label: string;
  component: any;
  nextStep?: (data: Record<string, any>) => number; // Function for branching logic
  previousStepIndex?: number; // Function for branching logic
}

// Function to generate a unique injection key for each wizard
const wizardKeys = new Map<string, InjectionKey<WizardState>>();

export function createWizardInjectionKey(id: string): InjectionKey<WizardState> {
  if (!wizardKeys.has(id)) {
    wizardKeys.set(id, Symbol(id) as InjectionKey<WizardState>);
  }
  return wizardKeys.get(id)!;
}

export const WizardStateInjectionKey = Symbol() as InjectionKey<WizardState>;

// Updated wizard definition with branching logic
export function defineWizardSteps(
  steps: WizardStep[],
  key: InjectionKey<WizardState>
): WizardState {
  const index_ = ref(0);
  const index = computed({
    get: () => Math.min(Math.max(0, index_.value), Math.max(0, steps.length - 1)),
    set: (value) => {
      index_.value = Math.min(Math.max(0, value), Math.max(0, steps.length - 1));
    },
  });
  const currentComponent = computed(() => steps[index.value]!.component);

  const determineNextStep = (data: any, currentIndex: number) => {
    const step = steps[currentIndex];

    const nextStepIndex = step.nextStep ? step.nextStep(data) : currentIndex + 1;
    const nextStep = steps[nextStepIndex];
    if (nextStep) {

      nextStep.previousStepIndex = currentIndex;
    }

    return nextStepIndex;
  };

  const determinePreviousStep = (currentIndex: number) => {
    const step = steps[currentIndex];
    if (step.previousStepIndex) {
      return step.previousStepIndex;
    }
    return Math.max(0, currentIndex - 1);
  };

  const state: WizardState = {
    labels: computed(() => steps.map(({ label }) => label)),
    index,
    currentComponent,
    completedSteps: ref(steps.map(() => false)),
    data: {},
    determineNextStep,
    determinePreviousStep,
  };

  provide(key, state);

  return state;
}

export function useWizardSteps(id: string) {
  const state = inject(createWizardInjectionKey(id));
  if (!state) {
    throw new Error("defineWizardSteps must be called before useWizardSteps!");
  }

  const reset = () => {
    state.index.value = 0;
  };

  const refresh = () => {
    state.index.value = state.index.value;
  };

  const nextStep = () => {
    state.index.value = state.determineNextStep(state.data, state.index.value);
  };

  const prevStep = (targetStep?: number) => {
    if (targetStep !== undefined) {
      state.index.value = targetStep; // Go to specific step
    } else {
      state.index.value = state.determinePreviousStep(state.index.value)
    }
  };
  

  const setStep = (newIndex: number) => {
    state.index.value = newIndex;
  };

  const completeCurrentStep = (gotoNext: boolean = true, data: Record<string, any> = {}) => {
    state.completedSteps.value[state.index.value] = true;
    state.data = data; // Store data for decision-making
    if (gotoNext) {
      nextStep();
    }
  };

  const unCompleteCurrentStep = () => {
    console.log("Uncompleting ", state.index.value);
    state.completedSteps.value[state.index.value] = false;
  }

  return {
    steps: state.labels,
    activeStepIndex: state.index,
    wizardData: state.data,
    nextStep,
    prevStep,
    reset,
    refresh,
    setStep,
    completeCurrentStep,
    unCompleteCurrentStep,
  };
}
