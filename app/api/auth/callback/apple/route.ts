import { handleAppleCallback } from "@/lib/auth"

export async function GET(request: Request) {
  return handleAppleCallback(request)
}

