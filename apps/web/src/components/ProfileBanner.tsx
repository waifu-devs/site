import type { Banner } from "@waifu-devs/domain/profile";
import { cn } from "@/lib/utils";

const PETALS = [
  { left: "6%", delay: "0s", duration: "5s" },
  { left: "18%", delay: "2.2s", duration: "6.5s" },
  { left: "31%", delay: "0.8s", duration: "5.5s" },
  { left: "44%", delay: "3.4s", duration: "7s" },
  { left: "57%", delay: "1.5s", duration: "6s" },
  { left: "69%", delay: "4.1s", duration: "5.2s" },
  { left: "81%", delay: "0.4s", duration: "6.8s" },
  { left: "93%", delay: "2.8s", duration: "5.8s" },
];

const STARS = [
  { left: "8%", top: "30%", size: 14, delay: "0s", duration: "3s" },
  { left: "17%", top: "70%", size: 9, delay: "1.2s", duration: "2.4s" },
  { left: "27%", top: "22%", size: 11, delay: "0.6s", duration: "3.6s" },
  { left: "38%", top: "58%", size: 16, delay: "2s", duration: "3.2s" },
  { left: "49%", top: "28%", size: 8, delay: "0.3s", duration: "2.2s" },
  { left: "58%", top: "74%", size: 12, delay: "1.6s", duration: "2.8s" },
  { left: "67%", top: "38%", size: 18, delay: "0.9s", duration: "3.8s" },
  { left: "77%", top: "18%", size: 10, delay: "2.4s", duration: "2.6s" },
  { left: "86%", top: "62%", size: 13, delay: "0.1s", duration: "3.4s" },
  { left: "94%", top: "32%", size: 9, delay: "1.8s", duration: "2.5s" },
];

// Two periods of a wave across 1200 units; sliding by half loops seamlessly.
const WAVE = "M0 60 Q 150 10 300 60 T 600 60 T 900 60 T 1200 60 V 120 H 0 Z";

/**
 * A profile's banner: the member's uploaded picture (drifting slowly), if any,
 * with the chosen animated decoration playing on top of it. Decorations are
 * drawn in the surrounding theme's colors, so they suit every theme.
 */
export function ProfileBanner({ banner, image, className }: { banner: Banner; image?: string | null; className?: string }) {
  return (
    <div aria-hidden data-banner={banner} data-image={image ? "" : undefined} className={cn("banner", className)}>
      {image ? <img key={image} src={image} alt="" className="banner-image" /> : null}
      {banner === "blobs" ? (
        <>
          <span className="blob -left-10 -top-16 h-44 w-44" />
          <span className="blob b2 -top-10 right-6 h-40 w-40" />
          <span className="blob b3 -bottom-20 left-1/3 h-48 w-48" />
        </>
      ) : null}
      {banner === "petals"
        ? PETALS.map((p) => (
            <span key={p.left} className="banner-petal" style={{ left: p.left, animationDelay: p.delay, animationDuration: p.duration }} />
          ))
        : null}
      {banner === "stars"
        ? STARS.map((s) => (
            <span
              key={s.left}
              className="banner-star"
              style={{ left: s.left, top: s.top, fontSize: s.size, animationDelay: s.delay, animationDuration: s.duration }}
            >
              ✦
            </span>
          ))
        : null}
      {banner === "waves" ? (
        <div className="banner-waves">
          {[0, 1, 2].map((i) => (
            <svg key={i} viewBox="0 0 1200 120" preserveAspectRatio="none">
              <path d={WAVE} />
            </svg>
          ))}
        </div>
      ) : null}
      {banner === "grid" ? (
        <>
          <span className="banner-sun" />
          <span className="banner-grid" />
        </>
      ) : null}
    </div>
  );
}
