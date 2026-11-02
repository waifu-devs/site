import { HttpServerRequest, HttpServerResponse } from "@effect/platform";
import { Effect } from "effect";

/**
 * Holds a body to `limit` bytes however it's sent. Node's server stopped reading
 * a body as soon as it passed the limit; Bun's hands it over as it came. So a
 * body without a Content-Length (sent in chunks) is read here first, stopping as
 * soon as it passes the limit. Gives the request with that body in hand, or the
 * answer when there's none to give: 413 past the limit, 400 when the body broke
 * off. One with a Content-Length is left as it is, since the caller has already
 * held that to the limit and Bun holds the body to its Content-Length.
 */
export const boundBody = (
  request: HttpServerRequest.HttpServerRequest,
  limit: number,
): Effect.Effect<HttpServerRequest.HttpServerRequest | HttpServerResponse.HttpServerResponse> =>
  Effect.gen(function* () {
    if (request.headers["content-length"] !== undefined) return request;
    const source = yield* HttpServerRequest.toWeb(request);
    if (!source.body) return request;
    const body = yield* Effect.tryPromise(() => readLimited(source.body!, limit));
    if (!body) return HttpServerResponse.empty({ status: 413 });
    // The same request with the body read here as its source, since Bun's server
    // answers through the request it made. Every way of reading a body
    // (text, json, arrayBuffer, stream...) reads it from `source`.
    const read = new Request(source.url, { method: source.method, headers: source.headers, body });
    return new Proxy(request, { get: (target, key, receiver) => (key === "source" ? read : Reflect.get(target, key, receiver)) });
  }).pipe(Effect.orElseSucceed(() => HttpServerResponse.empty({ status: 400 })));

/** The whole stream, or null as soon as it passes `max` bytes. */
async function readLimited(stream: ReadableStream<Uint8Array>, max: number): Promise<Uint8Array | null> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of stream) {
    size += chunk.byteLength;
    if (size > max) {
      await stream.cancel().catch(() => {});
      return null;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
