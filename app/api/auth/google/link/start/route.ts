import { auth, startGoogleOAuth } from "@/lib/auth";

export async function GET(request: Request) {
  const session = await auth(request);
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    return await startGoogleOAuth(request, {
      purpose: "link",
      userId: session.user.id,
      callbackPath: "/api/auth/google/link/callback",
    });
  } catch (error) {
    console.error("Google link start failed", error);
    return new Response("Google link start error", { status: 500 });
  }
}
