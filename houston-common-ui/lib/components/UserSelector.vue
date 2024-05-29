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
  type LocalUser,
  type User,
} from "@45drives/houston-common-lib";
import { wrapAction } from "@/composables/wrapActions";
import {
  default as SelectMenu,
  type SelectMenuOption,
} from "@/components/SelectMenu.vue";
import { ResultAsync } from "neverthrow";

const _ = cockpit.gettext;

const NOBODY_UID = 65534;
const ROOT_UID = 0;

const props = withDefaults(
  defineProps<{
    server?: ResultAsync<Server, ProcessError>;
    includeSystemUsers?: boolean;
  }>(),
  { server: () => getServer() }
);

const user = defineModel<User>();

const users = ref<LocalUser[]>([]);
const loadUsers = wrapAction(() =>
  props.server
    .andThen((s) => s.getLocalUsers())
    .map(
      (allUsers) =>
        (users.value = props.includeSystemUsers
          ? allUsers
          : allUsers.filter(
              (u) => u.uid >= 1000 || [ROOT_UID, NOBODY_UID].includes(u.uid)
            ))
    )
);

const userOptions = computed<SelectMenuOption<LocalUser>[]>(() =>
  users.value.map(
    (user) =>
      ({
        label: `${user.login} (${user.uid})`,
        value: user,
        hoverText: `${user.name || user.login} (UID=${user.uid})`,
      }) as SelectMenuOption<LocalUser>
  )
);

onMounted(loadUsers);

defineExpose({
  refresh: loadUsers,
});
</script>

<template>
  <SelectMenu v-model="user" :options="userOptions" />
</template>
