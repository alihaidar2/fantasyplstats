import { checkRecap } from "../checker";
import { recapDraftSchema } from "../recap";
import { nameIndexOf } from "./shared";
import { defineTool } from "./tool";

export const submitRecap = defineTool({
  name: "submit_recap",
  description:
    "Submit the finished recap: a headline and 4 to 7 story cards. Each card has a type (numbers, captaincy, " +
    "players, matches, transfers, notes), its figures and names in their own fields, at most a short line of " +
    "text, and the ids of the tool results it was built from. A checker then verifies every figure and name on " +
    "each card against the results that card cites, and each player's figures against that player. It returns " +
    "either accepted: true, or a list of specific problems to fix before submitting again.",
  input: recapDraftSchema,
  run(context, draft, evidence) {
    const report = checkRecap(draft, {
      season: context.season,
      gameweek: context.gameweek,
      evidence,
      names: nameIndexOf(context),
      nameEntries: context.names,
    });
    return report.passed
      ? { accepted: true, numbersChecked: report.numbersChecked, namesChecked: report.namesChecked }
      : { accepted: false, problems: report.issues.map((i) => `${i.where}: ${i.message}`) };
  },
});
