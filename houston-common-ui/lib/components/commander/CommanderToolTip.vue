<template>
    <span ref="triggerRef" class="relative inline-block">
        <InformationCircleIcon class="w-5 h-5 text-muted cursor-pointer hover:text-default" @click="toggleCommander"
            @mouseenter="toggleCommander" />

        <teleport to="body">
            <div v-if="showCommander" class="absolute"
                :style="{ top: commanderPosition.top, left: commanderPosition.left }">
                <CommanderPopup :message="message" :visible="showCommander"
                    @close="showCommander = false" :position="commanderPosition"
                    :arrow-offset="commanderPosition.arrowOffset" :placement="commanderPosition.placement" 
                    :width="width"
                    />
            </div>
        </teleport>
    </span>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted } from "vue";
import { InformationCircleIcon } from "@heroicons/vue/20/solid";
import CommanderPopup from "./CommanderPopup.vue";

interface CommanderToolTipProps {
    message: string;
    width?: number;
}

const props = defineProps<CommanderToolTipProps>();
const width = props.width || 500;
const showCommander = ref(false);
const triggerRef = ref<HTMLElement | null>(null);
const commanderPosition = ref({
    top: "0px",
    left: "0px",
    arrowOffset: 0,
    placement: 'bottom' as 'top' | 'bottom'
});

const closePopup = () => {
    showCommander.value = false;
};

// Listen for global "closeAllPopups" event
onMounted(() => {
    document.addEventListener("closeAllPopups", closePopup);
});

onUnmounted(() => {
    document.removeEventListener("closeAllPopups", closePopup);
});
const toggleCommander = async () => {
    document.dispatchEvent(new CustomEvent("closeAllPopups"));
    showCommander.value = !showCommander.value;

    if (showCommander.value) {
        await nextTick();

        if (triggerRef.value) {
            const rect = triggerRef.value.getBoundingClientRect();
            const offset = 10;
            const popupWidth = width;
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;

            // 1. Trigger center
            const triggerCenterX = rect.left + (rect.width / 2);

            // 2. Basic left = center tooltip horizontally
            let left = triggerCenterX - (popupWidth / 2);
            // clamp left within viewport
            left = Math.max(10, left);
            if (left + popupWidth > viewportWidth - 10) {
                left = viewportWidth - 10 - popupWidth;
            }

            // 3. Vertical logic (place below or above)
            let placement: 'top' | 'bottom' = 'bottom';
            let top = rect.bottom + window.scrollY + offset;
            // If there's not enough space below, try top
            if (top + 200 > viewportHeight) {
                placement = 'top';
                top = rect.top + window.scrollY - 200 - offset;
                // if that still overflows above, revert to bottom
                if (top < 10) {
                    placement = 'bottom';
                    top = rect.bottom + window.scrollY + offset;
                }
            }

            // 4. Recalculate the arrow offset with final left
            const rawArrowOffset = triggerCenterX - left;
            const ARROW_MARGIN = 12;
            const maxOffset = popupWidth - ARROW_MARGIN;
            const clampedOffset = Math.min(Math.max(rawArrowOffset, ARROW_MARGIN), maxOffset);

            commanderPosition.value = {
                top: `${Math.max(10, top)}px`,
                left: `${Math.max(10, left)}px`,
                arrowOffset: clampedOffset,
                placement
            };
        }

        setTimeout(() => document.addEventListener("click", handleClickOutside), 100);
    } else {
        document.removeEventListener("click", handleClickOutside);
    }
};


const handleClickOutside = (event: MouseEvent) => {
    if (triggerRef.value && !triggerRef.value.contains(event.target as Node)) {
        showCommander.value = false;
        document.removeEventListener("click", handleClickOutside);
    }
};
</script>

