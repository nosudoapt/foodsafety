import { NextResponse } from "next/server";
import { apiFailure, PRIVATE_HEADERS } from "@/lib/btb-api";
import { requireBtbAdmin } from "@/lib/btb-admin-api";

// Who is signed in to the console. Same verified workspace session as every
// other surface — a console principal is just one kind of principal.
export async function GET(request: Request) {
  try {
    const { admin } = await requireBtbAdmin();
    return NextResponse.json({ authenticated: true, admin: { id: admin.id, name: admin.name, email: admin.email } }, { headers: PRIVATE_HEADERS });
  } catch (error) {
    if (error instanceof Error && "status" in error && (error as { status?: number }).status === 401) {
      return NextResponse.json({ authenticated: false }, { headers: PRIVATE_HEADERS });
    }
    return apiFailure(error, request);
  }
}
