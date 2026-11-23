"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import type { PlayersTableView, PlayersTableViewId } from "./players-table-views";

export const tabIdFor = (view: PlayersTableViewId) => `players-view-tab-${view}`;

/**
 * Accessible tabs (WAI-ARIA tabs pattern, automatic activation): only the
 * selected tab is in the tab order, and the arrow keys, Home and End move
 * between tabs and select them.
 */
export function PlayersTableTabs({
  views,
  selected,
  onSelect,
  panelId,
}: Readonly<{
  views: readonly PlayersTableView[];
  selected: PlayersTableViewId;
  onSelect: (view: PlayersTableViewId) => void;
  panelId: string;
}>) {
  const tabs = React.useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const count = views.length;
    const targets: Record<string, number> = {
      ArrowRight: (index + 1) % count,
      ArrowLeft: (index - 1 + count) % count,
      Home: 0,
      End: count - 1,
    };
    const next = targets[event.key];
    if (next === undefined) return;
    event.preventDefault();
    onSelect(views[next].id);
    tabs.current[next]?.focus();
  }

  return (
    <div role="tablist" aria-label="Player stats" className="flex flex-wrap gap-2">
      {views.map((view, index) => {
        const active = view.id === selected;
        return (
          <button
            key={view.id}
            ref={(el) => {
              tabs.current[index] = el;
            }}
            id={tabIdFor(view.id)}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={panelId}
            tabIndex={active ? 0 : -1}
            onClick={() => onSelect(view.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900",
              active
                ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                : "border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-emerald-600 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-emerald-400",
            )}
          >
            {view.label}
          </button>
        );
      })}
    </div>
  );
}
