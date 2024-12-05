<script setup lang="ts">
import { ref, defineProps, watchEffect, computed } from "vue";
import HoustonHeader from "@/components/HoustonHeader.vue";
import {
  defineHoustonAppTabState,
  type HoustonAppTabEntry,
  TabSelector,
  TabView,
} from "@/components/tabs";
import NotificationView from "@/components/NotificationView.vue";
import { useGlobalProcessingState } from "@/composables/useGlobalProcessingState";
import { ModalConfirm, Modal } from "@/components/modals";
import { _internal } from "@/composables/globalModalConfirm";
import { QuestionMarkCircleIcon } from "@heroicons/vue/20/solid";
import DisclosureController from "@/components/DisclosureController.vue";
import CardContainer from "@/components/CardContainer.vue";

const props = defineProps<{
  moduleName: string;
  /**
   * set as `:appVersion="__APP_VERSION__"`
   */
  appVersion: string;
  sourceURL?: string;
  issuesURL?: string;
  tabs?: HoustonAppTabEntry[];
}>();

const {
  entries: tabEntries,
  labels: tabLabels,
  index: tabIndex,
} = defineHoustonAppTabState(computed(() => props.tabs ?? []));

const globalProcessingState = useGlobalProcessingState();

const globalModalConfirm = ref<InstanceType<typeof ModalConfirm> | null>(null);

watchEffect(() => {
  if (globalModalConfirm.value !== null) {
    _internal.provideGlobalModalFuncs(globalModalConfirm.value);
  }
});
</script>

<template>
  <div
    class="text-default flex flex-col h-full"
    :class="{ '!cursor-wait': globalProcessingState !== 0 }"
  >
    <HoustonHeader :moduleName="moduleName">
      <template v-slot:header-left v-if="tabs">
        <TabSelector :labels="tabLabels" v-model:index="tabIndex" />
      </template>
    </HoustonHeader>
    <div class="overflow-hidden grow basis-0 flex flex-col items-stretch">
      <div class="bg-well overflow-y-auto grow" style="scrollbar-gutter: stable both-edges">
        <slot>
          <TabView v-if="tabs" :entries="tabEntries" :index="tabIndex" />
        </slot>
      </div>
      <div class="grow-0 overflow-visible relative">
        <div
          class="absolute bottom-0 right-0 h-auto inline-flex flex-row justify-end gap-2 py-2 px-6"
        >
          <slot name="bottomRightButtonIcons"></slot>
          <!-- plugin info popup -->
          <DisclosureController v-slot="{ show, setShow }">
            <button @click="setShow(true)">
              <QuestionMarkCircleIcon class="size-icon icon-default" />
            </button>
            <Modal @clickOutside="setShow(false)" :show="show">
              <CardContainer>
                <template #header>
                  {{ `${moduleName} ${appVersion}` }}
                </template>
                <div class="flex flex-col">
                  <span>
                    Created by
                    <a
                      class="text-link"
                      href="https://www.45drives.com/?utm_source=Houston&utm_medium=UI&utm_campaign=OS-Link"
                      target="_blank"
                    >
                      45Drives
                    </a>
                    for Houston UI (Cockpit)
                  </span>
                  <a v-if="sourceURL" class="text-link" :href="sourceURL" target="_blank"
                    >Source Code</a
                  >
                  <a v-if="issuesURL" class="text-link" :href="issuesURL" target="_blank"
                    >Issue Tracker</a
                  >
                </div>

                <template #footer>
                  <div class="button-group-row justify-end">
                    <button @click="setShow(false)" class="btn btn-primary">Close</button>
                  </div>
                </template>
              </CardContainer>
            </Modal>
          </DisclosureController>
        </div>
      </div>
    </div>
    <NotificationView />
    <ModalConfirm ref="globalModalConfirm" />
  </div>
</template>

<style scoped>
@import "@45drives/houston-common-css/src/index.css";
</style>
