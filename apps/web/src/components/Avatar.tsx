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
      {src && firstParty(src) ? <AvatarImage alt="" src={src} /> : null}
      <AvatarFallback className="bg-primary font-bold text-primary-foreground" style={{ fontSize: size * 0.4 }}>
        {name.slice(0, 1).toUpperCase()}
      </AvatarFallback>
    </UiAvatar>
  );
}

/**
 * Pictures come from the API's /media (GitHub avatars included: the API keeps its
 * own copy), or are a local preview of an upload. Anything else would send the
 * viewer's browser to a third party, so it shows the initial instead.
 */
function firstParty(src: string): boolean {
  if (src.startsWith("blob:")) return true;
  try {
    return /^\/media\/avatar-[\w-]+\.webp$/.test(new URL(src).pathname);
  } catch {
    return false;
  }
}
