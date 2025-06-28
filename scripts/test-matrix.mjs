import fetch from "node-fetch";

const bootstrap = await fetch(
  "https://fantasy.premierleague.com/api/bootstrap-static/"
).then(r => r.json());

const fixtures = await fetch(
  "https://fantasy.premierleague.com/api/fixtures/"
).then(r => r.json());

const rows = buildFixtureMatrix(bootstrap.teams, fixtures);
console.log(rows[0], "\nTotal rows:", rows.length);
