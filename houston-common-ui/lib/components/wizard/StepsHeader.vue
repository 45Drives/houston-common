<script setup lang="ts">
import { type WizardState } from "./index";
import { CheckIcon } from "@heroicons/vue/20/solid";

const state = defineProps<WizardState>();

const { labels, completedSteps, index } = state;
</script>

<template>
  <ol
    role="list"
    class="divide-y divide-gray-300 rounded-md border border-gray-300 md:flex md:divide-y-0"
  >
    <li v-for="(label, stepIdx) in labels" :key="label" class="relative md:flex md:flex-1">
      <a v-if="completedSteps[stepIdx]" class="group flex w-full items-center">
        <span class="flex items-center px-6 py-4 text-sm font-medium">
          <span
            class="flex size-10 shrink-0 items-center justify-center rounded-full bg-indigo-600 group-hover:bg-indigo-800"
          >
            <CheckIcon class="size-6 text-white" aria-hidden="true" />
          </span>
          <span class="ml-4 text-sm font-medium text-gray-900">{{ label }}</span>
        </span>
      </a>
      <a
        v-else-if="stepIdx === index"
        class="flex items-center px-6 py-4 text-sm font-medium"
        aria-current="step"
      >
        <span
          class="flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-indigo-600"
        >
          <span class="text-indigo-600">{{ stepIdx }}</span>
        </span>
        <span class="ml-4 text-sm font-medium text-indigo-600">{{ label }}</span>
      </a>
      <a v-else @click.prevent="" class="group flex items-center">
        <span class="flex items-center px-6 py-4 text-sm font-medium">
          <span
            class="flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-gray-300 group-hover:border-gray-400"
          >
            <span class="text-gray-500 group-hover:text-gray-900">{{ stepIdx }}</span>
          </span>
          <span class="ml-4 text-sm font-medium text-gray-500 group-hover:text-gray-900">{{
            label
          }}</span>
        </span>
      </a>
      <template v-if="stepIdx !== labels.length - 1">
        <!-- Arrow separator for lg screens and up -->
        <div class="absolute top-0 right-0 hidden h-full w-5 md:block" aria-hidden="true">
          <svg
            class="size-full text-gray-300"
            viewBox="0 0 22 80"
            fill="none"
            preserveAspectRatio="none"
          >
            <path
              d="M0 -2L20 40L0 82"
              vector-effect="non-scaling-stroke"
              stroke="currentcolor"
              stroke-linejoin="round"
            />
          </svg>
        </div>
      </template>
    </li>
  </ol>
</template>
