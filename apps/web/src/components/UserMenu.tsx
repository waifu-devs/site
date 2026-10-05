import { useNavigate, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { LogOut, Palette, Settings, User as UserIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/i18n/react";
import { signOut } from "@/server/functions";
import { UserAvatar } from "./Avatar";

export function UserMenu({ username, name, avatar }: { username: string; name: string; avatar: string | null }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const router = useRouter();
  const callSignOut = useServerFn(signOut);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="wiggle-hover flex cursor-pointer items-center gap-2 rounded-full font-bold outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
        <UserAvatar src={avatar} name={username} size={30} />
        <span className="hidden sm:inline">{name}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-muted-foreground">u/{username}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate({ to: "/u/$username", params: { username } })}>
          <UserIcon /> {t("auth.menu.profile")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate({ to: "/settings" })}>
          <Settings /> {t("auth.menu.customize")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate({ to: "/themes" })}>
          <Palette /> {t("auth.menu.themes")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={async () => {
            await callSignOut();
            await router.invalidate();
          }}
        >
          <LogOut /> {t("auth.menu.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
