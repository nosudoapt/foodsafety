import { NextResponse } from "next/server";
import { apiFailure, PRIVATE_HEADERS, readBody, requireBtbOrigin } from "@/lib/btb-api";
import { lookupBtbInvitation } from "@/lib/btb-invitations";
import { inventoryDb } from "@/lib/supabase-server";

// The unguessable token is the authorization for this public setup flow.
export async function POST(request: Request) {
  try {
    requireBtbOrigin(request, "Open the invitation link in your browser.");
    const body = await readBody(request, 4096);
    return NextResponse.json({ invitation: await lookupBtbInvitation(inventoryDb(), body.token) }, { headers: PRIVATE_HEADERS });
  } catch (error) { return apiFailure(error, request); }
}
