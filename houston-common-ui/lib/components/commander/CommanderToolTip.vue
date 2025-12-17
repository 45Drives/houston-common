<template>
    <span ref="triggerRef" class="relative inline-block">
        <InformationCircleIcon class="w-5 h-5 text-muted cursor-pointer hover:text-default" @click="toggleCommander"
            @mouseenter="toggleCommander" />

        <teleport to="body">
            <div v-if="showCommander" ref="popupRef" class="fixed z-50 pointer-events-auto"
                :style="{ top: commanderPosition.top, left: commanderPosition.left }">
                <CommanderPopup :message="message" :visible="showCommander" @close="showCommander = false"
                    :arrowOffset="commanderPosition.arrowOffset" :placement="side(commanderPosition.placement)"
                    :width="width" />
            </div>
        </teleport>
    </span>
</template>


<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted, type Ref } from "vue";
import { InformationCircleIcon } from "@heroicons/vue/20/solid";
import { computePosition, offset, flip, shift, arrow, type Placement } from '@floating-ui/dom';
import CommanderPopup from "./CommanderPopup.vue";

const side = (p: Placement): "top" | "bottom" | "left" | "right" =>
    (p.split("-")[0] as any);

interface CommanderToolTipProps {
    message: string;
    width?: number;
    placement?: 'top' | 'bottom' | 'left' | 'right';
    strictPlacement?: boolean;
}

const props = defineProps<CommanderToolTipProps>();
const width = props.width || 500;
const showCommander = ref(false);
const triggerRef = ref<HTMLElement | null>(null);

const commanderPosition = ref<{
    top: string;
    left: string;
    arrowOffset: number;
    placement: Placement;
}>({
    top: "0px",
    left: "0px",
    arrowOffset: 0,
    placement: (props.placement ?? "bottom") as Placement,
});

const arrowRef = ref<HTMLElement | null>(null);
const strictPlacement = props.strictPlacement ?? false;

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
    if (!triggerRef.value || !popupRef.value) return;

    arrowRef.value = popupRef.value.querySelector("[data-arrow]") as HTMLElement;

    const resolvedPlacement = (props.placement ?? "bottom") as Placement;

    const { x, y, placement: computedPlacement, middlewareData } = await computePosition(
        triggerRef.value,
        popupRef.value,
        {
            strategy: "fixed",
            placement: resolvedPlacement,
            middleware: [
                offset(10),
                !strictPlacement
                    ? flip({
                        fallbackPlacements: ["left", "top", "bottom", "right"],
                    })
                    : undefined,
                shift({ padding: 10 }),
                arrow({ element: arrowRef.value! }),
            ].filter(Boolean),
        }
    );

    const arrowOffset =
        side(computedPlacement) === "left" || side(computedPlacement) === "right"
            ? middlewareData.arrow?.y ?? 0
            : middlewareData.arrow?.x ?? 0;

    commanderPosition.value = {
        top: `${y}px`,
        left: `${x}px`,
        arrowOffset,
        placement: (strictPlacement ? resolvedPlacement : computedPlacement) as Placement,
    };
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
