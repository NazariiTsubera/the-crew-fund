"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";

import { DEFAULT_THEME, isTheme, readStoredTheme, storeTheme, type Theme } from "@/lib/theme";

// The <html data-theme> attribute is the source of truth: the head script sets it before
// React loads, so the toggle subscribes to it instead of keeping its own copy.
function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

function currentTheme(): Theme {
  const value = document.documentElement.getAttribute("data-theme");
  return isTheme(value) ? value : DEFAULT_THEME;
}

export function useTheme(): [Theme, () => void] {
  const theme = useSyncExternalStore(subscribe, currentTheme, () => DEFAULT_THEME);
  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    storeTheme(next);
    document.documentElement.setAttribute("data-theme", next);
  };
  return [theme, toggle];
}

/** Re-applies the stored theme after React's dev-mode remount resets <html> attributes. */
export function ThemeRestorer() {
  useLayoutEffect(() => {
    const stored = readStoredTheme();
    if (stored) document.documentElement.setAttribute("data-theme", stored);
  }, []);
  return null;
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, toggle] = useTheme();
  const label = theme === "dark" ? "☀ LIGHT" : "☾ DARK";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle light and dark theme"
      className={`h-[30px] cursor-pointer rounded-[2px] border border-line-strong bg-transparent font-mono text-[11px] leading-none font-medium tracking-[0.08em] text-soft hover:border-accent hover:text-accent focus-visible:outline focus-visible:outline-accent ${compact ? "px-2.5" : "flex-1"}`}
    >
      {compact ? label.slice(0, 1) : label}
    </button>
  );
}
