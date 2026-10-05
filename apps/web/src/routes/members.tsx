import { createFileRoute } from "@tanstack/react-router";
import { MemberCard } from "@/components/MemberCard";
import { useI18n } from "@/i18n/react";
import { headT, title } from "@/lib/head";
import { getMembers } from "@/server/functions";

export const Route = createFileRoute("/members")({
  loader: () => getMembers(),
  head: ({ matches }) => ({ meta: [title(headT(matches)("members.title"))] }),
  component: MembersPage,
});

function MembersPage() {
  const members = Route.useLoaderData();
  const { t } = useI18n();
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-12">
      <h1 className="rise text-3xl font-extrabold">
        {t("members.title")} <span className="heartbeat text-primary">♡</span>
      </h1>
      {members.length ? (
        <div className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {members.map((m) => (
            <MemberCard key={m.id} user={m} />
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground">{t("members.empty")}</p>
      )}
    </main>
  );
}
