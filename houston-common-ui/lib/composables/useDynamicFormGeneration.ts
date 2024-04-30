import { onUnmounted, ref, watch, type WatchStopHandle, computed, reactive, type Ref, type ComputedRef } from "vue";

/**
 * Callback to validate an input's value.
 * Pseudocode:
 * ```
 * value =>
 * 	if value is invalid:
 * 		return "Explanation as to why";
 * 	else
 * 		return true;
 * ```
 * @public
 */
export type DynamicFormInputValidator<T> = (value: T) => string | true;

/**
 * @public
 * Base template requirements for an input
 */
export interface ITemplateReqs {
	/**
	 * Unique id for label matching
	 */
	uid: string;
	/**
	 * Key to index output object
	 */
	key: string;
	/**
	 * Text to go in label
	 */
	label: string;
	/**
	 * current value
	 */
	value: unknown;
	/**
	 * Feedback if invalid
	 */
	feedback: string;
	/**
	 * Type prop for input element
	 */
	type: unknown;
	/**
	 * Validation function return string if invalid or true if valid
	 */
	validate?: unknown;
	/**
	 * Optional mouseover text for label/input
	 */
	title?: string;
	/**
	 * Whether or not the input is valid
	 */
	valid: boolean;
	/**
	 * Handle to stop validator watcher
	 */
	watchStopHandle?: WatchStopHandle;
	/**
	 * Default value of input
	 */
	defaultValue?: unknown;
	/**
	 * Whether or not field is required
	 */
	required?: boolean;
}

/**
 * @public
 * Requirements for rendering a text-like input
 */
export interface ITemplateReqsTextlike extends ITemplateReqs {
	type: "text" | "search" | "url" | "tel" | "email" | "password";
	/**
	 * Maximum length in characters
	 */
	maxLength?: number;
	/**
	 * Minumum length in characters
	 */
	minLength?: number;
	/**
	 * Placeholder text for input
	 */
	placeholder?: string;
	value: string;
	defaultValue?: string;
	validate?: DynamicFormInputValidator<string>;
	/**
	 * Hook returning list of suggestions (creates datalist)
	 * @param value - Current value of input
	 */
	suggestions?: (value: string) => { label: string, value: string; }[];
}

/**
 * @public
 * Requirements for rendering a textarea
 */
export interface ITemplateReqsTextarea extends ITemplateReqs {
	type: "textarea";
	/**
	 * Maximum length in characters
	 */
	maxLength?: number;
	/**
	 * Minumum length in characters
	 */
	minLength?: number;
	/**
	 * Placeholder text for input
	 */
	placeholder?: string;
	rows?: number;
	value: string;
	defaultValue?: string;
	validate?: DynamicFormInputValidator<string>;
}

/**
 * @public
 * Requirements for rendering a number-like input
 */
export interface ITemplateReqsNumberlike extends ITemplateReqs {
	type: "number" | "date" | "month" | "week" | "time" | "datetime-local" | "range";
	/**
	 * Maximum value
	 */
	max?: number;
	/**
	 * Minimum value
	 */
	min?: number;
	/**
	 * Increment/decrement step
	 */
	step?: number;
	/**
	 * Placeholder text for input
	 */
	placeholder?: string;
	value: string;
	defaultValue?: string;
	validate?: DynamicFormInputValidator<string>;
	/**
	 * Hook returning list of suggestions (creates datalist)
	 * @param value - Current value of input
	 */
	suggestions?: (value: string) => { label: string, value: string; }[];
}

/**
 * @public
 * Requirements for rendering a checkbox input
 */
export interface ITemplateReqsCheckbox<Tuple extends [any, any]> extends ITemplateReqs {
	type: "checkbox";
	/**
	 * [\<true value\>, \<false value\>]
	 */
	values: Tuple;
	value: Tuple[0] | Tuple[1];
	defaultValue?: Tuple[0] | Tuple[1];
	validate?: DynamicFormInputValidator<Tuple[0] | Tuple[1]>;
}

/**
 * @public
 * Option for radio group
 */
export interface IRadioOption<T> {
	/**
	 * this option's value
	 */
	value: T;
	/**
	 * Text to go in label
	 */
	label: string;
	/**
	 * Optional mouseover text for label/input
	 */
	title?: string;
}

/**
 * @public
 * Requirements for rendering a series of radio inputs
 */
export interface ITemplateReqsRadio<T> extends ITemplateReqs {
	type: "radio";
	/**
	 * Array of radio button choices (min length 1)
	 */
	options: [IRadioOption<T>, ...IRadioOption<T>[]];
	value: T | undefined;
	defaultValue?: T | undefined;
	validate?: DynamicFormInputValidator<T | undefined>;
}

/**
 * @public
 * Requirements for rendering a select dropdown
 */
export interface ITemplateReqsSelect<T> extends ITemplateReqs {
	type: "select";
	/**
	 * Array of select options (min length 1)
	 */
	options: [IRadioOption<T>, ...IRadioOption<T>[]];
	/**
	 * Required placeholder text for unselected state
	 */
	placeholder: string;
	/**
	 * Allow selecting multiple values
	 */
	multiple?: false;
	value: T | undefined;
	defaultValue?: T | undefined;
	validate?: DynamicFormInputValidator<T | undefined>;
}

/**
 * @public
 * Requirements for rendering a multi-select dropdown
 */
export interface ITemplateReqsSelectMultiple<T> extends ITemplateReqs {
	type: "select";
	/**
	 * Array of select options (min length 1)
	 */
	options: [IRadioOption<T>, ...IRadioOption<T>[]];
	/**
	 * Required placeholder text for unselected state
	 */
	placeholder: string;
	/**
	 * Allow selecting multiple values
	 */
	multiple: true;
	value: T[];
	defaultValue?: T[];
	validate?: DynamicFormInputValidator<T[]>;
}

/**
 * @public
 */
export type AnyTemplateReqs = ITemplateReqsTextlike | ITemplateReqsTextarea | ITemplateReqsCheckbox<[any, any]> | ITemplateReqsNumberlike | ITemplateReqsRadio<any> | ITemplateReqsSelect<any> | ITemplateReqsSelectMultiple<any>;

/**
 * @public
 * Create function parameters from template requirements
 * All TemplateReqs props except uid, value, and feedback; add optional defaultValue, make type optional
 */
export type InputParams<TemplateReqs extends ITemplateReqs> =
	Omit<TemplateReqs, "uid" | "value" | "feedback" | "type" | "valid" | "watchStopHandle"> & { type?: TemplateReqs["type"]; };

/**
 * @public
 * Create prop schema from template requirements
 * All TemplateReqs props except uid, value, feedback, and key; add optional defaultValue
 */
export type InputPropSchema<TemplateReqs extends ITemplateReqs> =
	Omit<TemplateReqs, "uid" | "value" | "feedback" | "key" | "valid" | "watchStopHandle">;

/**
 * Schema for setting inputs through prop or batch adding
 * @example
 * ```js
 * const inputs: DynamicFormInputsSchema = {
 * 	fname: {
 * 		label: "First Name",
 * 		type: "text",
 * 	},
 * 	lname: {
 * 		label: "Last Name",
 * 		type: "text",
 * 		defaultValue: "",
 * 		validate: (value: string) => Boolean(value) || "Cannot be empty", // ensure not empty
 * 	},
 * 	optIn: {
 * 		label: "Opt in to promotional emails",
 * 		type: 'checkbox',
 * 		values: [true, false],
 * 	},
 * 	isCool: {
 * 		type: "checkbox",
 * 		label: "Are you cool?",
 * 		values: ["They're actually cool", "They think they're cool (not cool)"],
 * 	},
 * 	colour: {
 * 		label: "Favourite colour",
 * 		type: "radio",
 * 		options: [
 * 			{ label: "Red", value: "red" },
 * 			{ label: "Blue", value: "blue" },
 * 			{ label: "Green", value: "green" },
 * 		]
 * 	},
 * }
 * ```
 * @public
 */
export interface DynamicFormInputsSchema {
	[key: string]: (InputPropSchema<ITemplateReqsTextlike> |
		InputPropSchema<ITemplateReqsTextarea> |
		InputPropSchema<ITemplateReqsCheckbox<[any, any]>> |
		InputPropSchema<ITemplateReqsNumberlike> |
		InputPropSchema<ITemplateReqsRadio<any>> |
		InputPropSchema<ITemplateReqsSelect<any>> |
		InputPropSchema<ITemplateReqsSelectMultiple<any>>);
}

/**
 * Shape of form input result if submitted
 * @public
 */
export interface DynamicFormResult {
	[key: string]: any;
}

/**
 * Options for {@link useDynamicFormGeneration}
 * @public
 */
export interface UseDynamicFormGenerationOptions {
	/**
	 * Unique identifier string to avoid \<input\>.id and \<label\>.for property collisions
	 */
	uid?: string;
	/**
	 * Put asterisk after any inputs with property `required: true`
	 */
	requiredLabelAsterisk?: boolean;
}

/**
 * Interface of return value for {@link useDynamicFormGeneration}
 * @public
 */
export interface UseDynamicFormGenerationComposition {
	uid_: Ref<string>;
	inputs_: Ref<AnyTemplateReqs[]>;
	valid_: ComputedRef<boolean>;
	/**
	 * Add a text-like input with type "text" | "search" | "url" | "tel" | "email" | "password"
	 * @param opts - Options for input {@link InputParams}, {@link ITemplateReqsTextlike}
	 */
	addTextInput(opts: InputParams<ITemplateReqsTextlike>): void;

	/**
	 * Add a textarea input
	 * @param opts - Options for input {@link InputParams}, {@link ITemplateReqsTextarea}
	 */
	addTextarea(opts: InputParams<ITemplateReqsTextarea>): void;

	/**
	 * Add a number-like input with type "number" | "date" | "month" | "week" | "time" | "datetime-local" | "range".  
	 * Value will still be a string.
	 * @param opts - Options for input {@link InputParams}, {@link ITemplateReqsNumberlike}
	 */
	addNumberInput(opts: InputParams<ITemplateReqsNumberlike>): void;

	/**
	 * Add a checkbox input with the value being either true or false
	 * @param opts - Options for input {@link InputParams}, {@link ITemplateReqsCheckbox}
	 */
	addCheckboxInput(opts: Omit<InputParams<ITemplateReqsCheckbox<[true, false]>>, "values">): void;

	/**
	 * Add a checkbox input with the value being anything specified in the `values` tuple
	 * @param opts - Options for input {@link InputParams}, {@link ITemplateReqsCheckbox}
	 */
	addAdvancedCheckboxInput<T extends [any, any] = [any, any]>(opts: InputParams<ITemplateReqsCheckbox<T>>): void;

	/**
	 * Add a group of radio inputs
	 * @param opts - Options for inputs {@link InputParams}, {@link ITemplateReqsRadio}
	 */
	addRadioInput<T extends any>(opts: InputParams<ITemplateReqsRadio<T>>): void;

	/**
	 * Add a dropdown selector
	 * @param opts - Options for inputs {@link InputParams}, {@link ITemplateReqsSelect}
	 */
	addSelect<T extends any>(opts: Omit<InputParams<ITemplateReqsSelect<T>>, "muliple">): void;

	/**
	 * Add a dropdown selector with the ability to select more than one option
	 * @param opts - Options for inputs {@link InputParams}, {@link ITemplateReqsSelectMultiple}
	 */
	addMultiSelect<T extends any>(opts: Omit<InputParams<ITemplateReqsSelectMultiple<T>>, "multiple">): void;


	/**
	 * Add new imputs from JSON object
	 * @param inputSchema - JSON object describing inputs
	 * @param append - Whether or not to keep existing inputs from list before adding new ones, defaults to removing existing inputs
	 */
	addFromSchema(inputSchema: DynamicFormInputsSchema, append: boolean): void;

	/**
	 * Remove an input by key
	 * @param keys - Key(s) of input to remove
	 */
	removeInput(...keys: string[]): void;

	/**
	 * Remove all inputs from form
	 */
	reset(): void;

	/**
	 * Compile result object of form `{ [key: string]: ValueType }` where `ValueType` is `any` for checkbox, radio, and select; or `string` otherwise
	 */
	getResult(): DynamicFormResult | null;

	/**
	 * Check each input of inputs against its validator callback
	 */
	validate(inputs?: AnyTemplateReqs[]): boolean;

	/**
	 * Reset all input fields to their default values, also calls {@link UseDynamicFormGenerationComposition.reset} on same inputs
	 * @param inputs - Optional array of inputs to reset to defaults, defaults to all
	 */
	setDefaults(inputs?: AnyTemplateReqs[]): void;

	/**
	 * Clear all validation errors
	 * @param inputs - Optional array of inputs to reset validation on, defaults to all
	 */
	resetValidation(inputs?: AnyTemplateReqs[]): void;

	/**
	 * Query select the first input of the form and focus it
	 * @returns true if focused, false if couldn't find any inputs
	 */
	focusFirstInput(): boolean;
}

/**
 * @public
 * Hook in dynamic form generation  
 * Use the {@link DynamicFormRenderer} component to render the inputs_ array  
 * Handles validation automatically with watchers
 * @example
 * ```js
 * // in template
 * <DynamicFormRenderer :inputs="inputs_" :uid="uid_" />
 * // in component setup
 * const {
 * 	uid_,
 * 	inputs_,
 * 	valid_,
 * 	addTextInput,
 * 	addTextarea,
 * 	addNumberInput,
 * 	addCheckboxInput,
 * 	addAdvancedCheckboxInput,
 * 	addRadioInput,
 * 	addSelect,
 * 	addMultiSelect,
 * 	addFromSchema,
 * 	removeInput,
 * 	reset,
 * 	getResult,
 * 	validate,
 * 	setDefaults,
 * 	resetValidation,
 * 	focusFirstInput,
 * } = useDynamicFormGeneration();
 * ```
 * @param options - Options for composable: {@link UseDynamicFormGenerationOptions}
 * @returns 
 */
export function useDynamicFormGeneration(options?: UseDynamicFormGenerationOptions): UseDynamicFormGenerationComposition {
	const uid_ = ref(options?.uid || `df${(Math.random() * Date.now()).toString().replace('.', '-')}`);
	const inputs_ = ref<AnyTemplateReqs[]>([]);
	const valid_ = computed(() => inputs_.value.every(input => input.valid));

	/**
	 * @internal
	 * Append inputs to list, and set up watcher to validate
	 * @param input - Input(s) to append
	 */
	function appendInput(...input: AnyTemplateReqs[]) {
		inputs_.value = [...inputs_.value, ...input.map(input => {
			if (options?.requiredLabelAsterisk && input.required) {
				input.label += ' *';
			}
			const rea = reactive(input);
			rea.watchStopHandle = watch(() => rea.value, () => validate([rea]));
			return rea;
		})];
	}

	/**
	 * @internal
	 */
	type InitialValueReqs = {
		type: ITemplateReqsCheckbox<[any, any]>["type"];
		defaultValue?: ITemplateReqsCheckbox<[any, any]>["defaultValue"];
		values: ITemplateReqsCheckbox<[any, any]>["values"];
	} | {
		type: ITemplateReqsRadio<any>["type"];
		defaultValue?: ITemplateReqsRadio<any>["defaultValue"];
	} | {
		type: ITemplateReqsSelect<any>["type"];
		multiple?: ITemplateReqsSelect<any>["multiple"];
		defaultValue?: ITemplateReqsSelect<any>["defaultValue"];
	} | {
		type: ITemplateReqsSelectMultiple<any>["type"];
		multiple: ITemplateReqsSelectMultiple<any>["multiple"];
		defaultValue?: ITemplateReqsSelectMultiple<any>["defaultValue"];
	} | {
		type: (ITemplateReqsNumberlike["type"] | ITemplateReqsTextlike["type"] | ITemplateReqsTextarea["type"]);
		defaultValue?: string;
	};
	/**
	 * @internal
	 */
	function getInitialValue<T extends AnyTemplateReqs>(input: InitialValueReqs): T["value"] {
		return input.type === 'checkbox'
			? (input.defaultValue ?? input.values[0])
			: input.type === 'radio'
				? (input.defaultValue)
				: input.type === 'select'
					? (
						input.multiple
							? (input.defaultValue ?? [])
							: input.defaultValue
					)
					: input.defaultValue ?? "";
	}

	/**
	 * Add a text-like input with type "text" | "search" | "url" | "tel" | "email" | "password"
	 * @param param0 - Options for input {@link InputParams}, {@link ITemplateReqsTextlike}
	 */
	function addTextInput({ key, label, validate = () => true, defaultValue = "", placeholder = "", type = "text", required = false, ...otherOpts }: InputParams<ITemplateReqsTextlike>) {
		const input: ITemplateReqsTextlike = {
			...otherOpts,
			key,
			label,
			type,
			value: getInitialValue({ type, defaultValue }),
			defaultValue,
			placeholder,
			validate,
			feedback: '',
			uid: `${uid_}-${key}`,
			valid: true,
			required,
		};
		appendInput(input);
	}

	/**
	 * Add a textarea input
	 * @param param0 - Options for input {@link InputParams}, {@link ITemplateReqsTextarea}
	 */
	function addTextarea({ key, label, rows = 4, validate = () => true, defaultValue = "", placeholder = "", required = false, ...otherOpts }: InputParams<ITemplateReqsTextarea>) {
		const input: ITemplateReqsTextarea = {
			...otherOpts,
			key,
			label,
			type: "textarea",
			value: getInitialValue<ITemplateReqsTextarea>({ type: "textarea", defaultValue }),
			rows,
			defaultValue,
			placeholder,
			validate,
			feedback: '',
			uid: `${uid_}-${key}`,
			valid: true,
			required,
		};
		appendInput(input);
	}

	/**
	 * Add a number-like input with type "number" | "date" | "month" | "week" | "time" | "datetime-local" | "range".  
	 * Value will still be a string.
	 * @param param0 - Options for input {@link InputParams}, {@link ITemplateReqsNumberlike}
	 */
	function addNumberInput({ key, label, validate = () => true, defaultValue = "", placeholder = "", type = "number", required = false, ...otherOpts }: InputParams<ITemplateReqsNumberlike>) {
		const input: ITemplateReqsNumberlike = {
			...otherOpts,
			key,
			label,
			type,
			value: getInitialValue({ type, defaultValue }),
			defaultValue,
			placeholder,
			validate,
			feedback: '',
			uid: `${uid_}-${key}`,
			valid: true,
		};
		appendInput(input);
	}

	/**
	 * Add a checkbox input with the value being either true or false
	 * @param param0 - Options for input {@link InputParams}, {@link ITemplateReqsCheckbox}
	 */
	function addCheckboxInput({ key, label, defaultValue, required = false, ...otherOpts }: Omit<InputParams<ITemplateReqsCheckbox<[true, false]>>, "values">) {
		addAdvancedCheckboxInput<[true, false]>({ key, label, defaultValue, values: [true, false], required, ...otherOpts });
	}

	/**
	 * Add a checkbox input with the value being anything specified in the `values` tuple
	 * @param param0 - Options for input {@link InputParams}, {@link ITemplateReqsCheckbox}
	 */
	function addAdvancedCheckboxInput<T extends [any, any] = [any, any]>({ key, label, defaultValue, values, required = false, ...otherOpts }: InputParams<ITemplateReqsCheckbox<T>>) {
		const input: ITemplateReqsCheckbox<T> = {
			...otherOpts,
			key,
			label,
			type: 'checkbox',
			value: getInitialValue({ type: 'checkbox', defaultValue, values }),
			values,
			defaultValue,
			feedback: '',
			uid: `${uid_}-${key}`,
			valid: true,
			validate: () => true,
		};
		appendInput(input);
	}

	/**
	 * Add a group of radio inputs
	 * @param param0 - Options for inputs {@link InputParams}, {@link ITemplateReqsRadio}
	 */
	function addRadioInput<T extends any>({ key, label, defaultValue, options, validate = () => true, required = false, ...otherOpts }: InputParams<ITemplateReqsRadio<T>>) {
		const input: ITemplateReqsRadio<T> = {
			...otherOpts,
			key,
			label,
			type: 'radio',
			value: getInitialValue({ type: 'radio', defaultValue }),
			defaultValue,
			options,
			validate,
			feedback: '',
			uid: `${uid_}-${key}`,
			valid: true,
		};
		appendInput(input);
	}

	/**
	 * Add a dropdown selector
	 */
	function addSelect<T extends any>({ key, label, defaultValue, options, placeholder, validate = () => true, required = false, ...otherOpts }: Omit<InputParams<ITemplateReqsSelect<T>>, "muliple">) {
		const input: ITemplateReqsSelect<T> = {
			...otherOpts,
			key,
			label,
			type: 'select',
			value: getInitialValue({ type: 'select', defaultValue }),
			defaultValue,
			options,
			validate,
			multiple: false,
			placeholder,
			feedback: '',
			uid: `${uid_}-${key}`,
			valid: true,
		};
		appendInput(input);
	}

	/**
	 * Add a dropdown selector with the ability to select more than one option
	 */
	function addMultiSelect<T extends any>({ key, label, defaultValue, options, placeholder, validate = () => true, required = false, ...otherOpts }: Omit<InputParams<ITemplateReqsSelectMultiple<T>>, "multiple">) {
		const input: ITemplateReqsSelectMultiple<T> = {
			...otherOpts,
			key,
			label,
			type: 'select',
			value: getInitialValue({ type: 'select', defaultValue, multiple: true }),
			defaultValue,
			options,
			validate,
			multiple: true,
			placeholder,
			feedback: '',
			uid: `${uid_}-${key}`,
			valid: true,
		};
		appendInput(input);
	}


	/**
	 * Add new imputs from JSON object
	 * @param inputSchema - JSON object describing inputs
	 * @param append - Whether or not to keep existing inputs from list before adding new ones, defaults to removing existing inputs
	 */
	function addFromSchema(inputSchema: DynamicFormInputsSchema, append: boolean = false) {
		const newInputs = Object.keys(inputSchema).map(key => {
			const input = inputSchema[key];
			return {
				...input,
				key,
				feedback: '',
				uid: `${uid_}-${key}`,
				valid: true,
				value: getInitialValue(input),
			};
		});
		if (!append)
			reset();
		appendInput(...newInputs);
	}

	/**
	 * Remove an input by key
	 * @param keys - Key(s) of input to remove
	 */
	function removeInput(...keys: string[]) {
		inputs_.value = inputs_.value.filter(input => {
			if (keys.includes(input.key)) {
				input.watchStopHandle?.();
				return false;
			}
			return true;
		});
	}

	/**
	 * Remove all inputs from form
	 */
	function reset() {
		inputs_.value = inputs_.value.filter(input => {
			input.watchStopHandle?.();
			return false;
		});
	};

	/**
	 * Compile result object of form `{ [key: string]: ValueType }` where `ValueType` is `any` for checkbox, radio, and select; or `string` otherwise
	 */
	function getResult(): DynamicFormResult | null {
		validate();
		if (valid_.value && inputs_.value.length) {
			const response: DynamicFormResult = inputs_.value.reduce<DynamicFormResult>((response, input) => {
				response[input.key] = input.value;
				return response;
			}, {});
			return response;
		}
		return null;
	};

	/**
	 * Check each input of inputs against its validator callback
	 */
	function validate(inputs: AnyTemplateReqs[] = inputs_.value) {
		for (const input of inputs) {
			const result = input.validate?.(input.value);
			if (typeof result === 'string') {
				input.feedback = result;
				input.valid = false;
			} else if (input.required && (
				(['checkbox', 'radio', 'select'].includes(input.type) && input.value === undefined) || input.value === ""
			)) {
				input.feedback = "Required";
				input.valid = false;
			} else {
				input.feedback = '';
				input.valid = true;
			}
		}
		return inputs.every(input => input.valid);
	};

	/**
	 * Reset all input fields to their default values, also calls {@link UseDynamicFormGenerationComposition.reset} on same inputs
	 * @param inputs - Optional array of inputs to reset to defaults, defaults to all
	 */
	function setDefaults(inputs: AnyTemplateReqs[] = inputs_.value) {
		for (const input of inputs) {
			input.value = getInitialValue(input);
		}
		resetValidation(inputs);
	}

	/**
	 * Clear all validation errors
	 * @param inputs - Optional array of inputs to reset validation on, defaults to all
	 */
	function resetValidation(inputs: AnyTemplateReqs[] = inputs_.value) {
		for (const input of inputs) {
			input.valid = true;
			input.feedback = '';
		}
	}

	/**
	 * Query select the first input of the form and focus it
	 * @returns true if focused, false if couldn't find any inputs
	 */
	function focusFirstInput() {
		const elem = document.querySelector<HTMLElement>(`#${uid_.value} > input, #${uid_.value} > select`);
		if (!elem)
			return false;
		elem.focus();
		return true;
	}

	onUnmounted(() => {
		reset(); // clear watchers
	});

	return {
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
	};
}
