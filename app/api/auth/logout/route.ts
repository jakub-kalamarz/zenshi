import { handleLogout } from "@/lib/auth";

export async function GET(request: Request) {
  return handleLogout(request);
}
