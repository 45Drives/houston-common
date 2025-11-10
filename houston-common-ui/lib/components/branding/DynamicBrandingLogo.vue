<template>
    <!-- <img :src="logo" :alt="`${division} logo`" :class="['w-auto', height ? `max-h-${height}` : 'max-h-12']" v-if="logo" /> -->
    <img :src="logo" :alt="`${division} logo`" class="w-auto" :class="{
        'max-h-12': !height || height === 12,
        'max-h-16': height === 16,
        'max-h-20': height === 20,
        'max-h-24': height === 24,
    }" v-if="logo" />

</template>


<script setup lang="ts">
import { computed } from 'vue';
import {
    base_logo,
    enterprise_logo,
    homelab_logo,
    pro_logo,
    studio_logo,
    base_logo_dark,
    enterprise_logo_dark,
    homelab_logo_dark,
    pro_logo_dark,
    studio_logo_dark
} from '../../img/branding'; // adjust path if needed
import type { DivisionType } from './types';
import { useDarkModeState } from '@/composables';

const props = defineProps<{
    division?: DivisionType;
    height?: number;
}>();

const isDarkMode = useDarkModeState();

const logo = computed(() => {
    if (isDarkMode.value) {
        switch (props.division) {
            case 'enterprise': return enterprise_logo_dark;
            case 'homelab': return homelab_logo_dark;
            case 'studio': return studio_logo_dark;
            case 'professional': return pro_logo_dark;
            default: return base_logo_dark;
        }
    } else {
        switch (props.division) {
            case 'enterprise': return enterprise_logo;
            case 'homelab': return homelab_logo;
            case 'studio': return studio_logo;
            case 'professional': return pro_logo;
            default: return base_logo;
        }
    }
});
</script>

<style scoped></style>