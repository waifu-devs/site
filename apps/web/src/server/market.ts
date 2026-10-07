/**
 * Server functions for the theme marketplace: browsing, a theme's own page, and hearts.
 */
import { createServerFn } from "@tanstack/react-start";
import { Effect, Option } from "effect";
import { parseSearch, type View } from "../components/themes/view.ts";
import { asUser, asViewer, orNotFound } from "./helpers.ts";
import { run } from "./runtime.ts";
import { Session } from "./Session.ts";

/**
 * One page of the marketplace. While just browsing (first page, no search, no filters
 * built-ins can't match), the built-ins and the viewer's own themes come too.
 */
export const getMarket = createServerFn({ method: "GET" })
  // Read like a URL, so whatever the browser sends comes out as a view the API takes.
  .validator((view: View) => parseSearch({ ...view.filters, sort: view.sort, q: view.q, page: view.page }))
  .handler(({ data }) =>
    run(
      Effect.gen(function* () {
        const api = yield* asViewer;
        const user = Option.getOrNull(yield* (yield* Session).currentUser);
        const first = !data.q && data.page === 1;
        // Built-ins have no age and take no hearts, so those filters leave them out.
        const withBuiltins = first && !data.filters.period && !data.filters.hearted;
        const unfiltered = first && Object.values(data.filters).every((value) => value === undefined);
        const [page, builtins, mine] = yield* Effect.all(
          [
            api.market.themes({ urlParams: { ...data.filters, sort: data.sort, page: data.page, ...(data.q ? { q: data.q } : {}) } }),
            withBuiltins ? api.market.builtins() : Effect.succeed([]),
            unfiltered && user ? asUser.pipe(Effect.flatMap((me) => me.me.themes())) : Effect.succeed([]),
          ],
          { concurrency: "unbounded" },
        );
        return { ...page, builtins, mine };
      }),
    ),
  );

export const getThemeDetails = createServerFn({ method: "GET" })
  .validator((id: string) => String(id))
  .handler(({ data: id }) => run(asViewer.pipe(Effect.flatMap((api) => orNotFound(api.market.theme({ path: { id } }))))));

export const voteTheme = createServerFn({ method: "POST" })
  .validator((data: { themeId: string; up: boolean }) => ({ themeId: String(data.themeId), up: data.up === true }))
  .handler(({ data }) =>
    run(
      asUser.pipe(
        Effect.flatMap((api) => (data.up ? api.themes.upvote({ path: { id: data.themeId } }) : api.themes.unvote({ path: { id: data.themeId } }))),
      ),
    ),
  );
