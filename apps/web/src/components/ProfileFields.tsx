import { countries } from "@waifu-devs/domain/countries";
import { MAX_LINK_LENGTH, MAX_LINKS, MAX_SKILL_LENGTH, MAX_SKILLS } from "@waifu-devs/domain/profile";
import { Globe, Link2, Plus, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/i18n/react";
import { cn } from "@/lib/utils";

const pop = { type: "spring", stiffness: 520, damping: 30 } as const;
const lift = "transition-all duration-200 focus-visible:-translate-y-0.5";

/** A labeled text input with a character count that shows up while typing. */
export function TextField({
  id,
  label,
  max,
  value,
  onChange,
  placeholder,
  rows,
}: {
  id: string;
  label: string;
  max: number;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Renders a textarea with this many rows. */
  rows?: number;
}) {
  const props = { id, name: id, maxLength: max, value, placeholder, className: lift };
  return (
    <div className="group grid gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        <span
          className={cn(
            "text-xs tabular-nums text-muted-foreground opacity-0 transition-opacity group-focus-within:opacity-100",
            value.length >= max * 0.9 && "text-primary opacity-100",
          )}
        >
          {value.length}/{max}
        </span>
      </div>
      {rows ? (
        <Textarea {...props} rows={rows} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <Input {...props} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

/** Skills as tags: Enter or a comma adds one, Backspace on an empty field removes the last. */
export function SkillsInput({ value, onChange }: { value: string[]; onChange: (skills: string[]) => void }) {
  const { t } = useI18n();
  const [text, setText] = useState("");
  const full = value.length >= MAX_SKILLS;

  function add(raw: string[]) {
    const next = [...value];
    for (const part of raw) {
      const skill = part.trim().slice(0, MAX_SKILL_LENGTH);
      if (skill && next.length < MAX_SKILLS && !next.some((s) => s.toLowerCase() === skill.toLowerCase())) next.push(skill);
    }
    if (next.length !== value.length) onChange(next);
    setText("");
  }

  return (
    <div className="flex min-h-11 flex-wrap items-center gap-2 rounded-md border border-input p-2 shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
      <AnimatePresence initial={false} mode="popLayout">
        {value.map((skill) => (
          <motion.span key={skill} layout initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }} transition={pop}>
            <Badge variant="secondary" className="gap-1 py-1 pr-1 pl-3 text-sm">
              {skill}
              <button
                type="button"
                aria-label={t("profile.fields.removeSkill", { skill })}
                onClick={() => onChange(value.filter((s) => s !== skill))}
                className="cursor-pointer rounded-full p-0.5 transition-colors hover:bg-primary hover:text-primary-foreground"
              >
                <X className="size-3" />
              </button>
            </Badge>
            <input type="hidden" name="skill" value={skill} />
          </motion.span>
        ))}
      </AnimatePresence>
      <input
        aria-label={t("profile.fields.addSkill")}
        value={text}
        disabled={full}
        maxLength={MAX_SKILL_LENGTH * 4}
        placeholder={full ? t("profile.fields.skillsFull", { count: MAX_SKILLS }) : value.length ? t("profile.fields.addAnotherSkill") : t("profile.fields.skillsPlaceholder")}
        className="h-7 min-w-32 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
        onChange={(e) => (e.target.value.includes(",") ? add(e.target.value.split(",")) : setText(e.target.value))}
        onBlur={() => add([text])}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add([text]);
          } else if (e.key === "Backspace" && !text && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
      />
    </div>
  );
}

/** Up to MAX_LINKS link fields that slide in and out as they're added and removed. */
export function LinksInput({ initial, onChange }: { initial: readonly string[]; onChange: (links: string[]) => void }) {
  const { t } = useI18n();
  const nextId = useRef(initial.length);
  const [rows, setRows] = useState(() => initial.map((url, id) => ({ id, url })));

  function update(next: { id: number; url: string }[]) {
    setRows(next);
    onChange(next.map((row) => row.url));
  }

  return (
    <div className="flex flex-col gap-2">
      <AnimatePresence initial={false}>
        {rows.map((row, i) => (
          <motion.div
            key={row.id}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-2 p-0.5">
              <Link2 className="size-4 shrink-0 text-muted-foreground" />
              <Input
                name="link"
                aria-label={t("profile.fields.link", { number: i + 1 })}
                value={row.url}
                maxLength={MAX_LINK_LENGTH}
                placeholder="https://bsky.app/profile/you"
                autoFocus={row.id >= initial.length}
                className={lift}
                onChange={(e) => update(rows.map((r) => (r.id === row.id ? { ...r, url: e.target.value } : r)))}
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={t("profile.fields.removeLink")}
                className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => update(rows.filter((r) => r.id !== row.id))}
              >
                <X />
              </Button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
      {rows.length < MAX_LINKS ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="btn w-fit rounded-full font-bold"
          onClick={() => update([...rows, { id: nextId.current++, url: "" }])}
        >
          <Plus /> {t("profile.fields.addLink")}
        </Button>
      ) : null}
    </div>
  );
}

/**
 * One radio option in a picker. The selected option wears a ring that glides
 * over from the previously selected one (they share `ring`).
 */
export function PickerOption({
  name,
  value,
  selected,
  onSelect,
  ring,
  children,
}: {
  name: string;
  value: string;
  selected: boolean;
  onSelect: () => void;
  ring: string;
  children: ReactNode;
}) {
  return (
    <label className="group relative flex min-w-0 cursor-pointer flex-col gap-1.5 rounded-xl p-1.5 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50">
      <input type="radio" name={name} value={value} checked={selected} onChange={onSelect} className="sr-only" />
      {selected ? <motion.span layoutId={ring} transition={pop} className="absolute inset-0 rounded-xl border-2 border-primary bg-primary/5" /> : null}
      <span className="relative flex min-w-0 flex-col gap-1.5 transition-transform duration-200 group-hover:-translate-y-0.5 group-active:scale-95">
        {children}
      </span>
    </label>
  );
}

/**
 * A searchable country picker. Typing filters by name or code; arrows and
 * Enter pick one. The chosen code travels in a hidden field, so it posts with
 * the rest of the form.
 */
export function CountryPicker({ value, onChange }: { value: string | null; onChange: (code: string | null) => void }) {
  const { t } = useI18n();
  const all = countries();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);

  const needle = query.trim().toLowerCase();
  const matches = needle ? all.filter((c) => c.name.toLowerCase().includes(needle) || c.code.toLowerCase() === needle) : all;
  const chosen = value ? all.find((c) => c.code === value) : undefined;

  const pick = (code: string | null) => {
    onChange(code);
    setQuery("");
    setOpen(false);
  };
  // Keep the highlighted country in view while arrowing through the list.
  const highlight = (index: number) => {
    setActive(index);
    list.current?.children[index]?.scrollIntoView({ block: "nearest" });
  };

  return (
    <div ref={box} className="relative grid gap-2" onBlur={(e) => !box.current?.contains(e.relatedTarget) && setOpen(false)}>
      <Label htmlFor="country-search">{t("profile.fields.country")}</Label>
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          {/* The flag doubles as the input's icon once a country is picked. */}
          <span aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-lg leading-none">
            {chosen ? chosen.flag : <Globe className="size-4 text-muted-foreground" />}
          </span>
          <Input
            id="country-search"
            role="combobox"
            aria-expanded={open}
            aria-controls="country-list"
            aria-autocomplete="list"
            autoComplete="country-name"
            className={cn(lift, "pl-10")}
            placeholder={chosen ? chosen.name : t("profile.fields.countrySearch")}
            value={open ? query : (chosen?.name ?? "")}
            onFocus={() => {
              setOpen(true);
              highlight(Math.max(0, chosen ? all.indexOf(chosen) : 0));
            }}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                if (matches.length) highlight((active + (e.key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length);
              } else if (e.key === "Enter" && open) {
                e.preventDefault();
                if (matches[active]) pick(matches[active].code);
              } else if (e.key === "Escape" && open) {
                e.preventDefault();
                setOpen(false);
                setQuery("");
              }
            }}
          />
        </div>
        {chosen ? (
          <Button type="button" size="icon" variant="ghost" aria-label={t("profile.fields.clearCountry")} className="size-9 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => pick(null)}>
            <X />
          </Button>
        ) : null}
      </div>
      <input type="hidden" name="country" value={value ?? ""} />
      <AnimatePresence>
        {open ? (
          <motion.ul
            id="country-list"
            ref={list}
            // A listbox, so screen readers announce it as one.
            role="listbox"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
            className="absolute top-full z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border bg-popover p-1 shadow-lg"
          >
            {matches.length ? (
              matches.map((country, i) => (
                <li key={country.code}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={country.code === value}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => pick(country.code)}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors",
                      i === active && "bg-accent text-accent-foreground",
                      country.code === value && "font-bold text-primary",
                    )}
                  >
                    <span aria-hidden className="text-lg leading-none">
                      {country.flag}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{country.name}</span>
                    <span className="text-xs text-muted-foreground">{country.code}</span>
                  </button>
                </li>
              ))
            ) : (
              <li className="px-2.5 py-2 text-sm text-muted-foreground">{t("profile.fields.noCountry", { query: query.trim() })}</li>
            )}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
