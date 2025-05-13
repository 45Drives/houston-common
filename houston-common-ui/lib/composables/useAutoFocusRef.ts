import { onMounted, nextTick, type Ref } from "vue";

export function useAutoFocusRef(el: Ref<HTMLElement | null>) {
    onMounted(() => {
        nextTick(() => {
            el.value?.focus();
        });
    });
}
