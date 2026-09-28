import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { type ComponentProps, useState } from "react";

type Action = (options: { data: FormData }) => Promise<unknown>;

/**
 * A form that posts its fields to a server function, follows any redirect it
 * throws, and reloads the route data (so a new theme shows up straight away).
 */
export function ActionForm({ action, children, ...props }: { action: Action } & Omit<ComponentProps<"form">, "action" | "onSubmit">) {
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
          await call({ data: new FormData(event.currentTarget) });
          await router.invalidate();
        } finally {
          setPending(false);
        }
      }}
    >
      {children}
    </form>
  );
}
