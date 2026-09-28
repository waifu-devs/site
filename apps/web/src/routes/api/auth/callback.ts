import { createFileRoute } from "@tanstack/react-router";
import { Effect } from "effect";
import { run } from "@/server/runtime";
import { Session } from "@/server/Session";

/** OpenAuth sends the browser back here with a code to trade for tokens. */
export const Route = createFileRoute("/api/auth/callback")({
  server: {
    handlers: {
      GET: ({ request }) =>
        run(
          Session.pipe(
            Effect.flatMap((session) => session.callback(new URL(request.url).searchParams)),
            Effect.map((next) => new Response(null, { status: 302, headers: { Location: next } })),
            Effect.catchTag("OpenAuthError", (error) =>
              Effect.succeed(
                new Response(`Sign-in failed: ${error.reason}`, { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } }),
              ),
            ),
          ),
        ),
    },
  },
});
