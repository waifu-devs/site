import type { Theme } from "@/lib/themes";
import { themeStyle } from "@/lib/themes";

/** A miniature, self-themed preview card. */
export function ThemeSwatch({ theme }: { theme: Theme }) {
  return (
    <div
      className="overflow-hidden rounded-xl border"
      style={{ ...themeStyle(theme.colors), background: theme.colors.bg, borderColor: theme.colors.border }}
    >
      <div className="flex flex-col gap-2 p-3">
        <div className="rounded-lg p-3" style={{ background: theme.colors.surface, border: `1px solid ${theme.colors.border}` }}>
          <div className="h-2 w-2/3 rounded-full" style={{ background: theme.colors.text }} />
          <div className="mt-2 h-2 w-1/2 rounded-full" style={{ background: theme.colors.muted }} />
          <div className="mt-3 inline-block rounded-full px-3 py-1 text-xs font-bold" style={{ background: theme.colors.accent, color: theme.colors.accentText }}>
            ♡ kawaii
          </div>
        </div>
      </div>
    </div>
  );
}
