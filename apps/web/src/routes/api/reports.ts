import { createFileRoute } from "@tanstack/react-router";

/**
 * Visitors' anonymous bug reports (lib/reports.ts). Always answers 204, so a
 * report turned away tells the browser nothing it could act on; the server
 * side (server/reports.ts) adds the good ones together.
 */
export const Route = createFileRoute("/api/reports")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { addReport, MAX_REPORT_BYTES } = await import("@/server/reports");
        if (Number(request.headers.get("content-length") ?? 0) > MAX_REPORT_BYTES) return new Response(null, { status: 413 });
        const text = await request.text().catch(() => "");
        if (text.length > MAX_REPORT_BYTES) return new Response(null, { status: 413 });
        let body: unknown = null;
        try {
          body = JSON.parse(text);
        } catch {
          // Not JSON: dropped below.
        }
        addReport(body);
        return new Response(null, { status: 204 });
      },
    },
  },
});
