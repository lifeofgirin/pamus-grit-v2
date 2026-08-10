import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getKoreaDate } from "@/lib/korea-time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getCurrentSession();

    if (!session) {
      return NextResponse.json(
        { ok: false, message: "로그인이 필요합니다." },
        { status: 401 }
      );
    }

    const { date, dayOfWeek } = getKoreaDate();
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

    const { data: schedules, error } = await query;

    if (error) {
      console.error("today schedules:", error);
      return NextResponse.json(
        { ok: false, message: "시간표를 불러오지 못했습니다." },
        { status: 500 }
      );
    }

    const rows = schedules || [];

    if (rows.length === 0) {
      return NextResponse.json({
        ok: true,
        date,
        role: session.role,
        displayName: session.displayName,
        lessons: [],
      });
    }

    const scheduleIds = rows.map((row) => row.id);
    const classIds = [...new Set(rows.map((row) => row.class_id))];

    const [
      lessonRecordResult,
      attendanceResult,
      studentsResult,
    ] = await Promise.all([
      supabase
        .from("lesson_records")
        .select("schedule_id, progress, homework")
        .eq("lesson_date", date)
        .in("schedule_id", scheduleIds),

      supabase
        .from("attendance")
        .select("schedule_id, student_id")
        .eq("lesson_date", date)
        .in("schedule_id", scheduleIds),

      supabase
        .from("students")
        .select("id, class_id")
        .eq("status", "재원")
        .in("class_id", classIds),
    ]);

    if (lessonRecordResult.error) {
      console.error("today lesson records:", lessonRecordResult.error);
    }

    if (attendanceResult.error) {
      console.error("today attendance:", attendanceResult.error);
    }

    if (studentsResult.error) {
      console.error("today students:", studentsResult.error);
    }

    const recordMap = new Map(
      (lessonRecordResult.data || []).map((record) => [
        record.schedule_id,
        record,
      ])
    );

    const studentCountByClass = new Map<string, number>();

    for (const student of studentsResult.data || []) {
      studentCountByClass.set(
        student.class_id,
        (studentCountByClass.get(student.class_id) || 0) + 1
      );
    }

    const attendanceCountBySchedule = new Map<string, number>();

    for (const attendance of attendanceResult.data || []) {
      attendanceCountBySchedule.set(
        attendance.schedule_id,
        (attendanceCountBySchedule.get(attendance.schedule_id) || 0) + 1
      );
    }

    const lessons = rows.map((row) => {
      const record = recordMap.get(row.id);
      const studentCount =
        studentCountByClass.get(row.class_id) || 0;
      const attendanceCount =
        attendanceCountBySchedule.get(row.id) || 0;

      const progressDone =
        Boolean(String(record?.progress || "").trim());

      /*
       * 숙제 없음도 실제 저장할 수 있도록
       * record가 존재하면서 homework가 null이 아니면 완료로 본다.
       * 기존 빈 문자열 저장도 작성 완료로 취급한다.
       */
      const homeworkDone =
        Boolean(record) &&
        record?.homework !== null &&
        record?.homework !== undefined;

      const attendanceDone =
        studentCount === 0 ||
        attendanceCount >= studentCount;

      return {
        ...row,
        lessonDate: date,
        progressDone,
        homeworkDone,
        attendanceDone,
        studentCount,
        attendanceCount,
      };
    });

    return NextResponse.json({
      ok: true,
      date,
      role: session.role,
      displayName: session.displayName,
      lessons,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { ok: false, message: "오늘 시간표 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
