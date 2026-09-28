import { createFileRoute, Link } from "@tanstack/react-router";
import type { Theme, User } from "@waifu-devs/domain/api";
import { BANNER_LABELS, BANNERS, type Banner, MAX_SKILLS } from "@waifu-devs/domain/profile";
import { type ThemeVariant, themeStyle } from "@waifu-devs/domain/themes";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { ProfileBanner } from "@/components/ProfileBanner";
import { ProfileCard, type ProfileView } from "@/components/ProfileCard";
import { LinksInput, PickerOption, SkillsInput, TextField } from "@/components/ProfileFields";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { title } from "@/lib/head";
import { getProfileEditor, updateProfile } from "@/server/functions";

export const Route = createFileRoute("/settings")({
  loader: () => getProfileEditor(),
  head: () => ({ meta: [title("Customize your profile")] }),
  component: SettingsPage,
});

type Draft = {
  displayName: string;
  pronouns: string;
  location: string;
  status: string;
  bio: string;
  favoriteWaifu: string;
  website: string;
  skills: string[];
  links: string[];
  banner: Banner;
  /** Empty means "the theme I wear". */
  profileThemeId: string;
};

const draftOf = (user: User): Draft => ({
  displayName: user.displayName ?? "",
  pronouns: user.pronouns ?? "",
  location: user.location ?? "",
  status: user.status ?? "",
  bio: user.bio ?? "",
  favoriteWaifu: user.favoriteWaifu ?? "",
  website: user.website ?? "",
  skills: [...user.skills],
  links: [...user.links],
  banner: user.banner,
  profileThemeId: user.profileThemeId ?? "",
});

const orNull = (value: string) => value.trim() || null;
const previewUrl = (value: string) => {
  const url = value.trim();
  return url ? (/^https?:\/\//i.test(url) ? url : `https://${url}`) : null;
};

function SettingsPage() {
  const data = Route.useLoaderData();
  // Keyed on the saved values, so the editor starts over from them after a save.
  return <ProfileEditor key={JSON.stringify(data.user)} {...data} />;
}

type Themes = readonly Theme[];

function ProfileEditor({ user, worn, mine, builtin, community }: { user: User; worn: Theme; mine: Themes; builtin: Themes; community: Themes }) {
  const [initial] = useState(() => draftOf(user));
  const [draft, setDraft] = useState(initial);
  const set = <K extends keyof Draft>(key: K) => (value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);

  const theme = (draft.profileThemeId && [...mine, ...builtin, ...community].find((t) => t.id === draft.profileThemeId)) || worn;
  const preview: ProfileView = {
    username: user.username,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt,
    displayName: orNull(draft.displayName),
    pronouns: orNull(draft.pronouns),
    location: orNull(draft.location),
    status: orNull(draft.status),
    favoriteWaifu: orNull(draft.favoriteWaifu),
    website: previewUrl(draft.website),
    skills: draft.skills,
    links: draft.links.flatMap((link) => previewUrl(link) ?? []),
    banner: draft.banner,
  };

  const themeOption = (t: Theme, value = t.id, label = t.name, sub?: string) => (
    <PickerOption key={value || "worn"} name="profile_theme_id" value={value} ring="profile-theme" selected={draft.profileThemeId === value} onSelect={() => set("profileThemeId")(value)}>
      <ThemeChip variant={t.variant} />
      <span className="truncate px-0.5 text-xs font-bold">{label}</span>
      {sub ? <span className="-mt-1.5 truncate px-0.5 text-[11px] text-muted-foreground">{sub}</span> : null}
    </PickerOption>
  );
  const themeGroups = [
    { label: "Yours", themes: mine },
    { label: "Built-in", themes: builtin },
    { label: "From the community", themes: community },
  ];

  const saveButton = (
    <Button type="submit" className="btn rounded-full font-bold">
      <span className="group-aria-busy:hidden">Save profile</span>
      <span className="hidden group-aria-busy:inline">Saving...</span>
    </Button>
  );
  const unsaved = (
    <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
      <span className="status-dot" /> Unsaved changes
    </span>
  );

  return (
    <main className="mx-auto max-w-6xl px-4 py-12">
      <ActionForm action={updateProfile} className="group grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)]">
        <div className="stagger flex min-w-0 flex-col gap-6">
          <div>
            <h1 className="text-3xl font-extrabold">
              Customize your profile <span className="float inline-block text-primary">✦</span>
            </h1>
            <p className="text-muted-foreground">
              Everyone who visits{" "}
              <Link className="text-primary hover:underline" to="/u/$username" params={{ username: user.username }}>
                u/{user.username}
              </Link>{" "}
              sees it just like the preview. Your avatar and username come from GitHub.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Look</CardTitle>
              <CardDescription>Pick the theme and banner visitors see your profile in, whatever theme they wear themselves.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              <fieldset className="flex min-w-0 flex-col gap-3">
                <legend className="mb-3 text-sm font-bold">Profile theme</legend>
                <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 md:grid-cols-4">{themeOption(worn, "", "Same as I wear", worn.name)}</div>
                <div className="flex max-h-96 flex-col gap-3 overflow-y-auto p-0.5">
                  {themeGroups.map((group) =>
                    group.themes.length ? (
                      <div key={group.label} className="flex flex-col gap-1">
                        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{group.label}</p>
                        <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 md:grid-cols-4">{group.themes.map((t) => themeOption(t))}</div>
                      </div>
                    ) : null,
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  You browse the site in <b className="text-foreground">{worn.name}</b>.{" "}
                  <Link to="/themes" className="text-primary hover:underline">
                    Change that on Themes
                  </Link>{" "}
                  or make your own.
                </p>
              </fieldset>

              <fieldset className="flex min-w-0 flex-col gap-3">
                <legend className="mb-3 text-sm font-bold">Banner</legend>
                {/* Drawn in the profile theme, the way visitors will see it. */}
                <div className="themed grid grid-cols-2 gap-1 rounded-xl border p-2 sm:grid-cols-3" style={themeStyle(theme.variant)}>
                  {BANNERS.map((b) => (
                    <PickerOption key={b} name="banner" value={b} ring="profile-banner" selected={draft.banner === b} onSelect={() => set("banner")(b)}>
                      <ProfileBanner banner={b} className="h-14 rounded-lg border" />
                      <span className="px-0.5 text-xs font-bold">{BANNER_LABELS[b]}</span>
                    </PickerOption>
                  ))}
                </div>
              </fieldset>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>About you</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <TextField id="display_name" label="Display name" max={60} value={draft.displayName} onChange={set("displayName")} placeholder={user.username} />
              <TextField id="status" label="Status" max={80} value={draft.status} onChange={set("status")} placeholder="Shipping a tiny compiler, send snacks" />
              <div className="grid gap-5 sm:grid-cols-2">
                <TextField id="pronouns" label="Pronouns" max={30} value={draft.pronouns} onChange={set("pronouns")} />
                <TextField id="location" label="Location" max={60} value={draft.location} onChange={set("location")} placeholder="Tokyo, or the cloud" />
              </div>
              <TextField id="favorite_waifu" label="Favorite waifu" max={80} value={draft.favoriteWaifu} onChange={set("favoriteWaifu")} placeholder="Best girl goes here" />
              <TextField id="bio" label="Bio" max={500} rows={5} value={draft.bio} onChange={set("bio")} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Skills and links</CardTitle>
              <CardDescription>Up to {MAX_SKILLS} skills, your website, and a few more links.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <div className="grid gap-2">
                <span className="text-sm font-medium">Skills</span>
                <SkillsInput value={draft.skills} onChange={set("skills")} />
              </div>
              <TextField id="website" label="Website" max={200} value={draft.website} onChange={set("website")} placeholder="https://" />
              <div className="grid gap-2">
                <span className="text-sm font-medium">More links</span>
                <LinksInput initial={initial.links} onChange={set("links")} />
              </div>
            </CardContent>
          </Card>
        </div>

        <aside className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-20">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Live preview</p>
            <Link to="/u/$username" params={{ username: user.username }} className="nav-link text-sm font-bold text-primary">
              View profile
            </Link>
          </div>
          {/* The preview wears the profile theme; picking another morphs it in place. */}
          <div className="themed flex flex-col gap-3 rounded-2xl border p-3 shadow-sm" style={themeStyle(theme.variant)}>
            <ProfileCard profile={preview} nameAs="p" />
            {draft.bio.trim() ? (
              <Card className="gap-0 p-4">
                <p className="line-clamp-4 whitespace-pre-line break-words text-sm">{draft.bio}</p>
              </Card>
            ) : null}
          </div>
          <div className="hidden items-center justify-end gap-4 lg:flex">
            {dirty ? unsaved : null}
            {saveButton}
          </div>
        </aside>

        {/* On small screens the preview sits below the form, so saving slides up from the bottom. */}
        <AnimatePresence>
          {dirty ? (
            <motion.div
              initial={{ y: "110%" }}
              animate={{ y: 0 }}
              exit={{ y: "110%" }}
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
              className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-between gap-4 border-t bg-card/90 px-4 py-3 backdrop-blur-md lg:hidden"
            >
              {unsaved}
              {saveButton}
            </motion.div>
          ) : null}
        </AnimatePresence>
        {!dirty ? <div className="flex justify-end lg:hidden">{saveButton}</div> : null}
      </ActionForm>
    </main>
  );
}

/** A tiny sample of a theme: its background, a primary dot and two lines of text. */
function ThemeChip({ variant }: { variant: ThemeVariant }) {
  return (
    <span className="flex h-11 items-center gap-2 rounded-lg border bg-background px-2.5" style={themeStyle(variant)}>
      <span className="size-5 shrink-0 rounded-full bg-primary shadow-sm" />
      <span className="flex flex-1 flex-col gap-1">
        <span className="h-1.5 w-4/5 rounded-full bg-foreground" />
        <span className="h-1.5 w-1/2 rounded-full bg-muted-foreground" />
      </span>
    </span>
  );
}
