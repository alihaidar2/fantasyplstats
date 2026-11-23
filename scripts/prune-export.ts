// Runs after `next build` (npm run build): removes the copies of each page's
// data that the browser never asks for, then reports the size of out/.
//
// For every page the static export writes the RSC payload as index.txt (what
// the client router fetches on navigation) and again, byte for byte, as
// __next._full.txt, which this version of the client never requests (its
// bundle has no reference to it; it fetches index.txt and the per-segment
// __next.<segment>.txt files). With ~1,100 pages by the end of a season that
// copy is about a sixth of out/, so it goes. A __next._full.txt that is not
// identical to its index.txt is kept, with a warning, in case a later Next.js
// version starts using it differently.
//
// The deployed site has a 250 MB limit (Azure Static Web Apps, free plan), so
// the report warns from WARN_BYTES on, on GitHub as an annotation.
//
//   tsx scripts/prune-export.ts [dir]   (default: out)

import { appendFileSync, readdirSync, readFileSync, statSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const DUPLICATE_PAYLOAD = "__next._full.txt";
export const WARN_BYTES = 200 * 1024 * 1024;

export interface PruneResult {
  removed: number;
  removedBytes: number;
  /** Duplicates kept because they differ from their index.txt. */
  kept: string[];
  files: number;
  bytes: number;
}

export function pruneExport(dir: string): PruneResult {
  const result: PruneResult = { removed: 0, removedBytes: 0, kept: [], files: 0, bytes: 0 };
  const walk = (folder: string) => {
    const entries = readdirSync(folder, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      const size = statSync(path).size;
      if (entry.name === DUPLICATE_PAYLOAD) {
        const index = join(folder, "index.txt");
        let same = false;
        try {
          same = readFileSync(index).equals(readFileSync(path));
        } catch {
          same = false;
        }
        if (same) {
          unlinkSync(path);
          result.removed++;
          result.removedBytes += size;
          continue;
        }
        result.kept.push(path);
      }
      result.files++;
      result.bytes += size;
    }
  };
  walk(dir);
  return result;
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

function main() {
  const dir = resolve(process.argv[2] ?? "out");
  const r = pruneExport(dir);
  const summary =
    `out/: ${mb(r.bytes)} in ${r.files.toLocaleString("en-GB")} files, after removing ` +
    `${r.removed.toLocaleString("en-GB")} duplicate page payloads (${mb(r.removedBytes)}).`;
  console.log(summary);
  for (const path of r.kept) {
    console.warn(`warning: ${path} differs from its index.txt, so it was kept`);
  }
  if (r.bytes >= WARN_BYTES) {
    const message = `out/ is ${mb(r.bytes)}, close to Azure Static Web Apps' 250 MB limit.`;
    console.warn(process.env.GITHUB_ACTIONS ? `::warning::${message}` : `warning: ${message}`);
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Static site\n\n${summary}\n`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
