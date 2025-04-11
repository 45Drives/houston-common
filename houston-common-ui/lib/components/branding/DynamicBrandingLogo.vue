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
} from '../../img/branding'; // adjust path if needed
import type { DivisionType } from './types';

const props = defineProps<{
    division?: DivisionType;
}>();

const logo = computed(() => {
    switch (props.division) {
        case 'default':
            return base_logo;
        case 'enterprise':
            return enterprise_logo;
        case 'homelab':
            return homelab_logo;
        case 'professional':
            return pro_logo;
        default:
            return base_logo;
    }
});
</script>

<style scoped>
/* Adds a fallback background color to ensure visibility */
img {
    background-color: white;
    border-radius: 0.25rem;
}
</style>