export function Avatar({ src, name, size = 40 }: { src: string | null; name: string; size?: number }) {
  return src ? (
    <img
      alt=""
      className="rounded-full border-2 border-line bg-surface object-cover"
      height={size}
      src={`${src}${src.includes("?") ? "&" : "?"}s=${size * 2}`}
      width={size}
    />
  ) : (
    <span
      aria-hidden
      className="grid place-items-center rounded-full bg-accent font-bold text-on-accent"
      style={{ width: size, height: size }}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
