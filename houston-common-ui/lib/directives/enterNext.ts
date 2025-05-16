import type { Directive } from "vue";

export const enterNextDirective: Directive = {
  mounted(el, binding) {
    el.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key !== "Enter") return;

      const form = el.closest("form") as HTMLFormElement | null;
      if (!form) return;

      e.preventDefault();
      e.stopImmediatePropagation();

      const focusables = Array.from(
        form.querySelectorAll(
          'input:not([disabled]):not([type="hidden"]), textarea, select, [tabindex]:not([tabindex="-1"])'
        )
      ).filter(
        (el) => el instanceof HTMLElement && el.offsetParent !== null
      ) as HTMLElement[];

      const idx = focusables.indexOf(el as HTMLElement);
      const next = focusables[idx + 1];

      if (next) {
        next.focus();
      } else {
        // When no next element, submit the form programmatically
        form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
      }
    });
  },
};
