<script lang="ts">
export type ConfirmOptions = {
  header: string;
  body: string;
  dangerous?: boolean;
};
</script>

<script setup lang="ts">
import {
  defineProps,
  defineEmits,
  computed,
  ref,
  watchEffect,
  defineExpose,
} from "vue";
import { ResultAsync, okAsync, errAsync } from "neverthrow";
import { type Action } from "@/composables/wrapActions";
import CardContainer from "@/components/CardContainer.vue";
import Modal from "./Modal.vue";
import { ExclamationCircleIcon } from "@heroicons/vue/20/solid";

const _ = cockpit.gettext;

defineProps<{
  clickOutsideCancels?: boolean;
}>();

const emit = defineEmits<{
  (e: "confirm"): void;
  (e: "cancel"): void;
}>();

class Confirmation {
  id: symbol;
  promise: Promise<boolean>;
  resolve!: (value: boolean | PromiseLike<boolean>) => void;
  constructor(
    public header: string,
    public body: string,
    public dangerous: boolean
  ) {
    this.promise = new Promise((r) => {
      this.resolve = r;
    });
    this.id = Symbol();
  }
}

const confirmationStack = ref<Confirmation[]>([]);

const pushConfirmation = (c: Confirmation) => {
  confirmationStack.value = [c, ...confirmationStack.value];
};

const popConfirmation = () => {
  confirmationStack.value = confirmationStack.value.slice(1);
};

const currentConfirmation = computed(() =>
  confirmationStack.value.length > 0 ? confirmationStack.value[0] : undefined
);

const resolveCurrent = (value: boolean) => {
  if (currentConfirmation.value === undefined) {
    return;
  }
  currentConfirmation.value.resolve(value);
  popConfirmation();
};

// stage the modal contents to avoid it going blank on leave
const headerText = ref<string>("");
const bodyText = ref<string>("");
const isDangerous = ref<boolean>(false);
watchEffect(() => {
  if (currentConfirmation.value === undefined) {
    return;
  }
  headerText.value = currentConfirmation.value.header;
  bodyText.value = currentConfirmation.value.body;
  isDangerous.value = currentConfirmation.value.dangerous;
});

const confirm = (options: ConfirmOptions): ResultAsync<boolean, never> => {
  const confirmation = new Confirmation(
    options.header,
    options.body,
    options.dangerous ?? false
  );
  pushConfirmation(confirmation);
  return ResultAsync.fromSafePromise(confirmation.promise);
};

const confirmBeforeAction = (
  options: ConfirmOptions,
  action: Action<any, any, any>
): typeof action => {
  return (
    ...args: Parameters<typeof action>
  ): ReturnType<typeof action> | ResultAsync<null, never> => {
    return confirm(options).andThen((confirmed) => {
      if (!confirmed) {
        return okAsync(null);
      }
      return action(...args);
    });
  };
};

type ValueElseUndefiend<T> = T extends
  | string
  | number
  | boolean
  | symbol
  | object
  ? T
  : undefined;

const assertConfirm = <T,>(
  options: ConfirmOptions,
  resultIfConfirmed?: T
): ResultAsync<ValueElseUndefiend<T>, Error> => {
  return confirm(options).andThen((confirmed) =>
    confirmed
      ? okAsync(resultIfConfirmed as any)
      : errAsync(new Error("Cancelled by user."))
  );
};

defineExpose({
  confirm,
  confirmBeforeAction,
  assertConfirm,
});
</script>

<template>
  <Modal :show="currentConfirmation !== undefined">
    <CardContainer class="sm:min-w-96">
      <template #header>
        {{ headerText }}
      </template>
      <div class="flex flex-row items-center gap-2">
        <ExclamationCircleIcon
          v-if="isDangerous"
          class="size-icon-xl icon-danger shrink-0"
        />
        <div class="grow overflow-x-auto whitespace-pre">
          {{ bodyText }}
        </div>
      </div>
      <template #footer>
        <div class="button-group-row justify-end grow">
          <button class="btn btn-secondary" @click="resolveCurrent(false)">
            {{ _("Cancel") }}
          </button>
          <button
            class="btn"
            :class="isDangerous ? 'btn-danger' : 'btn-primary'"
            @click="resolveCurrent(true)"
          >
            {{ _("Confirm") }}
          </button>
        </div>
      </template>
    </CardContainer>
  </Modal>
</template>
