import { AvatarFallback, AvatarImage, Avatar as UiAvatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export function UserAvatar({
  src,
  name,
  size = 40,
  className,
}: {
  src: string | null;
  name: string;
  size?: number;
  className?: string;
}) {
  return (
    <UiAvatar className={cn("border-2 border-border", className)} style={{ width: size, height: size }}>
      {src ? <AvatarImage alt="" src={sized(src, size * 2)} /> : null}
      <AvatarFallback className="bg-primary font-bold text-primary-foreground" style={{ fontSize: size * 0.4 }}>
        {name.slice(0, 1).toUpperCase()}
      </AvatarFallback>
    </UiAvatar>
  );
}

/** GitHub avatars can be asked for at a size; uploaded pictures are already small. */
function sized(src: string, px: number): string {
  if (!src.startsWith("https://avatars.githubusercontent.com/")) return src;
  return `${src}${src.includes("?") ? "&" : "?"}s=${px}`;
}
