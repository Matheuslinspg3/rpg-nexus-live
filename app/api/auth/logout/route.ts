import { clearSessionCookie, revokeSession } from "../../../auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  await revokeSession(request);
  return Response.json({ ok: true }, { headers: { "set-cookie": clearSessionCookie(request) } });
}
