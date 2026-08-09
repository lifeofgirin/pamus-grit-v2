import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

function koreaNowParts() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(new Date());

  const map = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );

  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    date: `${map.year}-${map.month}-${map.day}`,
    dayOfWeek: weekdayMap[map.weekday],
  };
}

export async function GET() {
  try {
    const session = await getCurrentSession();

    if (!session) {
      return NextResponse.json(
        { ok: false, message: "로그인이 필요합니다." },
        { status: 401 }
      );
    }

    const { date, dayOfWeek } = koreaNowParts();
    const supabase = getSupabaseAdmin();

    let query = supabase
      .from("schedules")
      .select(`
        schedule_code,
        day_of_week,
        start_time,
        end_time,
        subject,
        room,
        teacher_id,
        classes (
          class_code,
          class_name
        ),
        teachers (
          teacher_code,
          teacher_name
        )
      `)
      .eq("is_active", true)
      .eq("day_of_week", dayOfWeek)
      .order("start_time", { ascending: true });

    if (session.role === "teacher") {
      if (!session.teacherId) {
        return NextResponse.json(
          { ok: false, message: "선생님 정보가 없습니다." },
          { status: 403 }
        );
      }

      query = query.eq("teacher_id", session.teacherId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("today schedules:", error);
      return NextResponse.json(
        { ok: false, message: "시간표를 불러오지 못했습니다." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      date,
      role: session.role,
      displayName: session.displayName,
      lessons: data || [],
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { ok: false, message: "오늘 시간표 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
