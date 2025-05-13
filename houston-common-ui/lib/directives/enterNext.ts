import type { Directive } from "vue";

export const enterNextDirective: Directive = {
    mounted(el, binding) {
        el.addEventListener("keydown", (e: KeyboardEvent) => {
            if (e.key !== "Enter") return;

            e.preventDefault();

            const form = el.closest("form") || document;
            const focusables = Array.from(
                form.querySelectorAll(
                    'input:not([disabled]), textarea, select, [tabindex]:not([tabindex="-1"])'
                )
            ).filter((el) => el instanceof HTMLElement && el.offsetParent !== null) as HTMLElement[];

            const idx = focusables.indexOf(el as HTMLElement);
            const next = focusables[idx + 1];

            if (next) {
                next.focus();
            } else {
                if (typeof binding.value === "function") {
                    binding.value();
                } else {
                    const event = new CustomEvent("advance");
                    el.dispatchEvent(event);
                }
            }
        });
    }
};
