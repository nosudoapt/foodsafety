import { NextResponse } from "next/server";
import { BTB_COOKIE } from "@/lib/btb-auth";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(BTB_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
