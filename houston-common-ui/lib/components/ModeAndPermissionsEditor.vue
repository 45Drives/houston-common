<script setup lang="ts">
import { ref, defineProps, watchEffect, defineEmits, defineExpose, computed, watch } from "vue";
import {
  Server,
  ProcessError,
  getServer,
  FileSystemNode,
  Mode,
  Ownership,
  HoustonDriver,
} from "@45drives/houston-common-lib";
import { reportSuccess } from "@/components/NotificationView.vue";
import { wrapActions } from "@/composables/wrapActions";
import InputLabelWrapper from "@/components/InputLabelWrapper.vue";
import { ResultAsync } from "neverthrow";
import UserSelector from "@/components/UserSelector.vue";
import GroupSelector from "@/components/GroupSelector.vue";

const _ = HoustonDriver.gettext;

const props = withDefaults(
  defineProps<{
    path: string;
    server?: ResultAsync<Server, ProcessError>;
    includeSystemUsers?: boolean;
    includeSystemGroups?: boolean;
    includeDomain?: boolean;
  }>(),
  { server: () => getServer() }
);

const emit = defineEmits<{
  (e: "apply"): void;
  (e: "cancel"): void;
}>();

const makeFsNode = (path: string) => props.server.map((s) => new FileSystemNode(s, path));

const mode = ref<Mode>();
const fetchMode = () =>
  makeFsNode(props.path)
    .andThen((node) => node.getMode({ superuser: "try" }))
    .map((m) => (mode.value = m));

const ownership = ref<Ownership>();
const fetchOwner = () =>
  makeFsNode(props.path)
    .andThen((node) => node.getOwnership({ superuser: "try" }))
    .map((o) => (ownership.value = o));

watch(
  () => props.path,
  () => {
    fetchMode();
    fetchOwner();
  },
  { immediate: true }
);

const apply = (path: string, mode: Mode, ownership: Ownership) =>
  makeFsNode(path)
    .andThen((node) => node.setMode(mode, { superuser: "try" }))
    .andThen((node) => node.setOwnership(ownership, { superuser: "try" }))
    .map(() => {
      emit("apply");
      reportSuccess(
        `Updated permissions of ${path}:
mode: ${mode.toString()}
owner: ${ownership.toChownString(true)}.`
      );
    });

const actions = wrapActions({
  fetchMode,
  fetchOwner,
  apply,
});

const cancel = () => {
  actions.fetchMode();
  actions.fetchOwner();
  emit("cancel");
};

defineExpose({
  cancel,
  apply: () =>
    mode.value && ownership.value && actions.apply(props.path, mode.value, ownership.value),
});
</script>

<template>
  <div class="space-y-content">
    <div v-if="mode" class="inline-grid grid-cols-[2fr_1fr_1fr_1fr] gap-2 justify-items-center">
      <label class="justify-self-start block text-sm font-medium"></label>
      <label class="text-label">{{ _("Read") }}</label>
      <label class="text-label">{{ _("Write") }}</label>
      <label class="text-label">{{ _("Execute") }}</label>

      <label class="justify-self-start text-label">{{ _("Owner") }}</label>
      <input type="checkbox" class="input-checkbox" v-model="mode.owner.r" />
      <input type="checkbox" class="input-checkbox" v-model="mode.owner.w" />
      <input type="checkbox" class="input-checkbox" v-model="mode.owner.x" />

      <label class="justify-self-start text-label">{{ _("Group") }}</label>
      <input type="checkbox" class="input-checkbox" v-model="mode.group.r" />
      <input type="checkbox" class="input-checkbox" v-model="mode.group.w" />
      <input type="checkbox" class="input-checkbox" v-model="mode.group.x" />

      <label class="justify-self-start text-label">{{ _("Other") }}</label>
      <input type="checkbox" class="input-checkbox" v-model="mode.other.r" />
      <input type="checkbox" class="input-checkbox" v-model="mode.other.w" />
      <input type="checkbox" class="input-checkbox" v-model="mode.other.x" />

      <label class="justify-self-start text-label">{{ _("Mode") }}</label>
      <span class="col-span-3 font-mono font-medium whitespace-nowrap">{{ mode.toString() }}</span>
    </div>

    <template v-if="ownership">
      <InputLabelWrapper>
        <template #label>
          {{ _("Owner") }}
        </template>
        <UserSelector
          v-model="ownership.user"
          :server="server"
          :includeSystemUsers="includeSystemUsers"
          :includeDomainUsers="includeDomain"
        />
      </InputLabelWrapper>
      <InputLabelWrapper>
        <template #label>
          {{ _("Group") }}
        </template>
        <GroupSelector
          v-model="ownership.group"
          :server="server"
          :includeSystemGroups="includeSystemGroups"
          :includeDomainGroups="includeDomain"
        />
      </InputLabelWrapper>
    </template>
  </div>
</template>

<style scoped>
@import "@45drives/houston-common-css/src/index.css";
</style>
