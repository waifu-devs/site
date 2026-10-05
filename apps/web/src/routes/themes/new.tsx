import { createFileRoute } from "@tanstack/react-router";
import { ThemeEditor } from "@/components/ThemeEditor";
import { T } from "@/i18n/react";
import { headT, title } from "@/lib/head";
import { getAccount } from "@/server/functions";

export const Route = createFileRoute("/themes/new")({
  loader: () => getAccount({ data: "/themes/new" }),
  head: ({ matches }) => ({ meta: [title(headT(matches)("themes.new.title"))] }),
  component: NewThemePage,
});

function NewThemePage() {
  // Start from whatever the user is wearing now, so tweaking an existing look is easy.
  const { theme } = Route.useLoaderData();
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-12">
      <h1 className="rise text-3xl font-extrabold">
        <T k="themes.new.heading" values={{ sparkle: <span className="float inline-block text-primary">✦</span> }} />
      </h1>
      <ThemeEditor initial={theme.variant} />
    </main>
  );
}
