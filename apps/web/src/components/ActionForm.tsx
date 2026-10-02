import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { type ComponentProps, useState } from "react";

type Action = (options: { data: FormData }) => Promise<unknown>;

/**
 * A form that posts its fields to a server function, follows any redirect it
 * throws, and reloads the route data (so a new theme shows up straight away).
 */
export function ActionForm({
  action,
  onResult,
  children,
  ...props
}: {
  action: Action;
  /** Gets what the action resolved to, when it didn't redirect. */
  onResult?: (result: unknown) => void;
} & Omit<ComponentProps<"form">, "action" | "onSubmit">) {
  const router = useRouter();
  const call = useServerFn(action);
  const [pending, setPending] = useState(false);
  return (
    <form
      {...props}
      aria-busy={pending || undefined}
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        try {
          const result = await call({ data: new FormData(event.currentTarget) });
          await router.invalidate();
          onResult?.(result);
        } finally {
          setPending(false);
        }
      }}
    >
      {children}
    </form>
  );
}
