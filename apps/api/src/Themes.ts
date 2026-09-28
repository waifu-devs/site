import { SqlClient } from "@effect/sql";
import { type NewTheme, type Theme, ThemeVariant } from "@waifu-devs/domain/api";
import { BUILTIN_THEMES, DEFAULT_THEME } from "@waifu-devs/domain/themes";
import { and, count, desc, eq, getTableColumns, or } from "drizzle-orm";
import { Effect, Option, Schema } from "effect";
import { Db } from "./Db.ts";
import { themes, users } from "./schema.ts";

const isUuid = Schema.is(Schema.UUID);
const decodeVariant = Schema.decodeUnknownOption(ThemeVariant);

type Row = typeof themes.$inferSelect & { ownerUsername: string };

const toTheme = (row: Row): Theme => ({
  id: row.id,
  name: row.name,
  description: row.description,
  // Stored variants were validated on the way in; fall back rather than fail if one isn't.
  variant: Option.getOrElse(decodeVariant(row.variant), () => DEFAULT_THEME.variant),
  builtin: false,
  isPublic: row.isPublic,
  ownerUsername: row.ownerUsername,
});

export class Themes extends Effect.Service<Themes>()("Themes", {
  effect: Effect.gen(function* () {
    const db = yield* Db;
    const client = yield* SqlClient.SqlClient;

    const select = () =>
      db
        .select({ ...getTableColumns(themes), ownerUsername: users.username })
        .from(themes)
        .innerJoin(users, eq(users.id, themes.ownerId));

    /** A built-in theme, or a member's theme by id (private themes included: ids are unguessable). */
    const get = (id: string): Effect.Effect<Option.Option<Theme>, unknown> => {
      const builtin = BUILTIN_THEMES.find((t) => t.id === id);
      if (builtin) return Effect.succeed(Option.some(builtin));
      if (!isUuid(id)) return Effect.succeed(Option.none());
      return select()
        .where(eq(themes.id, id))
        .pipe(Effect.map((rows) => Option.fromNullable(rows[0]).pipe(Option.map(toTheme))));
    };

    const community = (limit = 48) =>
      select()
        .where(eq(themes.isPublic, true))
        .orderBy(desc(themes.createdAt))
        .limit(limit)
        .pipe(Effect.map((rows) => rows.map(toTheme)));

    const byOwner = (ownerId: string, options: { includePrivate: boolean }) =>
      select()
        .where(options.includePrivate ? eq(themes.ownerId, ownerId) : and(eq(themes.ownerId, ownerId), eq(themes.isPublic, true)))
        .orderBy(desc(themes.createdAt))
        .pipe(Effect.map((rows) => rows.map(toTheme)));

    /** A user may wear any built-in theme, any public theme, or their own private ones. */
    const canWear = (userId: string, themeId: string) => {
      if (BUILTIN_THEMES.some((t) => t.id === themeId)) return Effect.succeed(true);
      if (!isUuid(themeId)) return Effect.succeed(false);
      return db
        .select({ n: count() })
        .from(themes)
        .where(and(eq(themes.id, themeId), or(eq(themes.isPublic, true), eq(themes.ownerId, userId))))
        .pipe(Effect.map((rows) => (rows[0]?.n ?? 0) > 0));
    };

    /** Saves a new theme and puts it on its owner. */
    const create = (owner: { id: string; username: string }, input: NewTheme) =>
      client.withTransaction(
        Effect.gen(function* () {
          const [row] = yield* db
            .insert(themes)
            .values({ ownerId: owner.id, name: input.name, description: input.description, variant: input.variant, isPublic: input.isPublic })
            .returning();
          yield* db.update(users).set({ themeId: row.id }).where(eq(users.id, owner.id));
          return toTheme({ ...row, ownerUsername: owner.username });
        }),
      );

    /**
     * Deletes a member's own theme. Anyone wearing it falls back to the default,
     * and profiles shown in it go back to their owner's worn theme.
     */
    const remove = (ownerId: string, themeId: string) =>
      isUuid(themeId)
        ? client.withTransaction(
            Effect.gen(function* () {
              const deleted = yield* db
                .delete(themes)
                .where(and(eq(themes.id, themeId), eq(themes.ownerId, ownerId)))
                .returning({ id: themes.id });
              if (deleted.length) {
                yield* db.update(users).set({ themeId: DEFAULT_THEME.id }).where(eq(users.themeId, themeId));
                yield* db.update(users).set({ profileThemeId: null }).where(eq(users.profileThemeId, themeId));
              }
              return deleted.length > 0;
            }),
          )
        : Effect.succeed(false);

    return { get, community, byOwner, canWear, create, remove } as const;
  }),
}) {}
