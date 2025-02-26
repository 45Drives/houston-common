<script setup lang="ts">
import {
  ref,
  onMounted,
  defineProps,
  defineModel,
  defineExpose,
  computed,
} from "vue";
import {
  Server,
  ProcessError,
  getServer,
  type Group,
  type LocalGroup,
  HoustonDriver,
} from "@45drives/houston-common-lib";
import { wrapAction } from "@/composables/wrapActions";
import {
  default as SelectMenu,
  type SelectMenuOption,
} from "@/components/SelectMenu.vue";
import { ResultAsync } from "neverthrow";

const _ = HoustonDriver.gettext;

const NOBODY_GID = 65534;
const ROOT_GID = 0;

const props = withDefaults(
  defineProps<{
    server?: ResultAsync<Server, ProcessError>;
    includeSystemGroups?: boolean;
  }>(),
  { server: () => getServer() }
);

const group = defineModel<Group>();

const groups = ref<LocalGroup[]>([]);
const loadGroups = wrapAction(() =>
  props.server
    .andThen((s) => s.getLocalGroups())
    .map(
      (allGroups) =>
        (groups.value = props.includeSystemGroups
          ? allGroups
          : allGroups.filter(
              (g) => g.gid >= 1000 || [ROOT_GID, NOBODY_GID].includes(g.gid)
            ))
    )
);

const groupOptions = computed<SelectMenuOption<LocalGroup>[]>(() =>
  groups.value.map(
    (group) =>
      ({
        label: `${group.name} (${group.gid})`,
        value: group,
        hoverText: `${group.name} (GID=${group.gid})`,
      }) as SelectMenuOption<LocalGroup>
  )
);

onMounted(loadGroups);

defineExpose({
  refresh: loadGroups,
});
</script>

<template>
  <SelectMenu v-model="group" :options="groupOptions" />
</template>
