"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createTheme } from "@/lib/actions";
import {
  BUILTIN_THEMES,
  deriveTokens,
  RADIUS_MAX,
  RADIUS_MIN,
  SEEDS,
  seedsOf,
  themeStyle,
  TOKEN_LABELS,
  TOKENS,
  type ThemeVariant,
  type Token,
} from "@/lib/themes";

export function ThemeEditor({ initial }: { initial: ThemeVariant }) {
  const [variant, setVariant] = useState<ThemeVariant>(initial);
  const [name, setName] = useState("");
  // Bumped on every change so the matching hex label replays its "pop" animation.
  const [changed, setChanged] = useState<{ keys: Token[] | "all"; n: number }>({ keys: [], n: 0 });

  function setTokens(tokens: ThemeVariant["tokens"], keys: Token[] | "all") {
    setVariant((v) => ({ ...v, tokens }));
    setChanged((c) => ({ keys, n: c.n + 1 }));
  }

  // Quick edits re-derive the whole token set from the seed colors.
  function setSeed(key: (typeof SEEDS)[number], value: string) {
    setTokens(deriveTokens({ ...seedsOf(variant.tokens), [key]: value }), "all");
  }

  function swatch(key: Token, onChange: (value: string) => void) {
    const popKey = changed.keys === "all" || changed.keys.includes(key) ? changed.n : 0;
    return (
      <label key={key} className="flex cursor-pointer items-center gap-2 rounded-md border p-2 transition-colors hover:border-primary">
        <input
          type="color"
          value={variant.tokens[key]}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-10 shrink-0 cursor-pointer rounded border-0 bg-transparent"
          aria-label={TOKEN_LABELS[key]}
        />
        <span className="flex min-w-0 flex-col text-sm">
          <span className="truncate font-bold">{TOKEN_LABELS[key]}</span>
          <span key={popKey} className="pop inline-block origin-left font-mono text-xs text-muted-foreground">
            {variant.tokens[key]}
          </span>
        </span>
      </label>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
      <Card className="rise">
        <form action={createTheme} className="flex flex-col gap-6">
          {/* The tabs unmount their hidden panel, so the submitted values live here. */}
          {TOKENS.map((k) => <input key={k} type="hidden" name={k} value={variant.tokens[k]} />)}
          <input type="hidden" name="radius" value={variant.radius} />

          <CardContent className="flex flex-col gap-5">
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="Kawaii Dark" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Input id="description" name="description" maxLength={140} placeholder="Optional" />
            </div>

            <div className="grid gap-2">
              <Label>Start from</Label>
              <div className="flex flex-wrap gap-2">
                {BUILTIN_THEMES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setVariant(t.variant);
                      setChanged((c) => ({ keys: "all", n: c.n + 1 }));
                    }}
                    className="btn cursor-pointer border px-3 py-1 text-xs font-bold"
                    style={{
                      background: t.variant.tokens.background,
                      color: t.variant.tokens.foreground,
                      borderColor: t.variant.tokens.primary,
                      borderRadius: `${t.variant.radius}rem`,
                    }}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>

            <Tabs defaultValue="quick">
              <TabsList>
                <TabsTrigger value="quick">Quick</TabsTrigger>
                <TabsTrigger value="all">All tokens</TabsTrigger>
              </TabsList>
              <TabsContent value="quick" className="grid grid-cols-2 gap-3 pt-2">
                {SEEDS.map((k) => swatch(k, (v) => setSeed(k, v)))}
              </TabsContent>
              <TabsContent value="all" className="grid grid-cols-2 gap-3 pt-2">
                {TOKENS.map((k) => swatch(k, (v) => setTokens({ ...variant.tokens, [k]: v }, [k])))}
              </TabsContent>
            </Tabs>

            <div className="grid gap-3">
              <div className="flex items-center justify-between">
                <Label>Corner radius</Label>
                <span className="font-mono text-xs text-muted-foreground">{variant.radius}rem</span>
              </div>
              <Slider
                min={RADIUS_MIN}
                max={RADIUS_MAX}
                step={0.125}
                value={[variant.radius]}
                onValueChange={([r]) => setVariant((v) => ({ ...v, radius: r }))}
              />
            </div>

            <div className="flex items-center gap-3">
              <Switch id="is_public" name="is_public" defaultChecked />
              <Label htmlFor="is_public">Share with the community</Label>
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" className="btn rounded-full font-bold">Save and wear it</Button>
          </CardFooter>
        </form>
      </Card>

      <Preview variant={variant} name={name || "Your theme"} />
    </div>
  );
}

/** Real shadcn components rendered inside the draft variant. */
function Preview({ variant, name }: { variant: ThemeVariant; name: string }) {
  return (
    <div
      className="themed flex flex-col gap-4 rounded-xl border p-5 lg:sticky lg:top-20 lg:self-start"
      style={themeStyle(variant)}
    >
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Live preview</p>
      <Card>
        <CardHeader className="flex flex-row items-center gap-4">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-primary text-2xl text-primary-foreground">
            <span className="heartbeat">♡</span>
          </span>
          <div>
            <CardTitle className="text-xl font-extrabold">{name}</CardTitle>
            <CardDescription>u/you · she/her · joined today</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p>Full-stack dev by day, visual novel enjoyer by night. (◕‿◕)♡</p>
          <div className="flex flex-wrap gap-2">
            <Badge>♡ Rem</Badge>
            <Badge variant="secondary">Rust</Badge>
            <Badge variant="outline">TypeScript</Badge>
          </div>
          <Input placeholder="Say something nice…" />
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          <Button data-burst type="button" className="btn">Primary</Button>
          <Button type="button" variant="secondary" className="btn">Secondary</Button>
          <Button type="button" variant="outline" className="btn">Outline</Button>
          <Button type="button" variant="ghost">Ghost</Button>
        </CardFooter>
      </Card>
      <div className="flex items-center gap-3 rounded-md bg-muted p-3 text-sm text-muted-foreground">
        <Switch defaultChecked aria-label="Example switch" /> Muted panel with a switch
      </div>
    </div>
  );
}
