import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/session";

export async function GET() {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.json(
      { loggedIn: false },
      { status: 401 }
    );
  }

  return NextResponse.json({
    loggedIn: true,
    user: {
      role: session.role,
      teacherCode: session.teacherCode,
      displayName: session.displayName,
    },
  });
}
