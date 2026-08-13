import { NextResponse } from "next/server";
import {
  getCurrentSession,
  makeSessionToken,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/session";

export async function GET() {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.json(
      { loggedIn: false },
      { status: 401 }
    );
  }

  const response = NextResponse.json({
    loggedIn: true,
    user: {
      role: session.role,
      teacherCode: session.teacherCode,
      displayName: session.displayName,
    },
  });

  // 앱을 정상적으로 열 때마다 로그인 유지기간을 다시 90일로 갱신한다.
  // PIN은 브라우저에 저장하지 않고 기존 HttpOnly 서명 세션 방식만 유지한다.
  const refreshedToken = makeSessionToken({
    role: session.role,
    teacherId: session.teacherId,
    teacherCode: session.teacherCode,
    displayName: session.displayName,
  });

  response.cookies.set(
    SESSION_COOKIE,
    refreshedToken,
    sessionCookieOptions
  );

  return response;
}
