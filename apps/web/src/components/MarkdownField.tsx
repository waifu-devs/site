import { Bold, Code, Eye, Italic, Link2, List, type LucideIcon, PenLine, Quote } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type ComponentProps, useId, useRef, useState } from "react";
import { Markdown } from "@/components/Markdown";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type Props = Omit<ComponentProps<"textarea">, "value" | "defaultValue" | "onChange"> & {
  defaultValue?: string;
  onValueChange?: (value: string) => void;
};

type Tool = { label: string; keys?: string; Icon: LucideIcon; apply: (el: HTMLTextAreaElement) => void };

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/** Wraps the selection (or a placeholder, selected so typing replaces it) in `before`/`after`. */
function wrap(el: HTMLTextAreaElement, before: string, after: string, placeholder: string) {
  const { selectionStart: start, selectionEnd: end } = el;
  const inner = el.value.slice(start, end) || placeholder;
  el.setRangeText(before + inner + after, start, end);
  el.setSelectionRange(start + before.length, start + before.length + inner.length);
}

/** Puts `prefix` in front of every line the selection touches. */
function prefixLines(el: HTMLTextAreaElement, prefix: string) {
  const { selectionStart, selectionEnd, value } = el;
  const start = value.lastIndexOf("\n", selectionStart - 1) + 1;
  const lines = value.slice(start, selectionEnd).split("\n").map((line) => prefix + line).join("\n");
  el.setRangeText(lines, start, selectionEnd, "end");
}

const TOOLS: Tool[] = [
  { label: "Bold", keys: "B", Icon: Bold, apply: (el) => wrap(el, "**", "**", "bold") },
  { label: "Italic", keys: "I", Icon: Italic, apply: (el) => wrap(el, "_", "_", "italic") },
  { label: "Code", keys: "E", Icon: Code, apply: (el) => (el.value.slice(el.selectionStart, el.selectionEnd).includes("\n") ? wrap(el, "```\n", "\n```", "code") : wrap(el, "`", "`", "code")) },
  { label: "Link", keys: "K", Icon: Link2, apply: (el) => wrap(el, "[", "](https://)", "text") },
  { label: "Quote", Icon: Quote, apply: (el) => prefixLines(el, "> ") },
  { label: "List", Icon: List, apply: (el) => prefixLines(el, "- ") },
];

/**
 * A textarea that speaks Markdown: a small formatting toolbar (with the usual
 * shortcuts), a Write/Preview switch, and Cmd/Ctrl+Enter to send the form.
 * It stays a plain form field, so FormData picks up whatever was written.
 */
export function MarkdownField({ defaultValue = "", onValueChange, className, maxLength, rows = 3, ...props }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  const [value, setValue] = useState(defaultValue);
  const [preview, setPreview] = useState(false);
  const update = (next: string) => {
    setValue(next);
    onValueChange?.(next);
  };
  const run = (tool: Tool) => {
    const el = ref.current;
    if (!el) return;
    setPreview(false);
    el.focus();
    tool.apply(el);
    update(el.value);
  };
  const near = maxLength !== undefined && value.length > maxLength * 0.8;
  const mod = isMac() ? "⌘" : "Ctrl+";

  return (
    <div
      className={cn(
        "min-w-0 rounded-xl border bg-card/80 backdrop-blur transition-[border-color,box-shadow] focus-within:border-ring focus-within:shadow-[0_10px_30px_-18px_var(--primary)] focus-within:ring-[3px] focus-within:ring-ring/40",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-1 border-b px-1.5 py-1">
        <div className="flex rounded-full bg-muted/60 p-0.5 text-xs font-bold">
          {[
            { on: false, label: "Write", Icon: PenLine },
            { on: true, label: "Preview", Icon: Eye },
          ].map(({ on, label, Icon }) => (
            <button
              key={label}
              type="button"
              aria-pressed={preview === on}
              onClick={() => setPreview(on)}
              className={cn(
                "relative flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-1 transition-colors",
                preview === on ? "text-primary-foreground" : "text-muted-foreground hover:text-primary",
              )}
            >
              {preview === on ? (
                <motion.span layoutId={`md-tab-${id}`} className="absolute inset-0 rounded-full bg-primary" transition={{ type: "spring", stiffness: 500, damping: 35 }} />
              ) : null}
              <Icon className="relative size-3.5" />
              <span className="relative">{label}</span>
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap items-center">
          {TOOLS.map((tool) => (
            <Tooltip key={tool.label}>
              <TooltipTrigger asChild>
                <motion.button
                  type="button"
                  aria-label={tool.label}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => run(tool)}
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.85 }}
                  className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-primary"
                >
                  <tool.Icon className="size-3.5" />
                </motion.button>
              </TooltipTrigger>
              <TooltipContent>
                {tool.label}
                {tool.keys ? ` (${mod}${tool.keys})` : ""}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </div>

      {/* Stays mounted (just hidden) while previewing, so the form still sends it. */}
      <textarea
        {...props}
        ref={ref}
        rows={rows}
        maxLength={maxLength}
        defaultValue={defaultValue}
        hidden={preview}
        onChange={(e) => update(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (!(e.metaKey || e.ctrlKey)) return;
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
            return;
          }
          const tool = TOOLS.find((t) => t.keys?.toLowerCase() === e.key.toLowerCase());
          if (tool) {
            e.preventDefault();
            run(tool);
          }
        }}
        className="field-sizing-content block max-h-96 min-h-20 w-full resize-none bg-transparent px-3 py-2.5 text-base outline-none placeholder:text-muted-foreground md:text-sm"
      />
      <AnimatePresence initial={false}>
        {preview ? (
          <motion.div key="preview" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="min-h-20 px-3 py-2.5 text-base md:text-sm">
            {value.trim() ? <Markdown>{value}</Markdown> : <p className="text-muted-foreground">Nothing to preview yet.</p>}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="flex items-center justify-between gap-3 px-3 pb-2 text-xs text-muted-foreground">
        <span>
          <span className="font-bold">Markdown</span> works here: **bold**, _italic_, `code`, lists and links.
        </span>
        <AnimatePresence>
          {near ? (
            <motion.span
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className={cn("shrink-0 tabular-nums", value.length >= maxLength! ? "font-bold text-destructive" : "")}
            >
              {maxLength! - value.length} left
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
