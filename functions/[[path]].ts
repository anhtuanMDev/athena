export async function onRequest(context: { request: Request; env: { ASSETS: { fetch: (req: Request) => Promise<Response> } } & Record<string, unknown>; next: () => Promise<Response> }): Promise<Response> {
  const url = new URL(context.request.url);

  // Skip paths handled by more specific functions
  if (url.pathname.startsWith("/api/")) {
    return context.next();
  }

  // Try to serve the requested static file; fall back to index.html for SPA
  const response = await context.env.ASSETS.fetch(context.request as unknown as Request);
  if (response.status === 404) {
    return context.env.ASSETS.fetch(new Request(new URL("/index.html", url.origin), context.request));
  }
  return response;
}
