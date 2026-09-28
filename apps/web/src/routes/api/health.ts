import { createFileRoute } from "@tanstack/react-router";

/** Railway's healthcheck: the server is up and serving requests. */
export const Route = createFileRoute("/api/health")({
  server: { handlers: { GET: () => new Response("ok") } },
});
