import { onActivated, onDeactivated } from 'vue';

let globalActiveHandler: ((e: KeyboardEvent) => void) | null = null;
let globalHandlerId: number | null = null;
let idCounter = 0;

export function useEnterToAdvance(
  onEnter: () => void | Promise<void>,
  debounceMs = 0,
  onRightArrow?: () => void | Promise<void>,
  onLeftArrow?: () => void | Promise<void>
) {
  const localId = ++idCounter;
  let debounceTimeout: ReturnType<typeof setTimeout> | null = null;

  const handler = (e: KeyboardEvent) => {
    // Allow typing in inputs/textareas/selects/etc
    const active = document.activeElement;
    const isTypingField =
      (active?.tagName === 'INPUT' && active.getAttribute('type') !== 'checkbox') ||
      active?.tagName === 'TEXTAREA' ||
      active?.tagName === 'SELECT' ||
      active?.hasAttribute?.('contenteditable');

    if (isTypingField) return;

    const trigger = (fn?: () => void | Promise<void>) => {
      if (!fn) return;
      if (debounceMs > 0 && debounceTimeout) return;
      if (debounceMs > 0) debounceTimeout = setTimeout(() => (debounceTimeout = null), debounceMs);
      const result = fn();
      if (result instanceof Promise) result.catch(err => console.error('useEnterToAdvance error:', err));
    };

    switch (e.key) {
      case 'Enter':
        e.preventDefault();
        trigger(onEnter);
        break;
      case 'ArrowRight':
        e.preventDefault();
        trigger(onRightArrow);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        trigger(onLeftArrow);
        break;
    }
  };

  const installHandler = () => {
    // Remove previous global handler if needed
    if (globalActiveHandler && globalHandlerId !== localId) {
      document.removeEventListener('keydown', globalActiveHandler);
    }

    // Register this handler as the active one
    globalActiveHandler = handler;
    globalHandlerId = localId;
    document.addEventListener('keydown', handler);
  };

  const removeHandler = () => {
    if (globalHandlerId === localId && globalActiveHandler) {
      document.removeEventListener('keydown', globalActiveHandler);
      globalActiveHandler = null;
      globalHandlerId = null;
    }
  };

  onActivated(() => {
    installHandler();
  });

  onDeactivated(() => {
    removeHandler();
  });
}
