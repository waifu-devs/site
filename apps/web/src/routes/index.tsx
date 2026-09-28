import { createFileRoute } from "@tanstack/react-router";
import { MotionConfig } from "motion/react";
import { Finale } from "@/components/landing/Finale";
import { Hero } from "@/components/landing/Hero";
import { Marquee } from "@/components/landing/Marquee";
import { Story } from "@/components/landing/Story";
import { getHome } from "@/server/functions";

export const Route = createFileRoute("/")({
  loader: () => getHome(),
  component: Home,
});

function Home() {
  const { memberCount } = Route.useLoaderData();
  return (
    // With reduced motion on, Motion skips transforms and keeps fades; the pieces that loop check it themselves.
    <MotionConfig reducedMotion="user">
      <main>
        <Hero memberCount={memberCount} />
        <Marquee />
        <Story />
        <Finale memberCount={memberCount} />
      </main>
    </MotionConfig>
  );
}
