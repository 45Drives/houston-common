import { onMounted, nextTick } from 'vue';

/**
 * Automatically focuses the first focusable input inside the current component.
 * Optionally takes a selector override (defaults to common form fields).
 */
export function useAutoFocus(selector = 'input, textarea, select, [tabindex]:not([tabindex="-1"])') {
    onMounted(() => {
        nextTick(() => {
            const root = document.activeElement?.shadowRoot || document;
            const el = root.querySelector(selector) as HTMLElement | null;
            el?.focus();
        });
    });
}
