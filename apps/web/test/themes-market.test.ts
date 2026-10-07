// The theme marketplace's URL handling and paging (src/components/themes/view.ts), and how
// themes are sorted into the filters' looks, colors and corners (the domain's themes.ts).
import assert from "node:assert/strict";
import { test } from "node:test";
import { BUILTIN_THEMES, colorOf, cornersOf, deriveTokens, modeOf, seedsOf } from "@waifu-devs/domain/themes";
import { pageNumbers, parseSearch, toSearch, withFilters } from "../src/components/themes/view.ts";

test("reads a URL into a view, dropping what it doesn't understand", () => {
  assert.deepEqual(parseSearch({}), { sort: "top", q: "", page: 1, filters: { mode: undefined, color: undefined, corners: undefined, period: undefined, hearted: undefined } });
  const view = parseSearch({ sort: "loved", q: "  ramen ", page: "3", mode: "dark", color: "teal", corners: "round", period: "week", hearted: true });
  assert.deepEqual(view, { sort: "loved", q: "ramen", page: 3, filters: { mode: "dark", color: "teal", corners: "round", period: "week", hearted: "1" } });
  const junk = parseSearch({ sort: "hot", page: "0", mode: "dim", color: "#fff", corners: 2, period: "decade", hearted: "yes", extra: "x" });
  assert.deepEqual(junk, parseSearch({}));
  assert.equal(parseSearch({ page: "101" }).page, 1);
  assert.equal(parseSearch({ page: "2.5" }).page, 1);
  assert.equal(parseSearch({ q: "x".repeat(100) }).q.length, 60);
});

test("writes a view back to the URL without the defaults", () => {
  assert.deepEqual(toSearch(parseSearch({})), {});
  const search = { sort: "worn", q: "mint", page: 2, color: "green", hearted: "1" };
  assert.deepEqual(toSearch(parseSearch(search)), search);
  // Round trips.
  assert.deepEqual(parseSearch(toSearch(parseSearch(search))), parseSearch(search));
});

test("changing a filter goes back to the first page and keeps the rest", () => {
  const view = parseSearch({ sort: "new", q: "a", page: 4, mode: "light" });
  const next = withFilters(view, { color: "pink" });
  assert.equal(next.page, 1);
  assert.deepEqual(toSearch(next), { sort: "new", q: "a", mode: "light", color: "pink" });
  assert.deepEqual(toSearch(withFilters(next, { mode: undefined })), { sort: "new", q: "a", color: "pink" });
});

test("numbers pages around this one, with gaps", () => {
  assert.deepEqual(pageNumbers(1, 1), [1]);
  assert.deepEqual(pageNumbers(1, 3), [1, 2, 3]);
  assert.deepEqual(pageNumbers(1, 10), [1, 2, 3, "gap", 10]);
  assert.deepEqual(pageNumbers(5, 10), [1, 2, 3, 4, 5, 6, 7, "gap", 10]);
  assert.deepEqual(pageNumbers(6, 12), [1, "gap", 4, 5, 6, 7, 8, "gap", 12]);
  assert.deepEqual(pageNumbers(12, 12), [1, "gap", 10, 11, 12]);
});

test("sorts the built-ins into the right looks, colors and corners", () => {
  const sorted = Object.fromEntries(
    BUILTIN_THEMES.map((t) => [t.id, [modeOf(t.variant.tokens), colorOf(t.variant.tokens), cornersOf(t.variant.radius)]]),
  );
  assert.deepEqual(sorted, {
    sakura: ["light", "pink", "round"],
    yoru: ["dark", "purple", "soft"],
    matcha: ["light", "green", "soft"],
    sora: ["light", "blue", "round"],
    tsundere: ["dark", "red", "sharp"],
  });
});

test("grays and near-grays are neutral, whatever their tint", () => {
  const base = seedsOf(BUILTIN_THEMES[0].variant.tokens);
  for (const primary of ["#000000", "#ffffff", "#808080", "#7a7f85", "#fdfdfe"]) {
    assert.equal(colorOf(deriveTokens({ ...base, primary })), "neutral", primary);
  }
  assert.equal(colorOf(deriveTokens({ ...base, primary: "#ffd54f" })), "yellow");
  assert.equal(colorOf(deriveTokens({ ...base, primary: "#4fc3f7" })), "blue");
  assert.equal(colorOf(deriveTokens({ ...base, primary: "#3ddc97" })), "green");
  assert.equal(colorOf(deriveTokens({ ...base, primary: "#ffab91" })), "orange");
});

test("corner styles split at 0.375rem and 1rem", () => {
  assert.deepEqual([0, 0.25, 0.375, 0.75, 1, 1.5].map(cornersOf), ["sharp", "sharp", "soft", "soft", "round", "round"]);
});
