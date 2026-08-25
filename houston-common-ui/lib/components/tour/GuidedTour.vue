<template>
  <teleport to="body">
    <!-- Dim overlay with a cutout around the current target -->
    <div v-if="active && positioned" class="fixed inset-0 z-[2000] pointer-events-none">
      <svg class="absolute inset-0 w-full h-full pointer-events-auto" @click="next">
        <defs>
          <mask :id="maskId">
            <rect width="100%" height="100%" fill="white" />
            <rect :x="spotlight.x - PADDING" :y="spotlight.y - PADDING"
              :width="spotlight.width + PADDING * 2" :height="spotlight.height + PADDING * 2"
              rx="8" fill="black" />
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.6)" :mask="`url(#${maskId})`" />
      </svg>

      <div class="absolute pointer-events-none rounded-lg ring-2 ring-blue-400/80 transition-all duration-300"
        :style="{
          top: `${spotlight.y - PADDING}px`,
          left: `${spotlight.x - PADDING}px`,
          width: `${spotlight.width + PADDING * 2}px`,
          height: `${spotlight.height + PADDING * 2}px`,
        }" />
    </div>

    <!-- Popup: mounted while active so it can be measured, hidden until placed -->
    <div v-if="active" ref="popupRef" class="fixed pointer-events-auto z-[2001]"
      :style="{ top: popupPos.top, left: popupPos.left, visibility: positioned ? 'visible' : 'hidden' }">
      <div class="relative flex items-start text-left bg-slate-800/95 text-white p-5 min-h-[80px] rounded-md shadow-lg max-w-[520px]"
        @click.stop>
        <div class="absolute w-0 h-0 border-l-[10px] border-r-[10px] border-transparent" :class="{
          'border-b-[10px] border-b-slate-800/95 -top-[10px]': popupPlacement === 'bottom',
          'border-t-[10px] border-t-slate-800/95 -bottom-[10px]': popupPlacement === 'top',
        }" :style="{ left: `${arrowX}px`, transform: 'translateX(-50%)' }" />

        <img :src="houstonPortrait" alt="Houston"
          class="w-16 h-16 mr-3 rounded-lg object-cover flex-shrink-0" />

        <div class="flex flex-col flex-1 min-w-0">
          <p class="font-mono text-xs text-muted mb-1"><i>Houston Commander says:</i></p>
          <p class="font-mono text-sm whitespace-pre-wrap break-words">{{ currentStep?.message }}</p>

          <div class="flex items-center justify-between mt-3 pt-2 border-t border-white/20">
            <span class="text-xs text-muted">{{ currentIndex + 1 }} / {{ steps.length }}</span>
            <div class="flex items-center gap-2">
              <button class="text-xs text-muted hover:text-white underline" @click="emit('skip')">Skip tour</button>
              <button v-if="currentIndex > 0"
                class="px-3 py-1 text-xs rounded bg-white/10 hover:bg-white/20 transition-colors"
                @click="prev">Back</button>
              <button class="px-3 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-500 transition-colors"
                @click="next">
                {{ currentIndex === steps.length - 1 ? 'Finish' : 'Next' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from "vue";
import { computePosition, offset, flip, shift } from "@floating-ui/dom";
import { houstonPortrait } from "@/img";
import type { TourStep } from "@/composables/useGuidedTour";

const props = defineProps<{
  steps: TourStep[];
  active: boolean;
}>();

const emit = defineEmits<{ done: []; skip: [] }>();

const PADDING = 8;
const maskId = `houston-tour-mask-${Math.random().toString(36).slice(2, 9)}`;

const currentIndex = ref(0);
const popupRef = ref<HTMLElement | null>(null);
const positioned = ref(false);
const spotlight = ref({ x: 0, y: 0, width: 0, height: 0 });
const popupPos = ref({ top: "0px", left: "0px" });
const popupPlacement = ref<"top" | "bottom">("bottom");
const arrowX = ref(0);

const currentStep = computed(() => props.steps[currentIndex.value]);

let pollHandle: number | null = null;

function cancelPoll() {
  if (pollHandle !== null) {
    cancelAnimationFrame(pollHandle);
    pollHandle = null;
  }
}

function place(startedAt?: number) {
  cancelPoll();
  const since = startedAt ?? performance.now();
  const el = currentStep.value
    ? (document.querySelector(currentStep.value.target) as HTMLElement | null)
    : null;
  const popup = popupRef.value;

  // Target may still be mounting — retry for a couple of seconds.
  if (!el || !popup) {
    if (performance.now() - since < 2000) {
      pollHandle = requestAnimationFrame(() => place(since));
      return;
    }
    spotlight.value = {
      x: window.innerWidth / 2 - 100,
      y: window.innerHeight / 2 - 20,
      width: 200,
      height: 40,
    };
    popupPos.value = {
      top: `${window.innerHeight / 2 + 40}px`,
      left: `${window.innerWidth / 2 - 200}px`,
    };
    positioned.value = true;
    return;
  }

  const rect = el.getBoundingClientRect();
  if (rect.top < 0 || rect.bottom > window.innerHeight) {
    el.scrollIntoView({ block: "center" });
    pollHandle = requestAnimationFrame(() => place(performance.now()));
    return;
  }

  spotlight.value = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };

  computePosition(el, popup, {
    strategy: "fixed",
    placement: currentStep.value?.placement ?? "bottom",
    middleware: [offset(16), flip({ fallbackPlacements: ["top", "bottom"] }), shift({ padding: 12, crossAxis: true })],
  }).then(({ x, y, placement }) => {
    popupPlacement.value = placement.startsWith("top") ? "top" : "bottom";
    popupPos.value = { top: `${y}px`, left: `${x}px` };
    arrowX.value = Math.max(20, Math.min(rect.x + rect.width / 2 - x, (popup.offsetWidth || 400) - 20));
    positioned.value = true;
  });
}

function restart() {
  positioned.value = false;
  cancelPoll();
  Promise.resolve(currentStep.value?.onEnter?.()).finally(() => nextTick(() => place()));
}

function next() {
  if (currentIndex.value >= props.steps.length - 1) emit("done");
  else currentIndex.value++;
}

function prev() {
  if (currentIndex.value > 0) currentIndex.value--;
}

watch(currentIndex, restart);

watch(
  () => props.active,
  (isActive) => {
    if (isActive) {
      currentIndex.value = 0;
      restart();
    } else {
      cancelPoll();
      positioned.value = false;
    }
  }
);

// The manager swaps steps in place when moving to a queued tour.
watch(
  () => props.steps,
  () => {
    if (props.active) {
      currentIndex.value = 0;
      restart();
    }
  }
);

function onResize() {
  if (props.active && positioned.value) place();
}

onMounted(() => {
  window.addEventListener("resize", onResize);
  if (props.active) {
    currentIndex.value = 0;
    restart();
  }
});

onUnmounted(() => {
  window.removeEventListener("resize", onResize);
  cancelPoll();
});
</script>
