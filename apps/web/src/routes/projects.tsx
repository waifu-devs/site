import { createFileRoute } from "@tanstack/react-router";
import { MotionConfig } from "motion/react";
import { Magnetic } from "@/components/animate-ui/primitives/effects/magnetic";
import { Project } from "@/components/projects/Project";
import { GitHubMark } from "@/components/projects/ProjectCard";
import { ProjectsHero } from "@/components/projects/ProjectsHero";
import { Button } from "@/components/ui/button";
import { title } from "@/lib/head";
import { PROJECTS } from "@/lib/projects";

export const Route = createFileRoute("/projects")({
  head: () => ({ meta: [title("Projects")] }),
  component: ProjectsPage,
});

function ProjectsPage() {
  return (
    // With reduced motion on, Motion skips transforms and keeps fades; the pieces that loop check it themselves.
    <MotionConfig reducedMotion="user">
      <main>
        <ProjectsHero projects={PROJECTS} />
        <div className="mx-auto flex max-w-6xl flex-col gap-16 px-4 py-20 sm:gap-28 sm:py-28">
          {PROJECTS.map((p, i) => (
            <Project key={p.slug} project={p} index={i} />
          ))}
        </div>
        <section data-sparkle-zone className="relative isolate overflow-hidden border-t px-4 py-24 sm:py-32">
          <div aria-hidden className="grid-floor absolute inset-0 -z-10 rotate-180" />
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
            <h2 className="text-balance text-[clamp(2.2rem,6vw,4rem)] font-extrabold leading-[1.05] tracking-tight">
              Got an idea? <span className="text-primary">Build it with us.</span>
            </h2>
            <p className="max-w-xl text-lg text-muted-foreground">
              Every project here is open source. Open an issue, pick one up, or show up with a project of your own.
            </p>
            <Magnetic strength={0.4}>
              <Button asChild size="lg" className="btn h-12 rounded-full px-7 text-base font-bold">
                <a href="https://github.com/waifu-devs">
                  <GitHubMark className="size-5" /> github.com/waifu-devs
                </a>
              </Button>
            </Magnetic>
          </div>
        </section>
      </main>
    </MotionConfig>
  );
}
