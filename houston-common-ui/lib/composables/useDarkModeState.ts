import { onMounted, onUnmounted, ref, type Ref } from "vue";

const darkModeState = ref(false);

function isCockpitStyleValue(value: string | null): value is "auto" | "dark" | "light" {
  return value !== null && ["auto", "dark", "light"].includes(value);
}

const setDarkMode = (style?: "auto" | "dark" | "light") => {
  style =
    style ??
    (localStorage.getItem("shell:style") as "auto" | "dark" | "light" | null) ??
    "auto";
  if (
    (window.matchMedia?.("(prefers-color-scheme: dark)").matches &&
      style === "auto") ||
    style === "dark"
  ) {
    darkModeState.value = true;
    document.documentElement.classList.add("dark");
  } else {
    darkModeState.value = false;
    document.documentElement.classList.remove("dark");
  }
};

window.addEventListener("storage", event => {
  if (event.key === "shell:style" && isCockpitStyleValue(event.newValue)) {
      setDarkMode(event.newValue);
  }
});

// When changing the theme from the shell switcher the localstorage change will not fire for the same page (aka shell)
// so we need to listen for the event on the window object.
window.addEventListener("cockpit-style", (event)  => {
  const styleEvent = event as (Event & {detail?: {style?: string}});
  const style = styleEvent.detail?.style;
  if (style === undefined || !isCockpitStyleValue(style)) {
    return;
  }

  setDarkMode(style);
});

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  setDarkMode();
});

setDarkMode();

export function useDarkModeState(): Ref<boolean> {
  return darkModeState;
}
