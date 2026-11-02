import { createClient } from "@supabase/supabase-js";

/** Exercise the real PostgREST builder while keeping all requests in memory. */
export function queryClient(respond: (request: Request) => Response | Promise<Response> = () => jsonRows([])) {
  const requests: Request[] = [];
  const client = createClient("http://127.0.0.1:1", "unit-test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const request = new Request(input, init);
      requests.push(request);
      if (request.signal.aborted) throw new DOMException("Aborted", "AbortError");
      return respond(request);
    } },
  });
  return { client, requests };
}

export function jsonRows(rows: unknown, count = 0): Response {
  return new Response(JSON.stringify(rows), { status: 200, headers: { "Content-Type": "application/json", "Content-Range": `0-0/${count}` } });
}
