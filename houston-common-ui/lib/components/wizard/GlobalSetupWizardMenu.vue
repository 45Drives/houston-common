<template>
    <div class="absolute top-4 right-4 z-20">
        <button @click="toggle" class="text-white text-3xl">☰</button>

        <div v-if="show"
            class="absolute right-0 mt-2 w-60 bg-white shadow-lg rounded-lg border p-4 text-left text-black">
            <p class="font-bold text-lg mb-2">Dev Tools</p>

            <div class="mb-2">
                <p class="text-sm font-semibold mb-1">Set Theme:</p>
                <button class="btn w-full mb-1" @click="setTheme('theme-default')">Default</button>
                <button class="btn w-full mb-1" @click="setTheme('theme-homelab')">Homelab</button>
                <button class="btn w-full mb-2" @click="setTheme('theme-professional')">Professional</button>
            </div>

            <button class="btn w-full mb-2" @click="showWizard('storage')">Storage Setup</button>
            <button class="btn w-full mb-2" @click="showWizard('backup')">Backup Setup</button>
            <button class="btn w-full mb-2" @click="showWizard('restore-backup')">Restore Backup</button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { IPCRouter } from '@45drives/houston-common-lib'

const show = ref(false)
const toggle = () => show.value = !show.value

function setTheme(theme: 'theme-default' | 'theme-homelab' | 'theme-professional') {
    const root = document.documentElement
    root.classList.remove('theme-default', 'theme-homelab', 'theme-professional')
    root.classList.add(theme)
}

function showWizard(type: 'storage' | 'backup' | 'restore-backup') {
    IPCRouter.getInstance().send('backend', 'action', `show_${type}_setup_wizard`)
}
</script>

<style scoped>
.btn {
    @apply bg-gray-200 hover:bg-gray-300 p-2 rounded text-sm;
}
</style>
  
