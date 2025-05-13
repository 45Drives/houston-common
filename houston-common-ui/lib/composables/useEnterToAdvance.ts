import { onMounted, onBeforeUnmount } from 'vue';

/**
 * Allows "Enter" key to trigger any action (sync or async),
 * unless the user is actively typing into a text input or textarea.
 */
export function useEnterToAdvance(onEnter: () => void | Promise<void>) {
    const handleKeydown = (e: KeyboardEvent) => {
        const active = document.activeElement;

        const isTypingField =
            (active?.tagName === 'INPUT' && active.getAttribute('type') !== 'checkbox') ||
            active?.tagName === 'TEXTAREA' ||
            active?.tagName === 'SELECT' ||
            active?.hasAttribute?.('contenteditable');

        const isInteractive =
            active && (
                (active as HTMLElement).offsetParent !== null ||
                getComputedStyle(active as Element).visibility !== 'hidden'
            );

        // Final decision
        if (
            e.key === 'Enter' &&
            (!isTypingField || !isInteractive) // ← This now lets us through on a blurred or inactive element
        ) {
            e.preventDefault();
            const result = onEnter();
            if (result instanceof Promise) {
                result.catch((err) => console.error("Enter-to-advance error:", err));
            }
        }
    };

    onMounted(() => document.addEventListener('keydown', handleKeydown));
    onBeforeUnmount(() => document.removeEventListener('keydown', handleKeydown));
}
  