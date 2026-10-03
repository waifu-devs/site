import { createRouter } from "@tanstack/react-router";
import { reportThrown } from "./lib/reports";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
    // A page that failed to draw, for anonymous bug reports (in the browser only).
    defaultOnCatch: (error) => reportThrown(error, "render"),
    // A router is made per request on the server: each page gets a fresh nonce for
    // its inline scripts, which the Content-Security-Policy names (server.ts).
    ssr: { nonce: import.meta.env.SSR ? nonce() : undefined },
  });
}

function nonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
