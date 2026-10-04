# Translations

One folder per language, named by its tag (`en`, `es`, `pt-BR`). English (`en/`) is
the source and always complete; any key a language leaves out shows in English.

Adding a language is adding a folder:

- `meta.json`: `name` (the language's own name for itself), `english` (its name in
  English), `dir` (`ltr` or `rtl`), `plural` (the rule family, as in `en/meta.json`;
  the site asks the browser for plural rules, fuwa's desktop app uses this), and
  `reviewed` (false while it's a draft nobody who speaks it has checked; the
  picker then says so).
- Any of the namespace files English has (`common.json`, ...), with any subset of
  its keys.

Rules the tests check (`pnpm --filter @waifu-devs/web test`):

- Only keys English has. Rename or remove a key in every language at once.
- The same `{placeholders}` as English. Never translate what's inside the braces.
- Plurals are objects keyed by CLDR category (`one`, `few`, `many`, `other`...),
  with at least `other`; a category left out falls back to `other`.
- Plain text only: no HTML or Markdown. Bold and links are put in by the page.

Keys name the place, not the words (`nav.signIn`, not `sign_in_text`), so English
can be reworded without touching other languages. Translations are made by
people and committed here; nothing is translated at runtime.
