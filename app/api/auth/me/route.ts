import { getAuthUser } from "../../../auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: "Sessão encerrada." }, { status: 401 });
  return Response.json({ user });
}
