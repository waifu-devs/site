import { AsyncLocalStorage } from "node:async_hooks";
import { deleteCookie, getCookie, getRequest, setCookie } from "@tanstack/react-start/server";
import { Context } from "effect";

type CookieOptions = Parameters<typeof setCookie>[2];

/**
 * The incoming request an Effect is running for.
 *
 * TanStack Start finds the current request through AsyncLocalStorage, but Effect's
 * scheduler can resume one request's fiber inside another request's async context.
 * So the context is captured once, when the Effect starts, and every cookie read or
 * write is replayed inside it.
 */
export class RequestContext extends Context.Tag("RequestContext")<
  RequestContext,
  {
    readonly request: Request;
    readonly getCookie: (name: string) => string | undefined;
    readonly setCookie: (name: string, value: string, options?: CookieOptions) => void;
    readonly deleteCookie: (name: string, options?: CookieOptions) => void;
  }
>() {
  /** Must be called synchronously inside the request (before any Effect runs). */
  static capture() {
    const within = AsyncLocalStorage.snapshot();
    return RequestContext.of({
      request: within(getRequest),
      getCookie: (name) => within(() => getCookie(name)),
      setCookie: (name, value, options) => within(() => setCookie(name, value, options)),
      deleteCookie: (name, options) => within(() => deleteCookie(name, options)),
    });
  }
}
