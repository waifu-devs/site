import type { Metadata } from "next";
import { MemberCard } from "@/components/MemberCard";
import { listMembers } from "@/lib/db";

export const metadata: Metadata = { title: "Members" };

export default async function MembersPage() {
  const members = await listMembers(200);
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-12">
      <h1 className="text-3xl font-extrabold">Members</h1>
      {members.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {members.map((m) => <MemberCard key={m.id} user={m} />)}
        </div>
      ) : (
        <p className="text-muted">Nobody has joined yet.</p>
      )}
    </main>
  );
}
