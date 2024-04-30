import { useDynamicFormGeneration } from './useDynamicFormGeneration';

import type {
	DynamicFormResult,
	ITemplateReqsTextlike,
	ITemplateReqsTextarea,
	ITemplateReqsNumberlike,
	ITemplateReqsCheckbox,
	ITemplateReqsRadio,
	ITemplateReqsSelect,
	ITemplateReqsSelectMultiple,
	InputParams,
	DynamicFormInputsSchema,
	UseDynamicFormGenerationOptions,
} from './useDynamicFormGeneration';

/**
 * @public
 */
export type FormGeneratorMethods = Omit<ReturnType<typeof useDynamicFormGeneration>, "uid_" | "inputs_" | "valid_" | "getResult" | "focusFirstInput" | "validate">;

/**
 * @public
 */
export class DynamicFormPromise extends Promise<DynamicFormResult | null> {
	private formGeneratorMethods: FormGeneratorMethods;
	/**
	 * The promise returned from useDynamicFormGenerationPromise.ask with chainable methods to add/remove inputs to the form
	 * @param executor - Executor from Promise that gets resolve, reject
	 * @param formGeneratorMethods - Object with methods from useDynamicFormGeneration
	 */
	public constructor(
		executor: (resolve: (result: DynamicFormResult | null) => void, reject?: (reason: any) => void) => void,
		formGeneratorMethods: FormGeneratorMethods
	) {
		super(executor);
		this.formGeneratorMethods = formGeneratorMethods;
	}

	/**
	 * {@inheritDoc UseDynamicFormGenerationComposition.addTextInput}
	 */
	public addTextInput(opts: InputParams<ITemplateReqsTextlike>) {
		this.formGeneratorMethods.addTextInput(opts);
		return this;
	}

	/**
	 * {@inheritDoc UseDynamicFormGenerationComposition.addTextarea}
	 */
	public addTextarea(opts: InputParams<ITemplateReqsTextarea>) {
		this.formGeneratorMethods.addTextarea(opts);
		return this;
	}

	/**
	 * {@inheritDoc UseDynamicFormGenerationComposition.addNumberInput}
	 */
	public addNumberInput(opts: InputParams<ITemplateReqsNumberlike>) {
		this.formGeneratorMethods.addNumberInput(opts);
		return this;
	}

	/**
	 * {@inheritDoc UseDynamicFormGenerationComposition.addCheckboxInput}
	 */
	public addCheckboxInput(opts: Omit<InputParams<ITemplateReqsCheckbox<[true, false]>>, "values">) {
		this.formGeneratorMethods.addCheckboxInput(opts);
		return this;
	}

	/**
	 * {@inheritDoc UseDynamicFormGenerationComposition.addAdvancedCheckboxInput}
	 */
	public addAdvancedCheckboxInput<T extends [any, any] = [any, any]>(opts: InputParams<ITemplateReqsCheckbox<T>>) {
		this.formGeneratorMethods.addAdvancedCheckboxInput(opts);
		return this;
	}

	/**
	 * {@inheritDoc UseDynamicFormGenerationComposition.addRadioInput}
	 */
	public addRadioInput<T extends any>(opts: InputParams<ITemplateReqsRadio<T>>) {
		this.formGeneratorMethods.addRadioInput(opts);
		return this;
	}

	/**
	 * {@inheritDoc UseDynamicFormGenerationComposition.addSelect}
	 */
	public addSelect<T extends any>(opts: InputParams<ITemplateReqsSelect<T>>) {
		this.formGeneratorMethods.addSelect(opts);
		return this;
	}

	/**
	 * {@inheritDoc UseDynamicFormGenerationComposition.addMultiSelect}
	 */
	public addMultiSelect<T extends any>(opts: InputParams<ITemplateReqsSelectMultiple<T>>) {
		this.formGeneratorMethods.addMultiSelect(opts);
		return this;
	}

	/**
	 * {@inheritDoc UseDynamicFormGenerationComposition.addFromSchema}
	 */
	public addFromSchema(schema: DynamicFormInputsSchema, append: boolean = false) {
		this.formGeneratorMethods.addFromSchema(schema, append);
		return this;
	}

	/**
	 * {@inheritDoc UseDynamicFormGenerationComposition.removeInput}
	 */
	public removeInput(...args: Parameters<FormGeneratorMethods["removeInput"]>) {
		this.formGeneratorMethods.removeInput(...args);
		return this;
	}

	/**
	 * {@inheritDoc UseDynamicFormGenerationComposition.reset}
	 */
	public reset(...args: Parameters<FormGeneratorMethods["reset"]>) {
		this.formGeneratorMethods.reset(...args);
		return this;
	}

	/**
	 * {@inheritDoc UseDynamicFormGenerationComposition.setDefaults}
	 */
	public setDefaults(...args: Parameters<FormGeneratorMethods["setDefaults"]>) {
		this.formGeneratorMethods.setDefaults(...args);
		return this;
	}

	/**
	 * {@inheritDoc UseDynamicFormGenerationComposition.resetValidation}
	 */
	public resetValidation(...args: Parameters<FormGeneratorMethods["resetValidation"]>) {
		this.formGeneratorMethods.resetValidation(...args);
		return this;
	}
}

/**
 * @public
 * Hook in dynamic form generation with promise, mostly used for {@link ModalPrompt}  
 * Use the {@link DynamicFormRenderer} component to render the inputs_ array  
 * Handles validation automatically with watchers
 * @example
 * ```js
 * // in template
 * <DynamicFormRenderer :inputs="inputs_" :uid="uid_" />
 * <button type="button" v-on:click="resolvePromise()">Submit</button>
 * // in component setup
 * const {
 * 	uid_,
 * 	inputs_,
 * 	valid_,
 * 	ask: generatorAsk,
 * 	resolvePromise,
 * 	cancelPromise,
 * 	focusFirstInput,
 * 	validate,
 * 	reset: generatorReset,
 * } = useDynamicFormGenerationPromise();
 * ```
 * @param options - Options for composable: {@link UseDynamicFormGenerationOptions}
 * @returns
 */
export function useDynamicFormGenerationPromise(options?: UseDynamicFormGenerationOptions) {
	const {
		uid_,
		inputs_,
		valid_,
		getResult,
		validate,
		focusFirstInput,
		...formGeneratorMethods
	} = useDynamicFormGeneration(options);

	let resolver_ = (value: DynamicFormResult | null) => { };

	/**
	 * Create the form promise that resolves with user input (or null if cancelled)
	 * @returns Promise that resolves when {@link resolvePromise} or {@link cancelPromise} are called
	 */
	const ask = () => {
		formGeneratorMethods.reset();
		return new DynamicFormPromise(
			(resolve, reject) => {
				resolver_ = resolve;
			},
			formGeneratorMethods
		);
	}

	/**
	 * Call this to resolve the promise from ask, e.g. when a 'confirm' button is clicked
	 * @returns Result of user input, either object with input values or null if cancelled/invalid
	 */
	const resolvePromise = () => {
		const result = getResult();
		resolver_(result);
		return result;
	}

	/**
	 * Call this to cancel the promise, e.g. when a 'cancel' button is clicked
	 */
	const cancelPromise = () => {
		resolver_(null);
	}

	return {
		uid_,
		inputs_,
		valid_,
		ask,
		resolvePromise,
		cancelPromise,
		focusFirstInput,
		validate,
		reset: formGeneratorMethods.reset,
	}
}
