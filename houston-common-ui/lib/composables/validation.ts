import { z } from "zod";
import { fromError as ZodValidationErrorFromError } from "zod-validation-error";
import {
  onMounted,
  onUnmounted,
  ref,
  computed,
  type Ref,
  watchEffect,
  type ComputedRef,
  type WatchStopHandle,
} from "vue";

export type ValidationResultAction = {
  label: string;
  callback: () => void | PromiseLike<void>;
};

export type ValidationResult = (
  | {
      type: "success";
      message?: string;
    }
  | {
      type: "error";
      message: string;
    }
  | {
      type: "warning";
      message: string;
    }
) & {
  actions?: ValidationResultAction[];
};

export type Validator = () => ValidationResult | PromiseLike<ValidationResult>;

export class ValidationScope {
  private validatorResults: Ref<Ref<ValidationResult>[]>;
  private allValidatorsOkay: ComputedRef<boolean>;

  constructor() {
    this.validatorResults = ref([]);
    this.allValidatorsOkay = computed(() =>
      this.validatorResults.value.every((result) => result.value.type !== "error")
    );
  }

  private addValidatorResult(result: Ref<ValidationResult>) {
    this.validatorResults.value = [...this.validatorResults.value, result];
  }

  private removeValidatorResult(result: Ref<ValidationResult>) {
    this.validatorResults.value = this.validatorResults.value.filter((r) => r !== result);
  }

  useValidator(validator: Validator) {
    const validationResult = ref<ValidationResult>({
      type: "success",
    });
    const triggerUpdate = () => {
      const result = validator();
      Promise.resolve(result).then(
        (result) =>
          (validationResult.value = {
            ...result,
            actions: result.actions?.map(({ label, callback }) => ({
              label,
              callback: () => Promise.resolve(callback()).then(() => triggerUpdate()),
            })),
          })
      );
    };
    let stopWatcher: WatchStopHandle;
    onMounted(() => {
      stopWatcher = watchEffect(triggerUpdate);
      this.addValidatorResult(validationResult);
    });
    onUnmounted(() => {
      this.removeValidatorResult(validationResult);
      stopWatcher?.();
    });
    return { validationResult, triggerUpdate };
  }

  useZodValidator<Z extends z.ZodTypeAny = z.ZodNever>(
    schema: Z,
    getter: () => z.infer<Z>,
    scope?: ValidationScope
  ) {
    const validator: Validator = () =>
      schema
        .safeParseAsync(getter())
        .then((result) =>
          result.success
            ? validationSuccess()
            : validationError(ZodValidationErrorFromError(result.error).message)
        );
    return this.useValidator(validator);
  }

  isValid(): boolean {
    return this.allValidatorsOkay.value;
  }
}

export function validationSuccess(actions?: ValidationResultAction[]): ValidationResult {
  return {
    type: "success",
    actions,
  };
}

export function validationWarning(
  message: string,
  actions?: ValidationResultAction[]
): ValidationResult {
  return {
    type: "warning",
    message,
    actions,
  };
}

export function validationError(
  message: string,
  actions?: ValidationResultAction[]
): ValidationResult {
  return {
    type: "error",
    message,
    actions,
  };
}
