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
      {src ? <AvatarImage alt="" src={`${src}${src.includes("?") ? "&" : "?"}s=${size * 2}`} /> : null}
      <AvatarFallback className="bg-primary font-bold text-primary-foreground" style={{ fontSize: size * 0.4 }}>
        {name.slice(0, 1).toUpperCase()}
      </AvatarFallback>
    </UiAvatar>
  );
}
