"use client";

import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
} from "react";

type Theme = "dark" | "light" | "system";

type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const initialState: ThemeProviderState = {
  theme: "system",
  setTheme: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

// Fired when this tab changes the theme. The `storage` event covers other tabs.
const THEME_CHANGE_EVENT = "theme-change";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
  };
}

function readStoredTheme(storageKey: string): Theme | null {
  try {
    const stored = localStorage.getItem(storageKey);
    return stored === "dark" || stored === "light" || stored === "system"
      ? stored
      : null;
  } catch {
    return null;
  }
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "ui-theme",
}: {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
}) {
  // The server snapshot (null) is used while hydrating, so the first client
  // render matches the server; the stored theme takes over right after.
  const storedTheme = useSyncExternalStore(
    subscribe,
    () => readStoredTheme(storageKey),
    () => null
  );
  const theme = storedTheme ?? defaultTheme;

  useEffect(() => {
    const root = window.document.documentElement;

    root.classList.remove("light", "dark");

    if (theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)")
        .matches
        ? "dark"
        : "light";

      root.classList.add(systemTheme);
      return;
    }

    root.classList.add(theme);
  }, [theme]);

  const value = {
    theme,
    setTheme: (theme: Theme) => {
      localStorage.setItem(storageKey, theme);
      window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
    },
  };

  return (
    <ThemeProviderContext.Provider value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);

  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider");

  return context;
};
