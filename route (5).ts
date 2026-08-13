import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  makeSessionToken,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const pin = String(body?.pin || "").trim();

    if (!/^\d{4}$/.test(pin)) {
      return NextResponse.json(
        { ok: false, message: "4자리 PIN을 입력해주세요." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase.rpc(
      "verify_login_pin",
      { input_pin: pin }
    );

    if (error) {
      console.error("verify_login_pin:", error);
      return NextResponse.json(
        { ok: false, message: "로그인 서버 오류가 발생했습니다." },
        { status: 500 }
      );
    }

    const user = Array.isArray(data) ? data[0] : null;

    if (!user) {
      return NextResponse.json(
        { ok: false, message: "로그인번호를 확인해주세요." },
        { status: 401 }
      );
    }

    const token = makeSessionToken({
      role: user.role,
      teacherId: user.teacher_id || null,
      teacherCode: user.teacher_code || null,
      displayName: user.display_name,
    });

    const response = NextResponse.json({
      ok: true,
      user: {
        role: user.role,
        teacherCode: user.teacher_code || null,
        displayName: user.display_name,
      },
    });

    response.cookies.set(
      SESSION_COOKIE,
      token,
      sessionCookieOptions
    );

    return response;
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { ok: false, message: "로그인 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
