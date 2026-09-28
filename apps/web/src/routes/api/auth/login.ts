import { createFileRoute } from "@tanstack/react-router";
import { Effect } from "effect";
import { run } from "@/server/runtime";
import { safeNext, Session } from "@/server/Session";

/** Starts a GitHub sign-in through the API's OpenAuth issuer. `?next=/path` is where to land afterwards. */
export const Route = createFileRoute("/api/auth/login")({
  server: {
    handlers: {
      GET: ({ request }) =>
        run(
          Effect.gen(function* () {
            const next = safeNext(new URL(request.url).searchParams.get("next"));
            const location = yield* (yield* Session).authorize(next);
            return new Response(null, { status: 302, headers: { Location: location } });
          }),
        ),
    },
  },
});
