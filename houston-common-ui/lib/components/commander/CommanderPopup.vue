<template>
    <teleport to="body">
        <div v-if="visible" id="commander-popup"
            class="absolute flex items-center text-left bg-slate-800/95 text-white p-6 min-h-[100px] rounded-md shadow-lg user-select-none"
            :style="{ width: width + 'px', top: position.top,left: position.left }">

            <div class="absolute w-0 h-0 border-l-[12px] border-r-[12px] border-transparent" :class="{
                'border-b-[12px] border-b-slate-800/95 -top-[12px]': position.placement === 'bottom',
                'border-t-[12px] border-t-slate-800/95 -bottom-[12px]': position.placement === 'top'
            }" :style="{
                left: `${position.arrowOffset}px`,
                transform: 'translateX(-50%)'
            }" />

            <img :src="houstonPortrait" alt="Houston Portrait"
                class="w-24 h-24 mr-4 rounded-lg object-cover flex-shrink-0" />
            <div class="flex flex-col">
                <p class="font-mono text-sm text-muted"><i>Houston Commander says:</i></p>
                <p class="font-mono text-lg flex-1 overflow-auto max-h-[300px] pr-4 whitespace-normal break-words"
                    v-html="displayedText">
                </p>
            </div>
            <button
                class="absolute top-2 right-2 text-white text-xl bg-transparent border-none cursor-pointer font-mono hover:text-red-500"
                @click="emit('close')">
                <XMarkIcon class="w-8 h-8 pl-2" />
            </button>
        </div>
    </teleport>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted, nextTick } from "vue";
import { XMarkIcon } from "@heroicons/vue/20/solid";
import { houstonPortrait } from "@/img";

interface CommanderPopupProps {
    message: string;
    visible: boolean;
    width?: number;
    position: {
        top: string;
        left: string;
        placement: 'top' | 'bottom';
        arrowOffset: number;
    };
}

const props = defineProps<CommanderPopupProps>();
const emit = defineEmits(["close"]);
const width = props.width || 700;

const displayedText = ref("");
const isTyping = ref(false);
const arrowOffset = ref(props.position.arrowOffset);

watch(() => props.position.arrowOffset, (newOffset) => {
    arrowOffset.value = newOffset;
});

const popupPosition = ref(props.position);

watch(() => props.position, (newPos) => {
    popupPosition.value = newPos; 
}, { immediate: true });


// Typewriter effect for message
const typeMessage = async (newMessage: string) => {
    isTyping.value = true;
    displayedText.value = "";

    let i = 0;
    while (i < newMessage.length) {
        // 1) If an anchor tag starts here...
        if (newMessage.substring(i).startsWith("<a")) {
            // 2) Find the closing </a>
            const anchorCloseIndex = newMessage.indexOf("</a>", i);

            // If we find a valid </a>, insert the whole anchor at once
            if (anchorCloseIndex !== -1) {
                const anchorSubstring = newMessage.substring(i, anchorCloseIndex + 4);
                displayedText.value += anchorSubstring;
                i = anchorCloseIndex + 4;
                continue;
            }
            // If there's a malformed anchor, just fall through to the normal typing below
        }

        // 3) If it's a newline, convert it to <br/> and skip the type delay for that 'character'
        if (newMessage[i] === "\n") {
            displayedText.value += "<br/>";
        } else {
            // 4) Otherwise, type the character and add a small delay
            displayedText.value += newMessage[i];
            await new Promise((resolve) => setTimeout(resolve, 20));
        }

        i++;
    }

    isTyping.value = false;
};

// Click outside to close
const handleClickOutside = (event: MouseEvent) => {
    if (props.visible) {
        const dialogueBox = document.getElementById("commander-popup");

        // If the clicked element is NOT inside the dialogue box, close it
        if (dialogueBox && !dialogueBox.contains(event.target as Node)) {
            emit("close");
        }
    }
};

// Watch both `visible` and `message` changes
watch([() => props.visible, () => props.message], async ([newVisible, newMessage]) => {
    if (newVisible) {
        displayedText.value = ""; // Reset text before displaying
        await nextTick(); // Ensure DOM updates before typing starts
        typeMessage(newMessage);

        // Add click event listener after a short delay to prevent immediate closing
        setTimeout(() => document.addEventListener("click", handleClickOutside), 100);
    } else {
        document.removeEventListener("click", handleClickOutside);
    }
}, { immediate: true });

onUnmounted(() => {
    document.removeEventListener("click", handleClickOutside);
});
</script>