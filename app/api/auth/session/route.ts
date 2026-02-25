import { handleSession } from "@/lib/auth";

export async function GET(request: Request) {
  return handleSession(request);
}
