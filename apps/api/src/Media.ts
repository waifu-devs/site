import { DeleteObjectCommand, GetObjectCommand, NoSuchKey, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { FileSystem, HttpApiBuilder, HttpRouter, HttpServerResponse } from "@effect/platform";
import { NodeFileSystem } from "@effect/platform-node";
import { ImageRejected, type ImageKind } from "@waifu-devs/domain/api";
import { IMAGE_SIZES } from "@waifu-devs/domain/profile";
import { sql } from "drizzle-orm";
import { Config, Context, Effect, Layer, Option, Redacted } from "effect";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { users } from "./schema.ts";

/**
 * Where uploaded pictures live. Keys are flat file names; values are the
 * processed WebP bytes. The rest of the API only sees this interface.
 */
export class MediaStore extends Context.Tag("MediaStore")<
  MediaStore,
  {
    readonly put: (key: string, bytes: Uint8Array) => Effect.Effect<void, unknown>;
    readonly get: (key: string) => Effect.Effect<Option.Option<Uint8Array>, unknown>;
    readonly remove: (key: string) => Effect.Effect<void>;
  }
>() {}

/**
 * The Railway bucket (S3-compatible, private). Railway buckets have no public
 * URLs, so pictures are served through the api at /media/<key>.
 */
const bucketStore = (bucket: string) =>
  Effect.gen(function* () {
    const s3 = new S3Client({
      endpoint: yield* Config.string("S3_ENDPOINT"),
      region: yield* Config.string("S3_REGION").pipe(Config.withDefault("auto")),
      forcePathStyle: yield* Config.boolean("S3_FORCE_PATH_STYLE").pipe(Config.withDefault(false)),
      credentials: {
        accessKeyId: yield* Config.string("S3_ACCESS_KEY_ID"),
        secretAccessKey: Redacted.value(yield* Config.redacted("S3_SECRET_ACCESS_KEY")),
      },
    });
    return MediaStore.of({
      put: (key, bytes) =>
        Effect.tryPromise(() =>
          s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentType: "image/webp" })),
        ),
      get: (key) =>
        Effect.tryPromise({
          try: async () => {
            const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
            return object.Body ? Option.some(await object.Body.transformToByteArray()) : Option.none<Uint8Array>();
          },
          catch: (error) => error,
        }).pipe(Effect.catchIf((error) => error instanceof NoSuchKey, () => Effect.succeedNone)),
      remove: (key) =>
        Effect.tryPromise(() => s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))).pipe(Effect.ignoreLogged),
    });
  });

/** A local directory, for development without a bucket. */
const directoryStore = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const dir = yield* Config.string("UPLOADS_DIR").pipe(Config.withDefault("uploads"));
  yield* fs.makeDirectory(dir, { recursive: true });
  const path = (key: string) => `${dir}/${key}`;
  return MediaStore.of({
    put: (key, bytes) => fs.writeFile(path(key), bytes),
    get: (key) =>
      fs.readFile(path(key)).pipe(
        Effect.map(Option.some),
        Effect.catchIf(
          (error) => error._tag === "SystemError" && error.reason === "NotFound",
          () => Effect.succeedNone,
        ),
      ),
    remove: (key) => fs.remove(path(key)).pipe(Effect.ignoreLogged),
  });
});

/** The bucket named by S3_BUCKET, or a local directory when it isn't set. */
export const MediaStoreLive = Layer.effect(
  MediaStore,
  Effect.gen(function* () {
    const bucket = yield* Config.option(Config.string("S3_BUCKET"));
    if (Option.isSome(bucket)) return yield* bucketStore(bucket.value);
    yield* Effect.logWarning("S3_BUCKET is not set; storing uploaded pictures in a local directory.");
    return yield* directoryStore;
  }),
).pipe(Layer.provide(NodeFileSystem.layer));

/** Stored pictures are served by this api (the OpenAuth issuer) at /media/<key>. */
const mediaBase = Config.string("ISSUER_URL").pipe(Config.map((url) => `${url.replace(/\/$/, "")}/media/`));

export const mediaUrl = mediaBase.pipe(Config.map((base) => (key: string) => base + key));

/** A member's picture as a SQL column: the one they uploaded, else their GitHub avatar. */
export const avatarColumn = mediaBase.pipe(
  Config.map((base) => sql<string | null>`coalesce(${base}::text || ${users.avatarKey}, ${users.avatarUrl})`),
);

/** Every key this API hands out: `<kind>-<user id>-<random>.webp`. Anything else is never read. */
const KEY = /^(avatar|banner)-[0-9a-f-]{36}-[0-9a-f]{16}\.webp$/;

export const newKey = (kind: ImageKind, userId: string) => `${kind}-${userId}-${randomBytes(8).toString("hex")}.webp`;

// Decompression bombs and endless animations are refused before any real work.
const MAX_INPUT_PIXELS = 40_000_000;
const MAX_FRAMES = 300;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const FORMATS = new Set(["jpeg", "png", "webp", "gif"]);

/**
 * Checks an upload really is a JPEG, PNG, WebP or GIF (by its bytes, not its
 * name), then crops and resizes it to the kind's size as WebP. Animated GIFs
 * and WebPs stay animated. Metadata such as EXIF location is dropped.
 */
export const processImage = (kind: ImageKind, bytes: Uint8Array): Effect.Effect<Uint8Array, ImageRejected> =>
  Effect.gen(function* () {
    const reject = (reason: string) => new ImageRejected({ reason });
    const unreadable = (error: unknown) =>
      String(error).includes("pixel limit")
        ? reject("That image is too big to process. Try one under 40 megapixels.")
        : reject("That file couldn't be read as an image.");
    const meta = yield* Effect.tryPromise({
      try: () => sharp(bytes, { animated: true, limitInputPixels: MAX_INPUT_PIXELS }).metadata(),
      catch: unreadable,
    });
    if (!meta.format || !FORMATS.has(meta.format)) return yield* reject("Upload a JPEG, PNG, WebP or GIF image.");
    const frames = meta.pages ?? 1;
    if (frames > MAX_FRAMES) return yield* reject(`That animation is too long (${MAX_FRAMES} frames at most).`);

    const { width, height } = IMAGE_SIZES[kind];
    const animated = frames > 1;
    const output = yield* Effect.tryPromise({
      try: () => {
        const image = sharp(bytes, { animated, limitInputPixels: MAX_INPUT_PIXELS });
        // Only still images can be turned upright from EXIF or cropped around their subject.
        if (!animated) image.autoOrient();
        return image
          .resize({ width, height, fit: "cover", position: animated ? "centre" : "attention" })
          .webp({ quality: 82, effort: 4 })
          .toBuffer();
      },
      catch: unreadable,
    });
    if (output.byteLength > MAX_OUTPUT_BYTES) return yield* reject("That animation is too big even after resizing. Try a shorter one.");
    return new Uint8Array(output);
  });

/** Serves stored pictures at /media/<key>. Keys never change, so they cache forever. */
export const MediaRoutes = HttpApiBuilder.Router.use((router) =>
  Effect.gen(function* () {
    const store = yield* MediaStore;
    yield* router.get(
      "/media/:key",
      Effect.gen(function* () {
        const { key } = yield* HttpRouter.params;
        if (!key || !KEY.test(key)) return HttpServerResponse.empty({ status: 404 });
        const bytes = yield* store.get(key).pipe(Effect.orElseSucceed(() => Option.none<Uint8Array>()));
        if (Option.isNone(bytes)) return HttpServerResponse.empty({ status: 404 });
        return HttpServerResponse.uint8Array(bytes.value, {
          contentType: "image/webp",
          headers: { "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff" },
        });
      }),
    );
  }),
);
