import { createFileRoute, Link } from "@tanstack/react-router";
import type { Repo, Theme, User } from "@waifu-devs/domain/api";
import { BANNER_LABELS, BANNERS, type Banner, IMAGE_SIZES, MAX_FEATURED_REPOS, MAX_IMAGE_BYTES, MAX_SKILLS } from "@waifu-devs/domain/profile";
import { type ThemeVariant, themeStyle } from "@waifu-devs/domain/themes";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { UserAvatar } from "@/components/Avatar";
import { BugReportsSetting } from "@/components/BugReports";
import { ImageDrop, type ImageUpload, useImageUpload } from "@/components/ImageUpload";
import { Markdown } from "@/components/Markdown";
import { ProfileBanner } from "@/components/ProfileBanner";
import { ProfileCard, type ProfileView } from "@/components/ProfileCard";
import { CountryPicker, LinksInput, PickerOption, SkillsInput, TextField } from "@/components/ProfileFields";
import { RepoCard } from "@/components/RepoCard";
import { RepoPicker } from "@/components/RepoPicker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  /** An ISO 3166-1 alpha-2 code, or null for no country. */
  country: string | null;
  showCountry: boolean;
  status: string;
  bio: string;
  favoriteWaifu: string;
  website: string;
  skills: string[];
  links: string[];
  banner: Banner;
  /** Empty means "the theme I wear". */
  profileThemeId: string;
  /** Featured on the profile, in this order. */
  repos: Repo[];
};

const draftOf = (user: User, repos: readonly Repo[]): Draft => ({
  displayName: user.displayName ?? "",
  pronouns: user.pronouns ?? "",
  location: user.location ?? "",
  country: user.country,
  showCountry: user.showCountry,
  status: user.status ?? "",
  bio: user.bio ?? "",
  favoriteWaifu: user.favoriteWaifu ?? "",
  website: user.website ?? "",
  skills: [...user.skills],
  links: [...user.links],
  banner: user.banner,
  profileThemeId: user.profileThemeId ?? "",
  repos: [...repos],
});

/**
 * A draft as a string, for telling whether anything changed. Repos count by id and
 * order: their stars and descriptions refresh from GitHub, which isn't an edit.
 */
const fingerprint = (draft: Draft) => JSON.stringify({ ...draft, repos: draft.repos.map((repo) => repo.id) });

const orNull = (value: string) => value.trim() || null;
const previewUrl = (value: string) => {
  const url = value.trim();
  return url ? (/^https?:\/\//i.test(url) ? url : `https://${url}`) : null;
};

function SettingsPage() {
  const data = Route.useLoaderData();
  // Keyed on the saved values, so the editor starts over from them after a save
  // (but not after a picture upload, which mustn't throw away unsaved edits).
  return <ProfileEditor key={fingerprint(draftOf(data.user, data.repos))} {...data} />;
}

type Themes = readonly Theme[];

/** The reason a save didn't go through, when the save says so. */
const saveErrorOf = (result: unknown) =>
  result && typeof result === "object" && "error" in result && typeof result.error === "string" ? result.error : null;

function ProfileEditor({
  user,
  worn,
  mine,
  builtin,
  community,
  repos,
}: {
  user: User;
  worn: Theme;
  mine: Themes;
  builtin: Themes;
  community: Themes;
  repos: readonly Repo[];
}) {
  const [initial] = useState(() => draftOf(user, repos));
  const [saveError, setSaveError] = useState<string | null>(null);
  const [draft, setDraft] = useState(initial);
  const set = <K extends keyof Draft>(key: K) => (value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const dirty = fingerprint(draft) !== fingerprint(initial);
  const avatar = useImageUpload("avatar", { url: user.avatarUrl, custom: user.customAvatar });
  const bannerImage = useImageUpload("banner", { url: user.bannerUrl, custom: user.bannerUrl !== null });

  const theme = (draft.profileThemeId && [...mine, ...builtin, ...community].find((t) => t.id === draft.profileThemeId)) || worn;
  const preview: ProfileView = {
    username: user.username,
    avatarUrl: avatar.url,
    createdAt: user.createdAt,
    displayName: orNull(draft.displayName),
    pronouns: orNull(draft.pronouns),
    location: orNull(draft.location),
    country: draft.showCountry ? draft.country : null,
    status: orNull(draft.status),
    favoriteWaifu: orNull(draft.favoriteWaifu),
    website: previewUrl(draft.website),
    skills: draft.skills,
    links: draft.links.flatMap((link) => previewUrl(link) ?? []),
    banner: draft.banner,
    bannerUrl: bannerImage.url,
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
  const failed = (
    <AnimatePresence>
      {saveError ? (
        <motion.p
          key={saveError}
          role="alert"
          initial={{ opacity: 0, y: 6, height: 0 }}
          animate={{ opacity: 1, y: 0, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="nope overflow-hidden text-sm font-bold text-destructive lg:text-right"
        >
          {saveError}
        </motion.p>
      ) : null}
    </AnimatePresence>
  );

  return (
    <main className="mx-auto max-w-6xl px-4 py-12">
      <ActionForm
        action={updateProfile}
        onResult={(result) => setSaveError(saveErrorOf(result))}
        className="group grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)]"
      >
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
              sees it just like the preview. Your username comes from GitHub, and so does your picture until you upload one.
            </p>
          </div>

          <PicturesCard avatar={avatar} banner={bannerImage} username={user.username} decoration={draft.banner} themeVariant={theme.variant} />

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
                <legend className="mb-3 text-sm font-bold">Banner decoration</legend>
                {/* Drawn in the profile theme, the way visitors will see it. */}
                <div className="themed grid grid-cols-2 gap-1 rounded-xl border p-2 sm:grid-cols-3" style={themeStyle(theme.variant)}>
                  {BANNERS.map((b) => (
                    <PickerOption key={b} name="banner" value={b} ring="profile-banner" selected={draft.banner === b} onSelect={() => set("banner")(b)}>
                      <ProfileBanner banner={b} image={bannerImage.url} className="h-14 rounded-lg border" />
                      <span className="px-0.5 text-xs font-bold">{b === "plain" && bannerImage.url ? "Picture only" : BANNER_LABELS[b]}</span>
                    </PickerOption>
                  ))}
                </div>
              </fieldset>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>About you</CardTitle>
              <CardDescription>
                Status, favorite waifu and bio understand Markdown: <code className="text-foreground">**bold**</code>,{" "}
                <code className="text-foreground">_italic_</code>, <code className="text-foreground">`code`</code> and{" "}
                <code className="text-foreground">[links](https://...)</code>. The bio also takes lists, quotes and code blocks.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <TextField id="display_name" label="Display name" max={60} value={draft.displayName} onChange={set("displayName")} placeholder={user.username} />
              <TextField id="status" label="Status" max={80} value={draft.status} onChange={set("status")} placeholder="Shipping a tiny compiler, send snacks" />
              <div className="grid gap-5 sm:grid-cols-2">
                <TextField id="pronouns" label="Pronouns" max={30} value={draft.pronouns} onChange={set("pronouns")} />
                <TextField id="location" label="Location" max={60} value={draft.location} onChange={set("location")} placeholder="Tokyo, or the cloud" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
                {/* Picking a country shows it; the switch is how you keep it private. */}
                <CountryPicker
                  value={draft.country}
                  onChange={(country) => setDraft((d) => ({ ...d, country, showCountry: country ? (d.country ? d.showCountry : true) : false }))}
                />
                <label className="flex items-center justify-between gap-4 rounded-xl border p-3 sm:mt-8">
                  <span className="grid gap-0.5">
                    <Label htmlFor="show_country">Show my country</Label>
                    <span className="text-xs text-muted-foreground">Off keeps it to yourself.</span>
                  </span>
                  <Switch
                    id="show_country"
                    name="show_country"
                    checked={draft.showCountry}
                    disabled={!draft.country}
                    onCheckedChange={set("showCountry")}
                  />
                </label>
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

          <Card>
            <CardHeader>
              <CardTitle>Featured repos</CardTitle>
              <CardDescription>
                Show off up to {MAX_FEATURED_REPOS} of your public GitHub repos. They show as cards on your profile, in the order you put them, and
                their stars and descriptions stay in sync with GitHub.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RepoPicker value={draft.repos} onChange={set("repos")} username={user.username} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Bug reports</CardTitle>
              <CardDescription>For this browser, and it takes effect at once: not part of your profile, so there's nothing to save.</CardDescription>
            </CardHeader>
            <CardContent>
              <BugReportsSetting />
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
                <Markdown className="max-h-40 overflow-hidden text-sm [mask-image:linear-gradient(to_bottom,black_75%,transparent)]">{draft.bio}</Markdown>
              </Card>
            ) : null}
            {draft.repos.length ? (
              <div className="@container">
                <ul className="grid gap-2 @xs:grid-cols-2">
                  <AnimatePresence initial={false} mode="popLayout">
                    {draft.repos.map((repo) => (
                      <motion.li
                        key={repo.id}
                        layout
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={{ type: "spring", stiffness: 420, damping: 32 }}
                        className="min-w-0"
                      >
                        <RepoCard repo={repo} username={user.username} dense />
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              </div>
            ) : null}
          </div>
          <div className="hidden flex-col items-end gap-2 lg:flex">
            {failed}
            <div className="flex items-center justify-end gap-4">
              {dirty ? unsaved : null}
              {saveButton}
            </div>
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
              className="fixed inset-x-0 bottom-0 z-50 flex flex-col gap-1 border-t bg-card/90 px-4 py-3 backdrop-blur-md lg:hidden"
            >
              {failed}
              <div className="flex items-center justify-between gap-4">
                {unsaved}
                {saveButton}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
        {!dirty ? <div className="flex justify-end lg:hidden">{saveButton}</div> : null}
      </ActionForm>
    </main>
  );
}

const MB = MAX_IMAGE_BYTES / 1024 / 1024;
const quiet = "rounded-full font-bold transition-transform hover:-translate-y-0.5";

/**
 * Profile picture and banner uploads. These save as soon as they're picked;
 * everything else on the page waits for "Save profile".
 */
function PicturesCard({
  avatar,
  banner,
  username,
  decoration,
  themeVariant,
}: {
  avatar: ImageUpload;
  banner: ImageUpload;
  username: string;
  decoration: Banner;
  themeVariant: ThemeVariant;
}) {
  const { width, height } = IMAGE_SIZES.banner;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pictures</CardTitle>
        <CardDescription>
          Click or drop a JPEG, PNG, WebP or GIF (up to {MB} MB). GIFs stay animated. These save right away.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 sm:grid-cols-[auto_minmax(0,1fr)]">
        <ImageDrop
          upload={avatar}
          label="Profile picture"
          hint={avatar.custom ? "Your own picture, cropped to a square." : "Synced from GitHub."}
          className="w-fit rounded-full"
          actions={
            avatar.custom ? (
              <Button type="button" variant="outline" size="sm" className={quiet} disabled={avatar.pending} onClick={() => void avatar.remove()}>
                Use GitHub's
              </Button>
            ) : null
          }
        >
          <span className="avatar-ring block rounded-full p-1">
            <UserAvatar src={avatar.url} name={username} size={88} />
          </span>
        </ImageDrop>

        <ImageDrop
          upload={banner}
          label="Banner picture"
          hint={
            banner.custom
              ? "Your banner decoration plays on top. Pick Picture only below to show just the picture."
              : `Cropped to ${width}×${height}. Your banner decoration keeps playing on top of it.`
          }
          className="w-full rounded-xl"
          actions={
            banner.custom ? (
              <Button type="button" variant="outline" size="sm" className={quiet} disabled={banner.pending} onClick={() => void banner.remove()}>
                Remove picture
              </Button>
            ) : null
          }
        >
          {/* Drawn in the profile theme, with the chosen decoration, as visitors will see it. */}
          <span className="themed block overflow-hidden rounded-xl border" style={themeStyle(themeVariant)}>
            <ProfileBanner banner={decoration} image={banner.url} className="aspect-[3/1] w-full" />
          </span>
        </ImageDrop>
      </CardContent>
    </Card>
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
