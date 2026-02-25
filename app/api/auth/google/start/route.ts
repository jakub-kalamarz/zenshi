import { startGoogleOAuth } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    return await startGoogleOAuth(request);
  } catch (error) {
    console.error("Auth env", {
      hasAuthUrl: Boolean(process.env.AUTH_URL),
      hasGoogleId: Boolean(process.env.AUTH_GOOGLE_ID),
      hasGoogleSecret: Boolean(process.env.AUTH_GOOGLE_SECRET),
    });
    console.error("OAuth start failed", error, (error as Error | undefined)?.stack);
    return new Response("Auth start error", { status: 500 });
  }
}
