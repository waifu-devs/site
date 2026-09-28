import { motion } from "motion/react";
import type { Project as ProjectData } from "@/lib/projects";
import { FuwaProject } from "./Fuwa";
import { ProjectCard } from "./ProjectCard";
import { SiteVisual } from "./SiteVisual";

/** Picks each project's visual. A project without one of its own gets its glyph. */
export function Project({ project, index }: { project: ProjectData; index: number }) {
  switch (project.slug) {
    case "fuwa":
      return <FuwaProject project={project} index={index} />;
    case "site":
      return <ProjectCard project={project} index={index} visual={<SiteVisual />} />;
    default:
      return <ProjectCard project={project} index={index} visual={<GlyphVisual glyph={project.glyph} />} />;
  }
}

function GlyphVisual({ glyph }: { glyph: string }) {
  return (
    <div aria-hidden className="relative grid aspect-[4/3] place-items-center">
      <div className="absolute inset-[12%] rounded-full bg-primary/25 blur-3xl" />
      <div className="spin-slow absolute inset-[6%] rounded-full border border-dashed border-primary/30" />
      <motion.span
        initial={{ scale: 0.6, rotate: -12, opacity: 0 }}
        whileInView={{ scale: 1, rotate: 0, opacity: 1 }}
        viewport={{ once: true }}
        transition={{ type: "spring", stiffness: 200, damping: 16 }}
        className="float relative text-[clamp(5rem,16vw,9rem)] font-extrabold text-primary"
      >
        {glyph}
      </motion.span>
    </div>
  );
}
