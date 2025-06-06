<template>
    <div>
        <teleport to="body">
            <div v-if="props.visible" id="commander-popup"
                class="z-50 absolute flex items-start text-left bg-slate-800/95 text-white p-6 min-h-[100px] rounded-md shadow-lg user-select-none"
                :style="{ width: props.width + 'px', top: props.position.top, left: props.position.left }">
                <div class="absolute w-0 h-0 border-l-[12px] border-r-[12px] border-transparent" :class="{
                    'border-b-[12px] border-b-slate-800/95 -top-[12px]': props.placement === 'bottom',
                    'border-t-[12px] border-t-slate-800/95 -bottom-[12px]': props.placement === 'top'
                }" :style="{
                left: `${props.arrowOffset}px`,
                transform: 'translateX(-50%)'
            }" />

                <img :src="houstonPortrait" alt="Houston Portrait"
                    class="w-24 h-24 mr-4 rounded-lg object-cover flex-shrink-0" />

                <div class="flex flex-col">
                    <p class="font-mono text-sm text-muted"><i>Houston Commander says:</i></p>
                    <p class="font-mono text-lg flex-1 overflow-auto max-h-[300px] pr-4 whitespace-normal break-words"
                        v-html="displayedText" />
                </div>

                <button
                    class="absolute top-2 right-2 text-white text-xl bg-transparent border-none cursor-pointer font-mono hover:text-red-500"
                    @click="emit('close')">
                    <XMarkIcon class="w-8 h-8 pl-2" />
                </button>
            </div>
        </teleport>
    </div>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted, nextTick } from 'vue';
import { XMarkIcon } from '@heroicons/vue/20/solid';
import { houstonPortrait } from '@/img';

interface CommanderPopupProps {
    message: string;
    visible: boolean;
    width?: number;
    arrowOffset: number;
    placement: 'top' | 'bottom';
    position: {
        top: string;
        left: string;
    };
}

const props = defineProps<CommanderPopupProps>();
const emit = defineEmits(['close']);

const displayedText = ref('');
const isTyping = ref(false);

// Typewriter effect
const typeMessage = async (newMessage: string) => {
    isTyping.value = true;
    displayedText.value = '';

    let i = 0;
    while (i < newMessage.length) {
        if (newMessage.substring(i).startsWith('<a')) {
            const anchorCloseIndex = newMessage.indexOf('</a>', i);
            if (anchorCloseIndex !== -1) {
                displayedText.value += newMessage.substring(i, anchorCloseIndex + 4);
                i = anchorCloseIndex + 4;
                continue;
            }
        }

        if (newMessage[i] === '\n') {
            displayedText.value += '<br/>';
        } else {
            displayedText.value += newMessage[i];
            await new Promise(resolve => setTimeout(resolve, 10));
        }

        i++;
    }

    isTyping.value = false;
};

// Outside click handler
const handleClickOutside = (event: MouseEvent) => {
    const box = document.getElementById('commander-popup');
    if (props.visible && box && !box.contains(event.target as Node)) {
        emit('close');
    }
};

// React to visibility + message
watch(
    [() => props.visible, () => props.message],
    async ([visible, message]) => {
        if (visible) {
            displayedText.value = '';
            await nextTick();
            typeMessage(message!);
            setTimeout(() => document.addEventListener('click', handleClickOutside), 100);
        } else {
            document.removeEventListener('click', handleClickOutside);
        }
    },
    { immediate: true }
);

onUnmounted(() => {
    document.removeEventListener('click', handleClickOutside);
});
</script>
