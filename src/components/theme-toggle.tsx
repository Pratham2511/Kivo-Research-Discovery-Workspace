"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";

const emptySubscribe = () => () => {};

/** True only after client hydration (avoids SSR mismatch for the toggle icon). */
function useIsClient() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

/**
 * Paper / Harbour toggle — switches between Solarized Light (default)
 * and Solarized Dark. Render-safe on first paint.
 */
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useIsClient();

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <button
      type="button"
      aria-label={isDark ? "Switch to Solarized Light" : "Switch to Solarized Dark"}
      title={isDark ? "Solarized Light" : "Solarized Dark"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="btn btn-ghost btn-chip !px-2.5"
    >
      {mounted ? (
        isDark ? (
          <Sun className="h-4 w-4" strokeWidth={2.2} />
        ) : (
          <Moon className="h-4 w-4" strokeWidth={2.2} />
        )
      ) : (
        <span className="h-4 w-4" />
      )}
      {!compact && (
        <span className="font-mono text-[11px] uppercase tracking-wider">
          {mounted ? (isDark ? "Harbour" : "Paper") : "Theme"}
        </span>
      )}
    </button>
  );
}
