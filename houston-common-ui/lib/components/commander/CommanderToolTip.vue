<template>
    <span ref="triggerRef" class="relative inline-block">
        <InformationCircleIcon class="w-5 h-5 text-muted cursor-pointer hover:text-default" @click="toggleCommander"
            @mouseenter="() => { toggleCommander(); cancelHideTimeout(); }" @mouseleave="startHideTimeout" />

        <teleport to="body">
            <div v-if="showCommander" ref="popupRef" class="absolute"
                :style="{ top: commanderPosition.top, left: commanderPosition.left }" @mouseenter="cancelHideTimeout"
                @mouseleave="startHideTimeout">
                <CommanderPopup :message="message" :visible="showCommander" @close="showCommander = false"
                    :position="commanderPosition" :arrowOffset="commanderPosition.arrowOffset"
                    :placement="commanderPosition.placement" :width="width" />
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
    if (!isHovering.value) {
        showCommander.value = false;
    }
};

const popupRef = ref<HTMLElement | null>(null);
const isHovering = ref(false); // Tracks whether the mouse is on the icon or popup
const timeoutId = ref<number | null>(null);


// Starts the timeout **only if the mouse is not over the popup**
const startHideTimeout = () => {
    isHovering.value = false; // Mark as not hovering
    timeoutId.value = window.setTimeout(() => {
        closePopup();
    }, 4000);
};

// Cancels the hide timeout if the mouse re-enters
const cancelHideTimeout = () => {
    isHovering.value = true; // Mark as hovering
    if (timeoutId.value) {
        clearTimeout(timeoutId.value);
        timeoutId.value = null;
    }
};

// Opens the popup and positions it
const toggleCommander = async () => {
    document.dispatchEvent(new CustomEvent("closeAllPopups"));
    showCommander.value = true;

    await nextTick();

    if (triggerRef.value) {
        const rect = triggerRef.value.getBoundingClientRect();
        const offset = 10;
        const popupWidth = width;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        const triggerCenterX = rect.left + rect.width / 2;
        let left = triggerCenterX - popupWidth / 2;
        left = Math.max(10, left);
        if (left + popupWidth > viewportWidth - 10) {
            left = viewportWidth - 10 - popupWidth;
        }

        let placement: 'top' | 'bottom' = 'bottom';
        let top = rect.bottom + window.scrollY + offset;
        if (top + 200 > viewportHeight) {
            placement = 'top';
            top = rect.top + window.scrollY - 200 - offset;
            if (top < 10) {
                placement = 'bottom';
                top = rect.bottom + window.scrollY + offset;
            }
        }

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
};

onMounted(() => {
    document.addEventListener("closeAllPopups", () => {
        if (!isHovering.value) showCommander.value = false;
    });
});

onUnmounted(() => {
    document.removeEventListener("closeAllPopups", () => {
        if (!isHovering.value) showCommander.value = false;
    });
});


const handleClickOutside = (event: MouseEvent) => {
    if (triggerRef.value && !triggerRef.value.contains(event.target as Node)) {
        showCommander.value = false;
        document.removeEventListener("click", handleClickOutside);
    }
};
</script>
