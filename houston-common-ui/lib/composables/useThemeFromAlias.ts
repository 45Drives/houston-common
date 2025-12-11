// src/renderer/composables/useThemeFromAlias.ts
import { ref, watchEffect } from 'vue'

type Theme = 'theme-homelab' | 'theme-professional' | 'theme-default' | 'theme-studio'
type Division = 'studio' | 'homelab' | 'professional' | 'default'

const aliasToTheme: Record<string, Theme> = {
  homelab: 'theme-homelab',
  professional: 'theme-professional',
  default: 'theme-default',
}

const themeToDivision: Record<Theme, Division> = {
  'theme-homelab': 'homelab',
  'theme-professional': 'professional',
  'theme-studio': 'studio',
  'theme-default': 'default'
}

const currentTheme = ref<Theme>('theme-default')      // default boot theme
const currentDivision = ref<Division>('studio')

function setHtmlThemeClass(theme: Theme) {
  const root = document.documentElement
  root.classList.remove('theme-default', 'theme-homelab', 'theme-professional', 'theme-studio')
  root.classList.add(theme)
}

watchEffect(() => {
  setHtmlThemeClass(currentTheme.value)
  currentDivision.value = themeToDivision[currentTheme.value]
})

/** Apply a theme using the 45Drives alias coming from the server (e.g. "homelab"|"professional") */
function applyThemeFromAlias(aliasStyle?: string) {
  const normalized = (aliasStyle || '').toLowerCase()
  currentTheme.value = aliasToTheme[normalized] ?? 'theme-studio'
}

/** Directly set a theme */
function setTheme(theme: Theme) {
  currentTheme.value = theme
}

export function useThemeFromAlias() {
  return {
    currentTheme,         // reactive (theme-homelab|theme-studio|theme-professional|theme-default)
    currentDivision,      // reactive (homelab|studio|professional|default)
    applyThemeFromAlias,  // call with aliasStyle from server info
    setTheme,             // manual setter
  }
}
