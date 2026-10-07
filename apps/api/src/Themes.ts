import { SqlClient } from "@effect/sql";
import {
  type MarketTheme,
  type NewTheme,
  type Theme,
  type ThemeFilters,
  THEME_PAGE_SIZE,
  type ThemeSort,
  ThemeVariant,
} from "@waifu-devs/domain/api";
import { BUILTIN_THEMES, colorOf, CORNER_BOUNDS, DEFAULT_THEME, modeOf, PERIOD_DAYS } from "@waifu-devs/domain/themes";
import { and, count, desc, eq, getTableColumns, gte, ilike, inArray, isNull, lt, ne, or, type SQL, sql } from "drizzle-orm";
import { Effect, Option, Schema } from "effect";
import { Db } from "./Db.ts";
import { themeVotes, themes, users } from "./schema.ts";

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

/** How many members wear a theme right now. */
const wearers = sql<number>`(select count(*)::int from ${users} where ${users.themeId} = ${themes.id}::text)`;

/**
 * Trending: hearts decaying with age, like News but gentler, since a good theme stays
 * good for longer than a link does. The +1 lets brand new themes with no hearts yet
 * still take turns at the top.
 */
const trending = sql`(${themes.score} + 1) / power(extract(epoch from now() - ${themes.createdAt}) / 3600 + 2, 1.2)`;

const ORDER = {
  top: [desc(trending), desc(themes.createdAt)],
  loved: [desc(themes.score), desc(themes.createdAt)],
  worn: [desc(wearers), desc(themes.score), desc(themes.createdAt)],
  new: [desc(themes.createdAt)],
} as const;

/** `q` as a LIKE pattern that matches it anywhere, its wildcards taken literally. */
const contains = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** The theme's corner radius, from its variant. */
const radius = sql<number>`(${themes.variant}->>'radius')::float8`;

const CORNERS = {
  sharp: lt(radius, CORNER_BOUNDS.soft),
  soft: and(gte(radius, CORNER_BOUNDS.soft), lt(radius, CORNER_BOUNDS.round)),
  round: gte(radius, CORNER_BOUNDS.round),
} as const;

/** The marketplace's filters as conditions; any left out match everything. */
function filtering(filters: ThemeFilters, viewerId: string | null): Array<SQL | undefined> {
  return [
    filters.mode ? eq(themes.mode, filters.mode) : undefined,
    filters.color ? eq(themes.color, filters.color) : undefined,
    filters.corners ? CORNERS[filters.corners] : undefined,
    filters.period ? sql`${themes.createdAt} > now() - make_interval(days => ${PERIOD_DAYS[filters.period]})` : undefined,
    // Signed out, nobody's hearts to show.
    filters.hearted
      ? viewerId
        ? sql`exists (select 1 from ${themeVotes} where ${themeVotes.themeId} = ${themes.id} and ${themeVotes.userId} = ${viewerId})`
        : sql`false`
      : undefined,
  ];
}

/** The filter columns for a variant. */
const classify = (variant: ThemeVariant) => ({ mode: modeOf(variant.tokens), color: colorOf(variant.tokens) });

type MarketRow = Row & { wearers: number; voted: boolean };

const toMarketTheme = (row: MarketRow): MarketTheme => ({
  ...toTheme(row),
  score: row.score,
  wearers: row.wearers,
  voted: row.voted,
  createdAt: row.createdAt,
});

export class Themes extends Effect.Service<Themes>()("Themes", {
  effect: Effect.gen(function* () {
    const db = yield* Db;
    const client = yield* SqlClient.SqlClient;

    // Themes saved before the marketplace had filters get their mode and color now,
    // in the background (it's quick, and a no-op once they all have them).
    yield* db
      .select({ id: themes.id, variant: themes.variant })
      .from(themes)
      .where(or(isNull(themes.mode), isNull(themes.color)))
      .pipe(
        Effect.flatMap((rows) =>
          Effect.forEach(rows, (row) => {
            const variant = decodeVariant(row.variant);
            return Option.isSome(variant) ? Effect.asVoid(db.update(themes).set(classify(variant.value)).where(eq(themes.id, row.id))) : Effect.void;
          }),
        ),
        Effect.catchAllCause((cause) => Effect.logWarning("Couldn't classify themes for the marketplace's filters", cause)),
        Effect.forkDaemon,
      );

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

    /** Members' themes with their hearts and wearers, and whether `viewerId` (if anyone) has hearted each. */
    const selectMarket = (viewerId: string | null) =>
      db
        .select({
          ...getTableColumns(themes),
          ownerUsername: users.username,
          wearers,
          voted: viewerId
            ? sql<boolean>`exists (select 1 from ${themeVotes} where ${themeVotes.themeId} = ${themes.id} and ${themeVotes.userId} = ${viewerId})`
            : sql<boolean>`false`,
        })
        .from(themes)
        .innerJoin(users, eq(users.id, themes.ownerId));

    /**
     * One page of public themes, sorted, narrowed by the filters and to those whose name,
     * description or maker matches `q`; and how many match in all.
     */
    const market = (options: { sort: ThemeSort; q: string; page: number; filters: ThemeFilters; viewerId: string | null }) => {
      const q = options.q.trim();
      const matches = q
        ? or(ilike(themes.name, contains(q)), ilike(themes.description, contains(q)), ilike(users.username, contains(q)))
        : undefined;
      const where = and(eq(themes.isPublic, true), matches, ...filtering(options.filters, options.viewerId));
      return Effect.all(
        [
          selectMarket(options.viewerId)
            .where(where)
            .orderBy(...ORDER[options.sort])
            .limit(THEME_PAGE_SIZE + 1)
            .offset((options.page - 1) * THEME_PAGE_SIZE),
          db.select({ n: count() }).from(themes).innerJoin(users, eq(users.id, themes.ownerId)).where(where),
        ],
        { concurrency: 2 },
      ).pipe(
        Effect.map(([rows, [counted]]) => ({
          themes: rows.slice(0, THEME_PAGE_SIZE).map(toMarketTheme),
          hasMore: rows.length > THEME_PAGE_SIZE,
          total: counted?.n ?? 0,
        })),
      );
    };

    /** The built-ins, with how many members wear each. */
    const builtins = () =>
      db
        .select({ themeId: users.themeId, n: count() })
        .from(users)
        .where(inArray(users.themeId, BUILTIN_THEMES.map((t) => t.id)))
        .groupBy(users.themeId)
        .pipe(
          Effect.map((rows): MarketTheme[] => {
            const worn = new Map(rows.map((r) => [r.themeId, r.n]));
            return BUILTIN_THEMES.map((t) => ({ ...t, score: 0, wearers: worn.get(t.id) ?? 0, voted: false, createdAt: null }));
          }),
        );

    /**
     * A theme's page: a built-in, a public theme, or a private one shown to its owner;
     * with up to six of the maker's other public themes, most loved first.
     */
    const details = (id: string, viewerId: string | null) =>
      Effect.gen(function* () {
        if (BUILTIN_THEMES.some((t) => t.id === id)) {
          const all = yield* builtins();
          const theme = all.find((t) => t.id === id)!;
          return Option.some({ theme, more: all.filter((t) => t.id !== id) });
        }
        if (!isUuid(id)) return Option.none();
        const [row] = yield* selectMarket(viewerId).where(eq(themes.id, id));
        if (!row || (!row.isPublic && row.ownerId !== viewerId)) return Option.none();
        const more = yield* selectMarket(viewerId)
          .where(and(eq(themes.ownerId, row.ownerId), eq(themes.isPublic, true), ne(themes.id, id)))
          .orderBy(...ORDER.loved)
          .limit(6);
        return Option.some({ theme: toMarketTheme(row), more: more.map(toMarketTheme) });
      });

    /** Who made a theme anyone may heart (a public member's theme). */
    const heartable = (id: string) =>
      isUuid(id)
        ? db
            .select({ ownerId: themes.ownerId })
            .from(themes)
            .where(and(eq(themes.id, id), eq(themes.isPublic, true)))
            .pipe(Effect.map((rows) => Option.fromNullable(rows[0]?.ownerId)))
        : Effect.succeed(Option.none<string>());

    /** Adds (`up`) or takes back a member's heart. Hearting twice, or unhearting twice, changes nothing. */
    const vote = (userId: string, themeId: string, up: boolean) =>
      client.withTransaction(
        Effect.gen(function* () {
          const changed = up
            ? yield* db.insert(themeVotes).values({ themeId, userId }).onConflictDoNothing().returning({ themeId: themeVotes.themeId })
            : yield* db
                .delete(themeVotes)
                .where(and(eq(themeVotes.themeId, themeId), eq(themeVotes.userId, userId)))
                .returning({ themeId: themeVotes.themeId });
          const [theme] = changed.length
            ? yield* db
                .update(themes)
                .set({ score: sql`${themes.score} + ${up ? 1 : -1}` })
                .where(eq(themes.id, themeId))
                .returning({ score: themes.score })
            : yield* db.select({ score: themes.score }).from(themes).where(eq(themes.id, themeId));
          return { score: theme?.score ?? 0, voted: up };
        }),
      );

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
            .values({
              ownerId: owner.id,
              name: input.name,
              description: input.description,
              variant: input.variant,
              isPublic: input.isPublic,
              ...classify(input.variant),
            })
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

    return { get, community, byOwner, market, builtins, details, heartable, vote, canWear, create, remove } as const;
  }),
}) {}
