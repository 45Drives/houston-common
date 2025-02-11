<template>
    <span ref="triggerRef" class="relative inline-block">
        <InformationCircleIcon class="w-5 h-5 text-muted cursor-pointer hover:text-white" @click="toggleCommander"
            @mouseenter="toggleCommander" />

        <teleport to="body">
            <div v-if="showCommander" class="absolute"
                :style="{ top: commanderPosition.top, left: commanderPosition.left }">
                <CommanderPopup :message="message" :portrait="props.portrait" :visible="showCommander"
                    @close="showCommander = false" :position="commanderPosition"
                    :arrow-offset="commanderPosition.arrowOffset" :placement="commanderPosition.placement" 
                    :width="props.width"
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
    portrait: string;
    message: string;
    width: number;
}

const props = defineProps<CommanderToolTipProps>();
const width = props.width || 700;
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

            let left = rect.left + window.scrollX;
            let top = rect.bottom + window.scrollY + offset;
            const triggerCenterX = rect.left + (rect.width / 2);

            // Horizontal positioning
            const rightSpace = viewportWidth - rect.right;
            const leftSpace = rect.left;

            if (rightSpace < popupWidth && leftSpace >= popupWidth) {
                left = rect.left - popupWidth - offset;
            } else if (left + popupWidth > viewportWidth) {
                left = Math.max(10, viewportWidth - popupWidth - offset);
            }

            // Vertical positioning
            let placement: 'top' | 'bottom' = 'bottom';
            if (top + 200 > viewportHeight) {
                // Place above if no space below
                placement = 'top';
                top = rect.top + window.scrollY - 200 - offset;

                // If still overflowing top, push down and revert placement
                if (top < 10) {
                    top = rect.bottom + window.scrollY + offset;
                    placement = 'bottom';
                }
            }

            commanderPosition.value = {
                top: `${Math.max(10, top)}px`,
                left: `${Math.max(10, left)}px`,
                arrowOffset: triggerCenterX - left,
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

