# Recap content for builds and tests

A stand-in for `content/recaps/`, laid out the same way (`<season>/gw<NN>.json`). CI builds the site a second time with `RECAP_CONTENT_DIR=test/fixtures/recaps`, so the recap pages and the home page's recap block are built on every PR without a fake recap ever sitting in `content/`.

- `2026-27/gw04.json`: an exact copy of `../recap/sample-recap.json` (hand-written, `"model": "hand-written"`). `test/recaps.test.ts` fails if the two drift apart; copy the sample over again after refreshing it.

Never copy these files into `content/recaps/`: everything there is published to fantasyplstats.com.
