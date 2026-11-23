"use client";

import * as React from "react";
import { decodeToolsData, TOOLS_DATA_PATH, type ToolsData } from "@/lib/stats/tools";

export type ToolsDataState =
  { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: ToolsData };

// One request per page load, shared by every component that asks.
let request: Promise<ToolsData> | undefined;

function load(version: string): Promise<ToolsData> {
  request ??= fetch(`${TOOLS_DATA_PATH}?v=${encodeURIComponent(version)}`)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then(decodeToolsData)
    .catch((error: unknown) => {
      request = undefined; // let a retry fetch again
      throw error;
    });
  return request;
}

/**
 * The tools' player and fixture data, fetched from the static data file the
 * build writes. `version` is the build's snapshot time: it keys the URL, so a
 * page from one build never pairs with a cached file from another.
 */
export function useToolsData(version: string): ToolsDataState & { retry: () => void } {
  const [state, setState] = React.useState<ToolsDataState>({ status: "loading" });
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    let live = true;
    load(version).then(
      (data) => live && setState({ status: "ready", data }),
      () =>
        live &&
        setState({ status: "error", message: "Couldn't load the player data. Check your connection and try again." }),
    );
    return () => {
      live = false;
    };
  }, [version, attempt]);

  const retry = React.useCallback(() => {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  }, []);

  return { ...state, retry };
}

export function ToolsDataStatus({ state }: Readonly<{ state: ToolsDataState & { retry: () => void } }>) {
  if (state.status === "ready") return null;
  if (state.status === "loading") {
    return (
      <p role="status" className="py-12 text-center text-sm text-gray-600 dark:text-gray-400">
        Loading player data…
      </p>
    );
  }
  return (
    <div role="alert" className="py-12 text-center text-sm text-gray-700 dark:text-gray-300">
      <p>{state.message}</p>
      <button
        type="button"
        onClick={state.retry}
        className="mt-3 rounded-md border border-emerald-600 px-3 py-1.5 font-medium text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-900/30"
      >
        Try again
      </button>
    </div>
  );
}
