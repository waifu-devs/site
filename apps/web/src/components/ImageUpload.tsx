import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { IMAGE_TYPES, type ImageKind, MAX_IMAGE_BYTES } from "@waifu-devs/domain/profile";
import { ImageUp, LoaderCircle } from "lucide-react";
import { AnimatePresence, m as motion } from "motion/react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { type I18n, useI18n } from "@/i18n/react";
import { cn } from "@/lib/utils";
import { removeImage, uploadImage } from "@/server/functions";

const MB = MAX_IMAGE_BYTES / 1024 / 1024;

/** The same checks the API makes first, so obvious mistakes don't wait on an upload. */
function problemWith(file: File, t: I18n["t"]): string | null {
  if (file.type && !(IMAGE_TYPES as readonly string[]).includes(file.type)) return t("profile.upload.badType");
  if (file.size > MAX_IMAGE_BYTES) return t("profile.upload.tooBig", { size: MB });
  return null;
}

export type ImageUpload = ReturnType<typeof useImageUpload>;

/**
 * Uploading one profile picture. The picked file shows straight away (from the
 * browser's copy) while the API checks, crops and stores it; if the API refuses
 * it, the previous picture comes back along with the reason.
 */
export function useImageUpload(kind: ImageKind, saved: { url: string | null; custom: boolean }) {
  const router = useRouter();
  const { t } = useI18n();
  const upload = useServerFn(uploadImage);
  const remove = useServerFn(removeImage);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ message: string; at: number } | null>(null);

  // The picked file shows from an object URL, freed once it's replaced or gone.
  const [picked, setPicked] = useState<File | null>(null);
  const [local, setLocal] = useState<string | null>(null);
  useEffect(() => {
    if (!picked) {
      setLocal(null);
      return;
    }
    const url = URL.createObjectURL(picked);
    setLocal(url);
    return () => URL.revokeObjectURL(url);
  }, [picked]);

  const fail = (message: string) => setError({ message, at: Date.now() });
  const form = (file?: File) => {
    const data = new FormData();
    data.set("kind", kind);
    if (file) data.set("file", file);
    return data;
  };

  return {
    kind,
    /** What to show: the picked file while (and after) it uploads, else the saved picture. */
    url: local ?? saved.url,
    /** Whether the member has their own picture here (not GitHub's, or none). */
    custom: Boolean(local) || saved.custom,
    pending,
    error: error?.message ?? null,
    errorKey: error?.at ?? 0,
    choose: async (file: File) => {
      const problem = problemWith(file, t);
      if (problem) return fail(problem);
      setError(null);
      setPicked(file);
      setPending(true);
      try {
        const result = await upload({ data: form(file) });
        if (result.error) {
          setPicked(null);
          fail(result.error);
        } else {
          await router.invalidate();
        }
      } catch {
        setPicked(null);
        fail(t("profile.upload.failed"));
      } finally {
        setPending(false);
      }
    },
    remove: async () => {
      setError(null);
      setPending(true);
      try {
        await remove({ data: form() });
        await router.invalidate();
        setPicked(null);
      } catch {
        fail(t("profile.upload.removeFailed"));
      } finally {
        setPending(false);
      }
    },
  };
}

/**
 * A picture slot: click it or drop an image on it to upload. `children` is the
 * preview; the actions (upload, remove) sit beside it.
 */
export function ImageDrop({
  upload,
  label,
  hint,
  className,
  children,
  actions,
}: {
  upload: ImageUpload;
  label: string;
  hint: ReactNode;
  className?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  const id = useId();
  const { t, locale } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className="text-sm font-bold">{label}</span>
      <div className="flex flex-wrap items-center gap-4">
        <motion.button
          type="button"
          aria-label={t("profile.upload.button", { label: label.toLocaleLowerCase(locale) })}
          aria-describedby={`${id}-hint`}
          disabled={upload.pending}
          onClick={() => input.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setOver(false);
            const file = event.dataTransfer.files[0];
            if (file) void upload.choose(file);
          }}
          animate={{ scale: over ? 1.04 : 1 }}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.97 }}
          transition={{ type: "spring", stiffness: 420, damping: 26 }}
          className={cn(
            "group/drop relative cursor-pointer outline-none ring-offset-2 ring-offset-background transition-shadow focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-progress",
            over && "ring-2 ring-primary",
            className,
          )}
        >
          {children}
          {/* Hover, drag and upload states share one veil over the preview. */}
          <span
            className={cn(
              "absolute inset-0 flex items-center justify-center gap-1.5 rounded-[inherit] bg-background/60 text-sm font-bold opacity-0 backdrop-blur-[2px] transition-opacity group-hover/drop:opacity-100",
              (over || upload.pending) && "opacity-100",
            )}
          >
            {upload.pending ? <LoaderCircle className="size-5 animate-spin text-primary" /> : <ImageUp className="size-5 text-primary" />}
            <span className="sr-only sm:not-sr-only">{upload.pending ? t("profile.upload.uploading") : over ? t("profile.upload.drop") : t("profile.upload.upload")}</span>
          </span>
        </motion.button>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      <input
        ref={input}
        type="file"
        accept={IMAGE_TYPES.join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) void upload.choose(file);
        }}
      />
      <AnimatePresence mode="wait" initial={false}>
        {upload.error ? (
          <motion.p
            key={upload.errorKey}
            role="alert"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="shake text-sm font-medium text-destructive"
          >
            {upload.error}
          </motion.p>
        ) : (
          <motion.p key="hint" id={`${id}-hint`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs text-muted-foreground">
            {hint}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
