<template>
    <div class="bg-white inline-flex items-center justify-center p-2 rounded">
        <img :src="logo" :alt="`${division} logo`" class="max-h-12 w-auto" v-if="logo" />
    </div>
</template>


<script setup lang="ts">
import { computed } from 'vue';
import {
    base_logo,
    enterprise_logo,
    homelab_logo,
    pro_logo,
} from '../../img/branding'; // adjust path if needed

const props = defineProps<{
    division: 'enterprise' | 'homelab' | 'professional';
}>();

const logo = computed(() => {
    switch (props.division) {
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
/* Optional styling */
</style>
