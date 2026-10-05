import type { Repo } from "@waifu-devs/domain/api";

export const repoUrl = (repo: Pick<Repo, "owner" | "name">) => `https://github.com/${repo.owner}/${repo.name}`;

/** Whether a repo belongs to someone other than `username` (an organization, usually). */
export const ownedByOther = (repo: Pick<Repo, "owner">, username: string) => repo.owner.toLowerCase() !== username.toLowerCase();
