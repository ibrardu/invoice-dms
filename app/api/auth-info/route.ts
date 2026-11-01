// TEMPORARY: shows which Neon Auth endpoint is configured (public URL, no secrets). Remove after setup.
export function GET() {
  const u = new URL(process.env.NEON_AUTH_BASE_URL ?? "http://unset");
  return Response.json({ host: u.host, path: u.pathname });
}
