import { handleGoogleCallback } from "@/lib/auth";

export async function GET(request: Request) {
  return handleGoogleCallback(request, { callbackPath: "/api/auth/google/link/callback" });
}
