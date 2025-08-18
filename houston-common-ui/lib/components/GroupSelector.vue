<script setup lang="ts">
import { ref, onMounted, defineProps, defineModel, defineExpose, computed, watch } from "vue";
import {
  Server,
  ProcessError,
  getServer,
  type Group,
  type LocalGroup,
  type DomainGroup,
  HoustonDriver,
} from "@45drives/houston-common-lib";
import { wrapAction } from "@/composables/wrapActions";
import { default as SelectMenu, type SelectMenuOption } from "@/components/SelectMenu.vue";
import { ResultAsync } from "neverthrow";

type AnyGroup = Group | LocalGroup | DomainGroup;

const _ = HoustonDriver.gettext;

const NOBODY_GID = 65534;
const ROOT_GID = 0;

const props = withDefaults(
  defineProps<{
    server?: ResultAsync<Server, ProcessError>;
    includeSystemGroups?: boolean;
    includeDomainGroups?: boolean;
  }>(),
  { server: () => getServer() }
);

const group = defineModel<Group>();

const groups = ref<(LocalGroup | DomainGroup)[]>([]);
const loadGroups = wrapAction((invalidateCache?: boolean) =>
  props.server
    .andThen((s) => {
      const localGroups = s
        .getLocalGroups(!invalidateCache)
        .map((allGroups) =>
          props.includeSystemGroups
            ? allGroups
            : allGroups.filter((g) => g.gid >= 1000 || [ROOT_GID, NOBODY_GID].includes(g.gid))
        );

      if (props.includeDomainGroups) {
        const domainGroups = s.getDomainGroups(!invalidateCache);
        return ResultAsync.combine([localGroups, domainGroups]).map((nested) => nested.flat());
      }

      return localGroups;
    })
    .map((loadedGroups) => (groups.value = loadedGroups))
);

const groupOptions = computed<SelectMenuOption<LocalGroup | DomainGroup>[]>(() =>
  groups.value.map(
    (group) =>
      ({
        label: `${group.name} (${group.gid})` + (group.domain ? " *" : ""),
        value: group,
        hoverText: `${group.name} (GID=${group.gid})` + (group.domain ? " (AD/domain group)" : ""),
      }) as SelectMenuOption<LocalGroup | DomainGroup>
  )
);

watch(
  props,
  () => {
    loadGroups(true);
  },
  { immediate: true }
);

defineExpose({
  refresh: loadGroups,
});

function optionKey(g: AnyGroup) {
  return g.gid;
}

</script>

<template>
  <SelectMenu v-model="group" :options="groupOptions" :optionKey="(optionKey as any)" />
</template>
