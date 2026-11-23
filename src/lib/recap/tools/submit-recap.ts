import { checkRecap } from "../checker";
import { recapDraftSchema } from "../recap";
import { nameIndexOf } from "./shared";
import { defineTool } from "./tool";

export const submitRecap = defineTool({
  name: "submit_recap",
  description:
    "Submit the finished recap: a headline, the paragraphs, and a list of claims. A claim is one factual statement " +
    "from the recap plus the ids of the tool results it relies on. A checker then verifies the recap against " +
    "everything the tools returned. Every number and every player or club name must come from a tool result, " +
    "and each claim's numbers and names must be in the results it cites. It returns either accepted: true, or a " +
    "list of specific problems to fix before submitting again.",
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
