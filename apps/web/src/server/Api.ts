import { FetchHttpClient, HttpApiClient, HttpClient, HttpClientRequest } from "@effect/platform";
import { Api } from "@waifu-devs/domain/api";
import { Config, Effect } from "effect";

/** Where things live: this site's public URL, and the API's public and internal URLs. */
export class Urls extends Effect.Service<Urls>()("Urls", {
  effect: Effect.gen(function* () {
    const web = new URL(yield* Config.string("WEB_URL"));
    // The API's public URL is also the OpenAuth issuer the browser is sent to.
    const api = new URL(yield* Config.string("API_URL"));
    // Server-to-server calls can take Railway's private network instead.
    const apiInternal = new URL(yield* Config.string("API_INTERNAL_URL").pipe(Config.withDefault(api.href)));
    return { web: web.origin, api: api.origin, apiInternal: apiInternal.origin, secure: web.protocol === "https:" } as const;
  }),
}) {}

/** Typed clients for the API contract in @waifu-devs/domain. */
export class ApiClient extends Effect.Service<ApiClient>()("ApiClient", {
  effect: Effect.gen(function* () {
    const urls = yield* Urls;
    const http = yield* HttpClient.HttpClient;
    const anonymous = yield* HttpApiClient.make(Api, { baseUrl: urls.apiInternal });
    /** A client that calls the API as the signed-in user. */
    const as = (accessToken: string) =>
      HttpApiClient.make(Api, {
        baseUrl: urls.apiInternal,
        transformClient: HttpClient.mapRequest(HttpClientRequest.bearerToken(accessToken)),
      }).pipe(Effect.provideService(HttpClient.HttpClient, http));
    return { anonymous, as } as const;
  }),
  dependencies: [Urls.Default, FetchHttpClient.layer],
}) {}
