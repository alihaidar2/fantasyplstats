// Placeholder while the checker is written; replaced before this branch is done.
import type { NameEntry } from "./context";
import type { NameIndex } from "./names";
import type { CheckReport, EvidenceEntry, RecapDraft } from "./recap";

export interface CheckOptions {
  season: string;
  gameweek: number;
  evidence: readonly EvidenceEntry[];
  names: NameIndex;
  nameEntries: readonly NameEntry[];
}

export function checkRecap(_draft: RecapDraft, _options: CheckOptions): CheckReport {
  return { passed: false, issues: [], numbersChecked: 0, namesChecked: 0 };
}
