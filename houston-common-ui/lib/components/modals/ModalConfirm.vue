<script lang="ts">
export type ConfirmOptions = {
  header: string;
  body: string;
  dangerous?: boolean;
  confirmButtonText?: string;
  cancelButtonText?: string;
};
</script>

<script setup lang="ts">
import { defineProps, defineEmits, computed, ref, watchEffect, defineExpose } from "vue";
import { ResultAsync, okAsync, errAsync } from "neverthrow";
import { type Action } from "@/composables/wrapActions";
import CardContainer from "@/components/CardContainer.vue";
import Modal from "./Modal.vue";
import { ExclamationCircleIcon } from "@heroicons/vue/20/solid";
import { CancelledByUser, type ValueElseUndefiend, HoustonDriver } from "@45drives/houston-common-lib";

const _ = HoustonDriver.gettext;

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
    public dangerous: boolean,
    public confirmButtonText: string,
    public cancelButtonText: string
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
const confirmButtonText = ref<string>("");
const cancelButtonText = ref<string>("");
watchEffect(() => {
  if (currentConfirmation.value === undefined) {
    return;
  }
  headerText.value = currentConfirmation.value.header;
  bodyText.value = currentConfirmation.value.body;
  isDangerous.value = currentConfirmation.value.dangerous;
  confirmButtonText.value = currentConfirmation.value.confirmButtonText;
  cancelButtonText.value = currentConfirmation.value.cancelButtonText;
});

const confirm = (options: ConfirmOptions): ResultAsync<boolean, never> => {
  const confirmation = new Confirmation(
    options.header,
    options.body,
    options.dangerous ?? false,
    options.confirmButtonText ?? _("Confirm"),
    options.cancelButtonText ?? _("Cancel")
  );
  pushConfirmation(confirmation);
  return ResultAsync.fromSafePromise(confirmation.promise);
};

const assertConfirm = <T,>(
  options: ConfirmOptions,
  resultIfConfirmed?: T
): ResultAsync<ValueElseUndefiend<T>, CancelledByUser> => {
  return confirm(options).andThen((confirmed) =>
    confirmed ? okAsync(resultIfConfirmed as any) : errAsync(new CancelledByUser(options.header))
  );
};

defineExpose({
  confirm,
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
        <ExclamationCircleIcon v-if="isDangerous" class="size-icon-xl icon-danger shrink-0" />
        <div class="grow overflow-x-auto whitespace-pre-wrap">
          {{ bodyText }}
        </div>
      </div>
      <template #footer>
        <div class="button-group-row justify-end grow">
          <button class="btn btn-secondary" @click="resolveCurrent(false)">
            {{ cancelButtonText }}
          </button>
          <button
            class="btn"
            :class="isDangerous ? 'btn-danger' : 'btn-primary'"
            @click="resolveCurrent(true)"
          >
            {{ confirmButtonText }}
          </button>
        </div>
      </template>
    </CardContainer>
  </Modal>
</template>
