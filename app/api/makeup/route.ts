import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

export async function POST(
  request: Request
) {
  try {
    const session =
      await getCurrentSession();

    if (!session) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "로그인이 필요합니다.",
        },
        { status: 401 }
      );
    }

    const body =
      await request.json();

    const title =
      String(
        body?.title || ""
      ).trim();

    const makeupDate =
      String(
        body?.date || ""
      ).trim();

    const startTime =
      String(
        body?.startTime || ""
      ).trim();

    const endTime =
      String(
        body?.endTime || ""
      ).trim();

    if (
      !title ||
      !makeupDate ||
      !startTime ||
      !endTime
    ) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "보강명, 날짜, 시작/종료 시간을 입력해주세요.",
        },
        { status: 400 }
      );
    }

    let teacherId =
      session.teacherId;

    if (
      session.role === "admin"
    ) {
      teacherId =
        String(
          body?.teacherId || ""
        ).trim() || null;
    }

    if (!teacherId) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "보강 담당 선생님을 선택해주세요.",
        },
        { status: 400 }
      );
    }

    const supabase =
      getSupabaseAdmin();

    const { error } =
      await supabase
        .from(
          "makeup_lessons"
        )
        .insert({
          makeup_date:
            makeupDate,

          title,

          start_time:
            startTime,

          end_time:
            endTime,

          subject:
            String(
              body?.subject ||
                "보강"
            ).trim() ||
            "보강",

          room:
            String(
              body?.room || ""
            ).trim() ||
            null,

          teacher_id:
            teacherId,

          memo:
            String(
              body?.memo || ""
            ).trim() ||
            null,

          created_by_role:
            session.role,
        });

    if (error) {
      console.error(
        "create makeup:",
        error
      );

      return NextResponse.json(
        {
          ok: false,
          message:
            "보강 등록에 실패했습니다.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        ok: false,
        message:
          "보강 등록 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}
