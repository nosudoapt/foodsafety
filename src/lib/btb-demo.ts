/** The hidden demo workspace. It is deliberately not a location: the slug is
 *  supplied by the server environment and never rendered in the console or the
 *  navigation, so only someone who knows the URL can reach the shared demo
 *  door. Unset/invalid means "no demo door" — never fall back to a guessable
 *  name. */
export function btbDemoSlug(): string | null {
  const slug = process.env.BTB_DEMO_SLUG?.trim().toLowerCase() ?? "";
  if (!/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/.test(slug)) return null;
  if (["demo", "login", "admin", "api", "btb"].includes(slug)) return null;
  return slug;
}
