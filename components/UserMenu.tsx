"use client";

import { LogOut, Palette, Settings, User as UserIcon } from "lucide-react";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/lib/actions";
import { UserAvatar } from "./Avatar";

export function UserMenu({ username, name, avatar }: { username: string; name: string; avatar: string | null }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="wiggle-hover flex cursor-pointer items-center gap-2 rounded-full font-bold outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
        <UserAvatar src={avatar} name={username} size={30} />
        <span className="hidden sm:inline">{name}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-muted-foreground">u/{username}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={`/u/${username}`}><UserIcon /> My profile</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings"><Settings /> Settings</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/themes"><Palette /> Themes</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <form action={signOut}>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full"><LogOut /> Sign out</button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
