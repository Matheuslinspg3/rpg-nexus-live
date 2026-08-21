import { headers } from "next/headers";
import { getAuthUserFromCookieHeader } from "./auth";
import RpgNexusApp from "./RpgNexusApp";

export const dynamic = "force-dynamic";

export default async function Home() {
  const requestHeaders = await headers();
  const user = await getAuthUserFromCookieHeader(requestHeaders.get("cookie"));
  return <RpgNexusApp initialUser={user} />;
}
