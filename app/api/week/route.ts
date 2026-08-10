import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getKoreaDate } from "@/lib/korea-time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function parseKoreaDate(date: string) {
  return new Date(`${date}T00:00:00+09:00`);
}

function toKoreaDateKey(date: Date) {
  const shifted = new Date(date.getTime() + KST_OFFSET_MS);

  return [
    shifted.getUTCFullYear(),
    String(shifted.getUTCMonth() + 1).padStart(2, "0"),
    String(shifted.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function addDays(date: Date, amount: number) {
  return new Date(date.getTime() + amount * 24 * 60 * 60 * 1000);
}

function getWeekMonday(baseDateKey: string) {
  const base = parseKoreaDate(baseDateKey);
  const jsDay = base.getDay();
  const mondayOffset = jsDay === 0 ? -6 : 1 - jsDay;
  return addDays(base, mondayOffset);
}

export async function GET(request: Request) {
  try {
    const session = await getCurrentSession();

    if (!session) {
      return NextResponse.json(
        { ok: false, message: "로그인이 필요합니다." },
        { status: 401 }
      );
    }

    const url = new URL(request.url);
    const requestedDate =
      url.searchParams.get("date") || getKoreaDate().date;

    const monday = getWeekMonday(requestedDate);

    const days = Array.from({ length: 5 }, (_, index) => {
      const date = addDays(monday, index);

      return {
        date: toKoreaDateKey(date),
        dayOfWeek: index + 1,
      };
    });

    const dateKeys = days.map((day) => day.date);
    const supabase = getSupabaseAdmin();

    let query = supabase
      .from("schedules")
      .select(`
        id,
        schedule_code,
        class_id,
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
      .in("day_of_week", [1, 2, 3, 4, 5])
      .order("day_of_week", { ascending: true })
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

    const { data: schedules, error } = await query;

    if (error) {
      console.error("week schedules:", error);

      return NextResponse.json(
        { ok: false, message: "주간 시간표를 불러오지 못했습니다." },
        { status: 500 }
      );
    }

    const rows = schedules || [];

    if (rows.length === 0) {
      return NextResponse.json({
        ok: true,
        weekStart: dateKeys[0],
        weekEnd: dateKeys[4],
        days: days.map((day) => ({
          ...day,
          lessons: [],
        })),
      });
    }

    const scheduleIds = rows.map((row) => row.id);
    const classIds = [...new Set(rows.map((row) => row.class_id))];

    const [
      recordsResult,
      attendanceResult,
      studentsResult,
    ] = await Promise.all([
      supabase
        .from("lesson_records")
        .select("schedule_id, lesson_date, progress, homework")
        .gte("lesson_date", dateKeys[0])
        .lte("lesson_date", dateKeys[4])
        .in("schedule_id", scheduleIds),

      supabase
        .from("attendance")
        .select("schedule_id, lesson_date, student_id")
        .gte("lesson_date", dateKeys[0])
        .lte("lesson_date", dateKeys[4])
        .in("schedule_id", scheduleIds),

      supabase
        .from("students")
        .select("id, class_id")
        .eq("status", "재원")
        .in("class_id", classIds),
    ]);

    if (recordsResult.error) {
      console.error("week records:", recordsResult.error);
    }

    if (attendanceResult.error) {
      console.error("week attendance:", attendanceResult.error);
    }

    if (studentsResult.error) {
      console.error("week students:", studentsResult.error);
    }

    const studentCountByClass = new Map<string, number>();

    for (const student of studentsResult.data || []) {
      studentCountByClass.set(
        student.class_id,
        (studentCountByClass.get(student.class_id) || 0) + 1
      );
    }

    const recordMap = new Map<string, any>();

    for (const record of recordsResult.data || []) {
      recordMap.set(
        `${record.schedule_id}__${record.lesson_date}`,
        record
      );
    }

    const attendanceCountMap = new Map<string, number>();

    for (const attendance of attendanceResult.data || []) {
      const key =
        `${attendance.schedule_id}__${attendance.lesson_date}`;

      attendanceCountMap.set(
        key,
        (attendanceCountMap.get(key) || 0) + 1
      );
    }

    const responseDays = days.map((day) => {
      const lessons = rows
        .filter((row) => row.day_of_week === day.dayOfWeek)
        .map((row) => {
          const key = `${row.id}__${day.date}`;
          const record = recordMap.get(key);

          const studentCount =
            studentCountByClass.get(row.class_id) || 0;

          const attendanceCount =
            attendanceCountMap.get(key) || 0;

          return {
            ...row,
            lessonDate: day.date,
            progressDone:
              Boolean(String(record?.progress || "").trim()),
            homeworkDone:
              Boolean(record) &&
              record?.homework !== null &&
              record?.homework !== undefined,
            attendanceDone:
              studentCount === 0 ||
              attendanceCount >= studentCount,
            studentCount,
            attendanceCount,
          };
        });

      return {
        ...day,
        lessons,
      };
    });

    return NextResponse.json({
      ok: true,
      weekStart: dateKeys[0],
      weekEnd: dateKeys[4],
      days: responseDays,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { ok: false, message: "주간 시간표 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
