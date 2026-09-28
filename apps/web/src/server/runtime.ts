import { Cause, Effect, Exit, Layer, ManagedRuntime } from "effect";
import { ApiClient, Urls } from "./Api.ts";
import { RequestContext } from "./Request.ts";
import { Session } from "./Session.ts";

type Services = Session | ApiClient | Urls;

let runtime: ManagedRuntime.ManagedRuntime<Services, never> | undefined;

/**
 * Runs a server-side Effect for a loader, server function or server route.
 * Failures are rethrown as-is, so `redirect()` / `notFound()` thrown with
 * `Effect.die` reach TanStack Router untouched.
 */
export async function run<A, E>(effect: Effect.Effect<A, E, Services | RequestContext>): Promise<A> {
  const request = RequestContext.capture();
  runtime ??= ManagedRuntime.make(Layer.mergeAll(Session.Default, ApiClient.Default, Urls.Default).pipe(Layer.orDie));
  const exit = await runtime.runPromiseExit(Effect.provideService(effect, RequestContext, request));
  if (Exit.isSuccess(exit)) return exit.value;
  throw Cause.squash(exit.cause);
}
