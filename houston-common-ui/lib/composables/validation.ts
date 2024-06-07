import { z } from "zod";
import { fromError as ZodValidationErrorFromError } from "zod-validation-error";
import {
  onBeforeMount,
  onBeforeUnmount,
  onMounted,
  onUnmounted,
  ref,
  computed,
  type Ref,
  watchEffect,
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

export type ValidationScope = Ref<Ref<ValidationResult>[]>;

const validationScopeStack = ref<ValidationScope[]>([ref([])]);

const pushValidationScope = (scope: ValidationScope) => {
  validationScopeStack.value = [...validationScopeStack.value, scope];
};
const removeValidationScope = (scope: ValidationScope) => {
  validationScopeStack.value = validationScopeStack.value.filter(
    (s) => s !== scope
  );
};

const getCurrentValidationScope = () =>
  validationScopeStack.value[validationScopeStack.value.length - 1];

export function useValidationScope() {
  const scope: ValidationScope = ref([]);
  onBeforeMount(() => {
    pushValidationScope(scope);
  });
  onUnmounted(() => {
    removeValidationScope(scope);
  });
  const scopeValid = computed<boolean>(() =>
    scope.value.every((v) => v.value.type !== "error")
  );
  return { scope, scopeValid };
}

export function useValidator(validator: Validator, scope?: ValidationScope) {
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
            callback: () =>
              Promise.resolve(callback()).then(() => triggerUpdate()),
          })),
        })
    );
  };
  watchEffect(triggerUpdate);
  onMounted(() => {
    scope ??= getCurrentValidationScope();
    scope.value = [...scope.value, validationResult];
  });
  onBeforeUnmount(() => {
    scope ??= getCurrentValidationScope();
    scope.value = scope.value.filter((r) => r !== validationResult);
  });
  return { validationResult, triggerUpdate };
}

export function useZodValidator<Z extends z.ZodTypeAny = z.ZodNever>(
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
  return useValidator(validator, scope);
}

export function validationSuccess(
  actions?: ValidationResultAction[]
): ValidationResult {
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
