import { Badge } from "@/components/ui/badge";
import { themeStyle, type Theme } from "@waifu-devs/domain/themes";

/**
 * A miniature, self-themed preview. It sets the theme's tokens on itself, so
 * everything inside uses the same shadcn classes as the real site.
 */
export function ThemeSwatch({ theme }: { theme: Theme }) {
  return (
    <div className="group/swatch overflow-hidden rounded-lg border bg-background p-3" style={themeStyle(theme.variant)}>
      <div className="rounded-md border bg-card p-3">
        <div className="h-2 w-2/3 rounded-full bg-foreground transition-all duration-500 group-hover/swatch:w-5/6" />
        <div className="mt-2 h-2 w-1/2 rounded-full bg-muted-foreground transition-all delay-75 duration-500 group-hover/swatch:w-1/3" />
        <div className="mt-3 flex gap-2">
          <Badge className="transition-transform duration-300 group-hover/swatch:scale-110">♡ kawaii</Badge>
          <Badge variant="secondary">desu</Badge>
        </div>
      </div>
    </div>
  );
}
