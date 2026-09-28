"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Fades and slides its children in the first time they scroll into view. */
export function Reveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("in");
          io.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`reveal ${className}`}>
      {children}
    </div>
  );
}

/** Tilts toward the pointer in 3D and moves a glow under it. */
export function Tilt({ children, className = "", max = 8 }: { children: ReactNode; className?: string; max?: number }) {
  const ref = useRef<HTMLDivElement>(null);

  function onMove(e: React.PointerEvent) {
    const el = ref.current;
    if (!el || reducedMotion() || e.pointerType !== "mouse") return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.style.setProperty("--mx", `${x * 100}%`);
    el.style.setProperty("--my", `${y * 100}%`);
    el.style.transform = `perspective(700px) rotateX(${(0.5 - y) * max}deg) rotateY(${(x - 0.5) * max}deg) translateY(-4px)`;
  }

  function onLeave() {
    if (ref.current) ref.current.style.transform = "";
  }

  return (
    <div ref={ref} className={`tilt card-pop ${className}`} onPointerLeave={onLeave} onPointerMove={onMove}>
      {children}
    </div>
  );
}

const GLYPHS = ["♡", "✦", "✧", "★", "❀"];

function spawn(x: number, y: number, opts: { dx: number; dy: number; size: number }) {
  const s = document.createElement("span");
  s.className = "sparkle";
  s.textContent = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
  s.style.left = `${x}px`;
  s.style.top = `${y}px`;
  s.style.setProperty("--dx", `${opts.dx}px`);
  s.style.setProperty("--dy", `${opts.dy}px`);
  s.style.setProperty("--size", `${opts.size}px`);
  s.style.setProperty("--rot", `${(Math.random() - 0.5) * 360}deg`);
  document.body.appendChild(s);
  s.addEventListener("animationend", () => s.remove());
}

/**
 * Site-wide sparkles: a burst of hearts and stars when pressing any `.btn`
 * or `[data-burst]` element, and a soft trail over `[data-sparkle-zone]`.
 */
export function Sparkles() {
  useEffect(() => {
    if (reducedMotion()) return;
    let last = 0;

    function onDown(e: PointerEvent) {
      const target = (e.target as Element).closest(".btn, [data-burst]");
      if (!target) return;
      for (let i = 0; i < 10; i++) {
        const angle = (Math.PI * 2 * i) / 10 + Math.random() * 0.4;
        const dist = 30 + Math.random() * 40;
        spawn(e.clientX, e.clientY, { dx: Math.cos(angle) * dist, dy: Math.sin(angle) * dist, size: 10 + Math.random() * 10 });
      }
    }

    function onMove(e: PointerEvent) {
      if (e.pointerType !== "mouse") return;
      const now = performance.now();
      if (now - last < 45) return;
      if (!(e.target as Element).closest?.("[data-sparkle-zone]")) return;
      last = now;
      spawn(e.clientX, e.clientY, { dx: (Math.random() - 0.5) * 30, dy: 20 + Math.random() * 30, size: 8 + Math.random() * 8 });
    }

    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);
  return null;
}

/** Types, holds, and deletes each phrase in turn. */
export function Typewriter({ phrases }: { phrases: string[] }) {
  const [text, setText] = useState(phrases[0]);
  useEffect(() => {
    if (reducedMotion()) return;
    let i = 0;
    let len = phrases[0].length;
    let deleting = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      if (deleting) {
        len--;
        if (len === 0) {
          deleting = false;
          i = (i + 1) % phrases.length;
        }
      } else {
        len++;
      }
      setText(phrases[i].slice(0, len));
      let delay = deleting ? 35 : 70;
      if (!deleting && len === phrases[i].length) {
        deleting = true;
        delay = 2200;
      }
      timer = setTimeout(tick, delay);
    };
    timer = setTimeout(tick, 2200);
    return () => clearTimeout(timer);
  }, [phrases]);
  return <span className="caret">{text}</span>;
}

/** Counts up from 0 to `value` when first shown. */
export function CountUp({ value }: { value: number }) {
  const [n, setN] = useState(value);
  useEffect(() => {
    if (reducedMotion() || value === 0) return;
    const start = performance.now();
    const dur = 900;
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      setN(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{n}</>;
}
