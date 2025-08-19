<script setup lang="ts">
import { ref, onMounted, defineProps, defineModel, defineExpose, computed, watch } from "vue";
import {
  Server,
  ProcessError,
  getServer,
  type LocalUser,
  type User,
  HoustonDriver,
  type DomainUser,
} from "@45drives/houston-common-lib";
import { wrapAction } from "@/composables/wrapActions";
import { default as SelectMenu, type SelectMenuOption } from "@/components/SelectMenu.vue";
import { ResultAsync } from "neverthrow";
import { reportError } from "@/components/NotificationView.vue";

type AnyUser = User | LocalUser | DomainUser;

const _ = HoustonDriver.gettext;

const NOBODY_UID = 65534;
const ROOT_UID = 0;

const props = withDefaults(
  defineProps<{
    server?: ResultAsync<Server, ProcessError>;
    includeSystemUsers?: boolean;
    includeDomainUsers?: boolean;
  }>(),
  { server: () => getServer() }
);

const user = defineModel<AnyUser>();

const users = ref<(LocalUser | DomainUser)[]>([]);
const loadUsers = wrapAction((invalidateCache?: boolean) =>
  props.server
    .andThen((s) => {
      const localUsers = s
        .getLocalUsers(!invalidateCache)
        .map((allUsers) =>
          props.includeSystemUsers
            ? allUsers
            : allUsers.filter((u) => u.uid >= 1000 || [ROOT_UID, NOBODY_UID].includes(u.uid))
        );

      if (props.includeDomainUsers) {
        const domainUsers = s.getDomainUsers(!invalidateCache).mapErr(reportError);
        return ResultAsync.combine([localUsers, domainUsers]).map((nested) => nested.flat());
      }

      return localUsers;
    })
    .map((loadedUsers) => (users.value = loadedUsers))
);

function userToSelectOption(user: AnyUser): SelectMenuOption<AnyUser> {
  const login = user.login ?? "<unknown user>";
  return {
    label: `${login} (${user.uid})` + (user.domain ? " *" : ""),
    value: user,
    hoverText:
      `${"name" in user ? user.name || login : login} (UID=${user.uid})` +
      (user.domain ? " (AD/domain user)" : ""),
  };
}

onMounted(() => loadUsers());

watch(
  () => props.includeSystemUsers,
  () => {
    loadUsers(true);
  }
);

watch(
  () => props.includeDomainUsers,
  () => {
    loadUsers(true);
  }
);

defineExpose({
  refresh: loadUsers,
});

function optionKey(u: AnyUser) {
  return u.uid;
}
</script>

<template>
  <SelectMenu
    v-model="user"
    :values="users"
    :valueToOption="userToSelectOption"
    :optionKey="optionKey as any"
    placeholder="Select a user"
  />
</template>
