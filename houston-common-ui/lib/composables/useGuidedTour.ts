import { ref, readonly, type Ref } from "vue";

export interface TourStep {
  /** CSS selector for the element to spotlight. */
  target: string;
  /** Text shown in the Houston Commander popup. */
  message: string;
  /** Preferred popup placement relative to the target. */
  placement?: "top" | "bottom";
  /** Runs before the step is positioned — use to switch tabs/steps so the target exists. */
  onEnter?: () => void | Promise<void>;
}

export interface TourRegistration {
  id: string;
  steps: TourStep[];
  onDone: () => void | Promise<void>;
}

const SEEN_KEY = "houston.tours.seen";
const ENABLED_KEY = "houston.tours.enabled";

const _activeTour = ref<TourRegistration | null>(null);
const _queue: TourRegistration[] = [];

function readSeen(): Record<string, boolean> {
  try {
    return JSON.parse(window.localStorage.getItem(SEEN_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function writeSeen(seen: Record<string, boolean>): void {
  try {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch {
    /* storage unavailable — tours simply repeat */
  }
}

/**
 * Centralized guided-tour manager shared by all Houston modules.
 *
 * Only one tour runs at a time; further requests queue behind the active one.
 * A single `<GuidedTour>` instance should be mounted once at the app root and
 * driven by `activeTour`.
 */
export function useGuidedTour() {
  function toursEnabled(): boolean {
    try {
      return window.localStorage.getItem(ENABLED_KEY) !== "false";
    } catch {
      return true;
    }
  }

  function setToursEnabled(enabled: boolean): void {
    try {
      window.localStorage.setItem(ENABLED_KEY, enabled ? "true" : "false");
    } catch {
      /* ignore */
    }
  }

  function hasSeenTour(id: string): boolean {
    return readSeen()[id] === true;
  }

  function markTourSeen(id: string): void {
    const seen = readSeen();
    seen[id] = true;
    writeSeen(seen);
  }

  function resetTours(): void {
    writeSeen({});
    setToursEnabled(true);
  }

  /** Start a tour now, or queue it if another is running. Skipped when disabled. */
  function requestTour(
    id: string,
    steps: TourStep[],
    onDone: () => void | Promise<void> = () => markTourSeen(id)
  ): void {
    if (!toursEnabled() || steps.length === 0) return;
    if (_activeTour.value?.id === id || _queue.some((t) => t.id === id)) return;

    const registration: TourRegistration = { id, steps, onDone };
    if (_activeTour.value) {
      _queue.push(registration);
    } else {
      _activeTour.value = registration;
    }
  }

  /** Start a tour only the first time this user sees it. */
  function requestTourOnce(id: string, steps: TourStep[], delayMs = 400): void {
    if (hasSeenTour(id)) return;
    window.setTimeout(() => requestTour(id, steps, () => markTourSeen(id)), delayMs);
  }

  function cancelTour(id: string): void {
    const idx = _queue.findIndex((t) => t.id === id);
    if (idx !== -1) _queue.splice(idx, 1);
    if (_activeTour.value?.id === id) {
      _activeTour.value = null;
      advanceQueue();
    }
  }

  /** Called by the GuidedTour component when the active tour finishes or is skipped. */
  async function finishTour(): Promise<void> {
    if (_activeTour.value) {
      await _activeTour.value.onDone();
      _activeTour.value = null;
    }
    advanceQueue();
  }

  function advanceQueue(): void {
    if (!_activeTour.value && _queue.length > 0) {
      _activeTour.value = _queue.shift()!;
    }
  }

  return {
    activeTour: readonly(_activeTour) as Readonly<Ref<TourRegistration | null>>,
    requestTour,
    requestTourOnce,
    cancelTour,
    finishTour,
    hasSeenTour,
    markTourSeen,
    resetTours,
    toursEnabled,
    setToursEnabled,
  };
}
