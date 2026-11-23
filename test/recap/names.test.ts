import { describe, expect, it } from "vitest";
import type { NameEntry } from "../../src/lib/recap/context";
import { createNameIndex, fold, nameTokens } from "../../src/lib/recap/names";
import { loadContext } from "./helpers";

const player = (id: number, webName: string, firstName: string, secondName: string, knownName = ""): NameEntry => ({
  kind: "player", id, webName, firstName, secondName, knownName,
});
const team = (id: number, name: string, shortName: string): NameEntry => ({ kind: "team", id, name, shortName });

const ENTRIES: NameEntry[] = [
  player(1, "B.Fernandes", "Bruno", "Borges Fernandes"),
  player(2, "Bruno G.", "Bruno", "Guimarães Rodriguez Moura", "Bruno Guimarães"),
  player(3, "Ødegaard", "Martin", "Ødegaard"),
  player(4, "Van de Ven", "Micky", "van de Ven"),
  player(5, "White", "Ben", "White"),
  player(6, "Wilson", "Callum", "Wilson"),
  player(7, "Wilson", "Harry", "Wilson"),
  player(8, "Alexander-Arnold", "Trent", "Alexander-Arnold"),
  player(9, "Haaland", "Erling", "Haaland"),
  player(10, "Hughes", "Will", "Hughes"),
  player(11, "Stones", "John", "Stones"),
  player(12, "Smith Rowe", "Emile", "Smith Rowe"),
  team(1, "Arsenal", "ARS"),
  team(15, "Man City", "MCI"),
  team(18, "Nott'm Forest", "NFO"),
  team(19, "Spurs", "TOT"),
  team(7, "Coventry City", "COV"),
];
const index = createNameIndex(ENTRIES);
const found = (text: string) => index.scan(text).mentions.map((m) => [m.text, m.kind, m.ids]);
const unknown = (text: string) => index.scan(text).unknown.map((u) => u.text);

describe("fold and nameTokens", () => {
  it("strip accents, initials and particles", () => {
    expect(fold("Ødegaard Guéhi Kadıoğlu Groß")).toBe("Odegaard Guehi Kadioglu Gross");
    expect(nameTokens("B.Fernandes")).toEqual(["fernandes"]);
    expect(nameTokens("Bruno G.")).toEqual(["bruno"]);
    expect(nameTokens("Van de Ven")).toEqual(["ven"]);
    expect(nameTokens("Tóth.A")).toEqual(["toth"]);
    expect(nameTokens("Alexander-Arnold")).toEqual(["alexander", "arnold"]);
  });
});

describe("scan", () => {
  it("finds players however they are written", () => {
    expect(found("goals for B.Fernandes and for Bruno Fernandes")).toEqual([
      ["B.Fernandes", "player", [1]],
      ["Bruno Fernandes", "player", [1]],
    ]);
    expect(found("a word on Bruno Guimarães, Odegaard and Erling Haaland")).toEqual([
      ["Bruno Guimarães", "player", [2]],
      ["Odegaard", "player", [3]],
      ["Erling Haaland", "player", [9]],
    ]);
    expect(found("then Van de Ven, Micky van de Ven and Alexander-Arnold")).toEqual([
      ["Van de Ven", "player", [4]],
      ["Micky van de Ven", "player", [4]],
      ["Alexander-Arnold", "player", [8]],
    ]);
  });

  it("reads a display name with its initial as that one player", () => {
    const fernandes = createNameIndex([...ENTRIES, player(20, "Fernandes", "Mateus", "Fernandes")]);
    const ids = (text: string) => fernandes.scan(text).mentions.map((m) => [m.text, m.ids]);
    expect(ids("a goal for B.Fernandes")).toEqual([["B.Fernandes", [1]]]);
    expect(ids("B.Fernandes scored")).toEqual([["B.Fernandes", [1]]]);
    expect(ids("a goal for Fernandes")).toEqual([["Fernandes", [1, 20]]]);
    expect(fernandes.lookupPlayer("B.Fernandes")).toEqual([1]);
    expect(fernandes.lookupPlayer("b.fernandes")).toEqual([1]);
    expect(fernandes.lookupPlayer("Fernandes")).toEqual([1, 20]);
    expect(fernandes.lookupPlayer("Bruno Fernandes")).toEqual([1]);
  });

  it("returns every player an ambiguous name could mean", () => {
    expect(found("a brace for Wilson")).toEqual([["Wilson", "player", [6, 7]]]);
    expect(found("a brace for Callum Wilson")).toEqual([["Callum Wilson", "player", [6]]]);
    // "Bruno" alone is what FPL calls Guimarães, but could be Fernandes too.
    const [bruno] = index.scan("a goal for Bruno").mentions;
    expect(bruno).toMatchObject({ ids: [1, 2], exactIds: [2] });
  });

  it("finds clubs by name, short name, alias and possessive", () => {
    expect(found("Man City's win over Nott'm Forest, then ARS v Tottenham")).toEqual([
      ["Man City", "team", [15]],
      ["Nott'm Forest", "team", [18]],
      ["ARS", "team", [1]],
      ["Tottenham", "team", [19]],
    ]);
    expect(found("Manchester City beat Coventry and Nottingham Forest")).toEqual([
      ["Manchester City", "team", [15]],
      ["Coventry", "team", [7]],
      ["Nottingham Forest", "team", [18]],
    ]);
    expect(found("Arsenal's Odegaard")).toEqual([
      ["Arsenal", "team", [1]],
      ["Odegaard", "player", [3]],
    ]);
  });

  it("needs a capital letter", () => {
    expect(found("a white shirt and precious stones")).toEqual([]);
  });

  it("marks a sentence's first word as weak when it may not be a name", () => {
    const weak = (text: string) => index.scan(text).mentions.map((m) => [m.text, m.weak]);
    expect(weak("Will he start? White was booked. Haaland scored.")).toEqual([
      ["Will", true],
      ["White", true],
      ["Haaland", false],
    ]);
    expect(weak("a booking for White")).toEqual([["White", false]]);
  });

  it("reports capitalised words that are no player or club", () => {
    expect(unknown("praise from Pep Guardiola at Anfield")).toEqual(["Pep Guardiola", "Anfield"]);
    expect(unknown("the Norwegian scored")).toEqual(["Norwegian"]);
    expect(unknown("Guardiola's side won")).toEqual(["Guardiola"]);
  });

  it("reports a stranger's name whole, even when its parts are players' names", () => {
    // "John" (Stones) and "Smith" (Smith Rowe) are players' names; "John Smith" is nobody here.
    const scan = index.scan("the top manager, John Smith, scored well");
    expect(scan.unknown.map((u) => u.text)).toEqual(["John Smith"]);
    expect(scan.mentions).toEqual([]);
  });

  it("lets ordinary capitalised words through", () => {
    expect(unknown("Elsewhere, the Double Gameweek and the Triple Captain chip on Saturday in FPL")).toEqual([]);
    expect(unknown("Gameweek 3: Dream Team places for Haaland. The Bench Boost paid off.")).toEqual([]);
  });

  it("can't tell a lone unknown surname from an ordinary word at the start of a sentence", () => {
    // A documented limit: see the checker's header.
    expect(unknown("Guardiola rotated again.")).toEqual([]);
  });
});

describe("lookups", () => {
  it("resolve tool inputs", () => {
    expect(index.lookupPlayer("Haaland")).toEqual([9]);
    expect(index.lookupPlayer("bruno fernandes")).toEqual([1]);
    expect(index.lookupPlayer("Wilson")).toEqual([6, 7]);
    expect(index.lookupPlayer("Nobody")).toEqual([]);
    expect(index.lookupTeam("MCI")).toBe(15);
    expect(index.lookupTeam("man city")).toBe(15);
    expect(index.lookupTeam("Manchester City")).toBe(15);
    expect(index.lookupTeam("Real Madrid")).toBeNull();
  });

  it("cover every player and club in the recorded snapshot", () => {
    const context = loadContext(3);
    const real = createNameIndex(context.names);
    for (const p of context.players) {
      expect(real.lookupPlayer(p.name), p.name).toContain(p.id);
      const mention = real.scan(`a goal for ${p.name} today`).mentions.find((m) => m.kind === "player");
      expect(mention?.ids, p.name).toContain(p.id);
    }
    for (const t of context.teams) {
      expect(real.lookupTeam(t.name)).toBe(t.id);
      expect(real.lookupTeam(t.shortName)).toBe(t.id);
      expect(real.scan(`a win for ${t.name} today`).mentions[0]).toMatchObject({ kind: "team", ids: [t.id] });
    }
  });
});
