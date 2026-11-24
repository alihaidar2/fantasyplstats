// A recap as plain text: one block per card (or per paragraph, for a version 1
// recap). The eval judge reads it, the recap pull request shows it, and the
// recap page's description and Open Graph text come from it.

import {
  cardTitle,
  formatCount,
  formatNumbersInText,
  formatPercent,
  runCaption,
  type RecapCard,
} from "./cards";

/** Either version of a recap, saved or draft: what the text needs. */
export type RecapContent = { headline: string } & ({ cards: readonly RecapCard[] } | { paragraphs: readonly string[] });

const pts = (n: number) => `${formatCount(n)} ${Math.abs(n) === 1 ? "point" : "points"}`;
const sentence = (text: string) => {
  const t = formatNumbersInText(text.trim());
  return /[.!?]$/.test(t) ? t : `${t}.`;
};
const joinParts = (parts: (string | undefined | false)[]) => parts.filter(Boolean).join(", ");

/** One card as a short block of plain text, starting with its title. */
export function cardToText(card: RecapCard): string {
  const title = cardTitle(card);
  const text = "text" in card && card.text?.trim() ? ` ${sentence(card.text)}` : "";
  switch (card.type) {
    case "numbers":
      return `${title}: ${card.items.map((i) => `${formatNumbersInText(i.value)} ${i.label.trim()}`).join(" · ")}.`;
    case "captaincy": {
      const tiles = (card.tiles ?? [])
        .map((t) => `${t.player ? `${t.player} ` : ""}${formatNumbersInText(t.value)} ${t.label.trim()}`)
        .join(" · ");
      return (
        `${title}: ${card.player} scored ${pts(card.points)}` +
        (card.ownership !== undefined ? ` (owned by ${formatPercent(card.ownership)})` : "") +
        "." +
        (tiles ? ` ${tiles}.` : "") +
        (card.badge?.trim() ? ` ${sentence(card.badge)}` : "") +
        text
      );
    }
    case "players": {
      const players = card.players.map((p) => {
        const extra = joinParts([p.detail?.trim() && formatNumbersInText(p.detail.trim()), p.ownership !== undefined && `owned by ${formatPercent(p.ownership)}`]);
        return `${p.player} ${pts(p.points)}${extra ? ` (${extra})` : ""}.`;
      });
      return `${title}: ${players.join(" ")}${text}`;
    }
    case "matches":
      return `${title}: ${card.matches.map((m) => `${m.home} ${m.score} ${m.away}`).join("; ")}.${text}`;
    case "transfers": {
      const moves = card.moves.map(
        (m) =>
          joinParts([
            m.player,
            `${formatCount(m.netTransfers)} net transfers ${m.direction}`,
            m.points !== undefined && pts(m.points),
            m.minutes !== undefined && `${formatCount(m.minutes)} minutes`,
            m.run && runCaption(m.run.kind, m.run.gameweeks),
            m.detail?.trim() && formatNumbersInText(m.detail.trim()),
          ]) + ".",
      );
      return `${title}: ${moves.join(" ")}${text}`;
    }
    case "notes": {
      const items = card.items.map((n) => {
        const line = formatNumbersInText(n.text.trim()).replace(/[.]$/, "");
        const named = n.player && !line.toLowerCase().startsWith(n.player.toLowerCase()) ? `${n.player} ${line}` : line;
        return `${named}${n.points !== undefined ? ` (${pts(n.points)})` : ""}.`;
      });
      return `${title}: ${items.join(" ")}`;
    }
  }
}

/** The recap's body as blocks of plain text: one per card, or the paragraphs of a version 1 recap. */
export function recapTextBlocks(recap: RecapContent): string[] {
  return "cards" in recap ? recap.cards.map(cardToText) : recap.paragraphs.map(formatNumbersInText);
}

/** The whole recap as plain text: "# headline", then a block per card or paragraph. */
export function recapToText(recap: RecapContent): string {
  return [`# ${recap.headline}`, "", ...recapTextBlocks(recap).flatMap((b) => [b, ""])].join("\n").trimEnd();
}

/**
 * A short plain-text summary for a page description or a share preview: the
 * first paragraph of a version 1 recap. For a card recap, the cards' lines
 * (the sentences that say what each story meant), or the first story cards
 * as text when no card has a line.
 */
export function recapSummary(recap: RecapContent): string {
  if (!("cards" in recap)) return formatNumbersInText(recap.paragraphs[0] ?? "");
  const lines = recap.cards.flatMap((c) => ("text" in c && c.text?.trim() ? [sentence(c.text)] : []));
  if (lines.length) return lines.join(" ");
  const stories = recap.cards.filter((c) => c.type !== "numbers");
  return (stories.length ? stories : recap.cards).slice(0, 2).map(cardToText).join(" ");
}
