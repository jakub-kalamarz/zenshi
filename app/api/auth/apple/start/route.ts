import { startAppleOAuth } from "@/lib/auth"

export async function GET(request: Request) {
  return startAppleOAuth(request)
}

