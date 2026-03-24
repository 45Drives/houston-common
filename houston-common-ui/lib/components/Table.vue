<!--
Copyright (C) 2022 Josh Boudreau <jboudreau@45drives.com>

This file is part of Cockpit File Sharing.

Cockpit File Sharing is free software: you can redistribute it and/or modify it under the terms
of the GNU General Public License as published by the Free Software Foundation, either version 3
of the License, or (at your option) any later version.

Cockpit File Sharing is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License along with Cockpit File Sharing.
If not, see <https://www.gnu.org/licenses/>. 
-->

<script setup lang="ts">
withDefaults(
  defineProps<{
    emptyText?: string;
    stickyHeaders?: boolean;
    noScroll?: boolean;
    refined?: boolean;
  }>(),
  {
    emptyText: "Nothing to show.",
    stickyHeaders: false,
    noScroll: false,
    refined: false,
  }
);
</script>

<template>
  <div :class="[
    refined
      ? 'bg-accent rounded-lg border border-neutral-200 dark:border-neutral-700'
      : 'bg-accent',
    noScroll ? '' : 'overflow-hidden'
  ]">
    <div v-if="$slots.header" :class="[
      'text-sm font-semibold flex flex-row',
      refined ? 'py-2.5 px-4 lg:px-5' : 'py-3 px-4 lg:px-6'
    ]">
      <div class="grow">
        <slot name="header"></slot>
      </div>
      <div
        :class="{ 'overflow-y-scroll': !noScroll }"
        :style="{ 'scrollbar-gutter': noScroll ? 'auto' : 'stable' }"
      ></div>
    </div>
    <div
      class="w-full"
      :class="{ 'overflow-y-scroll overflow-x-auto': !noScroll }"
      :style="{ 'scrollbar-gutter': noScroll ? 'auto' : 'stable' }"
    >
      <table :class="['w-full divide-y divide-default', refined ? 'houston-table houston-table-refined' : 'houston-table']">
        <thead :class="{ 'use-sticky': stickyHeaders }">
          <slot name="thead" />
        </thead>
        <tbody class="bg-default w-full">
          <slot name="tbody">
            <tr>
              <td colspan="100%" class="text-center align-middle text-muted text-sm">
                {{ emptyText }}
              </td>
            </tr>
          </slot>
        </tbody>
      </table>
    </div>
    <div v-if="$slots.footer" :class="refined ? 'table-summary-footer' : 'py-2 px-4 text-sm'">
      <slot name="footer"></slot>
    </div>
  </div>
</template>

<style>
@import "@45drives/houston-common-css/src/index.css";

table.houston-table thead.use-sticky tr th {
  @apply sticky z-10 top-0;
}

/* Default (classic) table styles */
table.houston-table th,
table.houston-table td {
  @apply py-2 px-4 lg:px-6 whitespace-nowrap text-sm;
}

table.houston-table th:not(.text-right):not(.text-center),
table.houston-table td:not(.text-right):not(.text-center) {
  @apply text-left;
}

table.houston-table th {
  @apply bg-accent font-semibold;
}

table.houston-table tr {
  @apply even:bg-accent;
}

/* Refined variant — tighter, lighter, with hover */
table.houston-table-refined th,
table.houston-table-refined td {
  @apply py-1.5 px-3 lg:px-4;
}

table.houston-table-refined th {
  @apply bg-neutral-50 dark:bg-neutral-850 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 border-b border-neutral-200 dark:border-neutral-700;
}

table.houston-table-refined tr {
  @apply even:bg-neutral-50/50 dark:even:bg-neutral-800/50;
}

table.houston-table-refined tbody tr {
  @apply hover:bg-slate-600/5 dark:hover:bg-slate-400/5 transition-colors;
}
</style>
