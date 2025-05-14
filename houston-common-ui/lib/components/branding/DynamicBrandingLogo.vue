<template>
    <img :src="logo" :alt="`${division} logo`" class="max-h-12 w-auto" v-if="logo" />
</template>


<script setup lang="ts">
import { computed } from 'vue';
import {
    base_logo,
    enterprise_logo,
    homelab_logo,
    pro_logo,
    base_logo_dark,
    enterprise_logo_dark,
    homelab_logo_dark,
    pro_logo_dark
} from '../../img/branding'; // adjust path if needed
import type { DivisionType } from './types';
import { useDarkModeState } from '@/composables';

const props = defineProps<{
    division?: DivisionType;
}>();

const isDarkMode = useDarkModeState();

const logo = computed(() => {
    const dark = isDarkMode.value;

    switch (props.division) {
        case 'enterprise':
            return dark ? enterprise_logo_dark : enterprise_logo;
        case 'homelab':
            return dark ? homelab_logo_dark : homelab_logo;
        case 'professional':
            return dark ? pro_logo_dark : pro_logo;
        case 'default':
        default:
            return dark ? base_logo_dark : base_logo;
    }
});
</script>

<style scoped>
/* Adds a fallback background color to ensure visibility */
/* img {
    background-color: white;
    border-radius: 0.25rem;
} */
</style>