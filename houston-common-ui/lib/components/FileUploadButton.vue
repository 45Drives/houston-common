<script setup lang="ts">
import { ResultAsync } from "neverthrow";
import { CancelledByUser } from "@45drives/houston-common-lib";
import { defineProps, defineEmits, ref, defineExpose } from "vue";

const props = defineProps<{
  accept?: string;
  multiple?: boolean;
  hidden?: boolean;
}>();

const emit = defineEmits<{
  (e: "upload", files: FileList): void;
  (e: "cancel"): void;
}>();

let resolver: ((files: FileList) => void) | undefined = undefined;
let rejecter: ((e: CancelledByUser) => void) | undefined;

const getUpload = (): ResultAsync<FileList, CancelledByUser> => {
  return ResultAsync.fromPromise(
    new Promise((resolve, reject) => {
      resolver = resolve;
      rejecter = reject;
      click();
    }),
    (e) => (e instanceof CancelledByUser ? e : new CancelledByUser())
  );
};

const onChange = ({ target }: Event) => {
  if (
    target instanceof HTMLInputElement &&
    target.files &&
    target.files.length > 0
  ) {
    resolver?.(target.files);
    resolver = undefined;
    rejecter = undefined;
    emit("upload", target.files);
  }
};
const onCancel = () => {
  rejecter?.(new CancelledByUser());
  resolver = undefined;
  rejecter = undefined;
  emit("cancel");
};

const inputRef = ref<HTMLInputElement | null>(null);

const click = () => inputRef.value?.click();

defineExpose({
  click,
  getUpload,
});
</script>

<template>
  <input
    @change="onChange"
    @cancel="onCancel"
    :multiple="multiple"
    :accept="accept"
    type="file"
    ref="inputRef"
    hidden
  />
  <button v-if="!hidden" :class="$attrs.class" @click="click">
    <slot> Upload </slot>
  </button>
</template>
