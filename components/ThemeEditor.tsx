"use client";

import { useState } from "react";
import { createTheme } from "@/lib/actions";
import { BUILTIN_THEMES, THEME_KEYS, THEME_LABELS, type ThemeColors, themeStyle } from "@/lib/themes";

const field = "w-full rounded-xl border border-line bg-bg px-3 py-2 outline-none focus:border-accent";

export function ThemeEditor({ initial }: { initial: ThemeColors }) {
  const [colors, setColors] = useState<ThemeColors>(initial);
  const [name, setName] = useState("");

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
      <form action={createTheme} className="flex flex-col gap-4 rounded-3xl border border-line bg-surface p-6">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-bold">Name</span>
          <input className={field} name="name" required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="Kawaii Dark" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-bold">Description</span>
          <input className={field} name="description" maxLength={140} placeholder="Optional" />
        </label>

        <div className="flex flex-wrap gap-2">
          <span className="w-full text-sm font-bold">Start from</span>
          {BUILTIN_THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setColors(t.colors)}
              className="cursor-pointer rounded-full border px-3 py-1 text-xs font-bold"
              style={{ background: t.colors.bg, color: t.colors.text, borderColor: t.colors.accent }}
            >
              {t.name}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {THEME_KEYS.map((key) => (
            <label key={key} className="flex items-center gap-2 rounded-xl border border-line p-2">
              <input
                type="color"
                name={key}
                value={colors[key]}
                onChange={(e) => setColors({ ...colors, [key]: e.target.value })}
                className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent"
              />
              <span className="flex flex-col text-sm">
                <span className="font-bold">{THEME_LABELS[key]}</span>
                <span className="font-mono text-xs text-muted">{colors[key]}</span>
              </span>
            </label>
          ))}
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="is_public" defaultChecked className="accent-(--theme-accent)" />
          Share with the community
        </label>
        <button type="submit" className="self-start rounded-full bg-accent px-6 py-2 font-bold text-on-accent hover:opacity-90">
          Save and wear it
        </button>
      </form>

      <Preview colors={colors} name={name || "Your theme"} />
    </div>
  );
}

function Preview({ colors, name }: { colors: ThemeColors; name: string }) {
  return (
    <div className="themed flex flex-col gap-4 rounded-3xl border border-line p-6" style={themeStyle(colors)}>
      <p className="text-xs font-bold uppercase tracking-wide text-muted">Live preview</p>
      <div className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-4">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-accent text-2xl text-on-accent">♡</span>
        <div>
          <p className="text-xl font-extrabold">{name}</p>
          <p className="text-sm text-muted">@you · she/her · joined today</p>
        </div>
      </div>
      <div className="rounded-2xl border border-line bg-surface p-4">
        <p className="text-sm font-bold uppercase tracking-wide text-muted">About</p>
        <p className="mt-1">Full-stack dev by day, visual novel enjoyer by night. (◕‿◕)♡</p>
        <p className="mt-3 font-bold text-accent">waifu.dev ↗</p>
      </div>
      <div className="flex gap-2">
        <span className="rounded-full bg-accent px-4 py-2 text-sm font-bold text-on-accent">Primary button</span>
        <span className="rounded-full border border-line bg-surface px-4 py-2 text-sm font-bold">Secondary</span>
      </div>
    </div>
  );
}
