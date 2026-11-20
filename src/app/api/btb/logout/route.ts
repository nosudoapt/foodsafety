import { NextResponse } from "next/server";
import { BTB_COOKIE } from "@/lib/btb-auth";
import { apiFailure, PRIVATE_HEADERS, requireBtbOrigin } from "@/lib/btb-api";

export async function POST(request: Request) {
  try {
  requireBtbOrigin(request);
  const response = NextResponse.json({ ok: true }, { headers: PRIVATE_HEADERS });
  response.cookies.set(BTB_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
  } catch (error) { return apiFailure(error, request); }
}
