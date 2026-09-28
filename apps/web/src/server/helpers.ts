/**
 * Pieces the server functions share. Only server function handlers may use these:
 * the client build drops the handlers, and with them every import of this module.
 */
import { notFound, redirect } from "@tanstack/react-router";
import { Effect, Option } from "effect";
import { ApiClient } from "./Api.ts";
import { Session } from "./Session.ts";

/** An API client acting as the signed-in user. */
export const asUser = Effect.gen(function* () {
  const session = yield* Session;
  const token = yield* session.accessToken;
  if (Option.isNone(token)) return yield* Effect.die(redirect({ to: "/login" }));
  return yield* (yield* ApiClient).as(token.value);
});

export const orNotFound = <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(Effect.catchAll(() => Effect.die(notFound())));

// ---------------------------------------------------------------------------
// Forms post FormData

export const formData = (data: unknown) => {
  if (!(data instanceof FormData)) throw new Error("Expected form data");
  return data;
};

export function text(form: FormData, key: string, max: number): string | null {
  const value = form.get(key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed.length ? trimmed : null;
}

export function url(form: FormData, key: string, max = 200): string | null {
  const value = text(form, key, max);
  if (!value) return null;
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const parsed = new URL(withScheme);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}
