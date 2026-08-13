import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getKoreaDate } from "@/lib/korea-time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getAccessibleSchedule(
  scheduleCode: string,
  teacherId: string | null,
  role: "teacher" | "admin",
  date: string
) {
  const supabase = getSupabaseAdmin();
  const { data: base, error } = await supabase
    .from("schedules")
    .select(`id,schedule_code,class_id,start_time,end_time,subject,room,teacher_id,classes(class_code,class_name),teachers(teacher_code,teacher_name)`)
    .eq("schedule_code", scheduleCode).eq("is_active", true).maybeSingle();
  if (error) throw error;
  if (!base) return null;
  const { data: change } = await supabase.from("daily_schedule_changes")
    .select(`status,start_time,end_time,subject,room,teacher_id,memo,teachers(teacher_code,teacher_name)`)
    .eq("schedule_id", base.id).eq("change_date", date).maybeSingle();
  const effective:any = { ...base,
    start_time: change?.start_time || base.start_time,
    end_time: change?.end_time || base.end_time,
    subject: change?.subject ?? base.subject,
    room: change?.room ?? base.room,
    teacher_id: change?.teacher_id || base.teacher_id,
    teachers: change?.teacher_id ? change.teachers : base.teachers,
    operationStatus: change?.status || "정상",
    operationMemo: change?.memo || ""
  };
  if (role === "teacher" && effective.teacher_id !== teacherId) return null;
  return effective;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ scheduleCode: string }> }
) {
  try {
    const session = await getCurrentSession();

    if (!session) {
      return NextResponse.json(
        { ok: false, message: "로그인이 필요합니다." },
        { status: 401 }
      );
    }

    const { scheduleCode } = await context.params;
    const url = new URL(request.url);
    const date =
      url.searchParams.get("date") || getKoreaDate().date;

    const schedule = await getAccessibleSchedule(
      scheduleCode,
      session.teacherId,
      session.role,
      date
    );

    if (!schedule) {
      return NextResponse.json(
        { ok: false, message: "접근할 수 없는 수업입니다." },
        { status: 403 }
      );
    }

    const supabase = getSupabaseAdmin();

    const [
      recordResult,
      studentsResult,
      attendanceResult,
    ] = await Promise.all([
      supabase
        .from("lesson_records")
        .select("progress, homework, lesson_memo")
        .eq("schedule_id", schedule.id)
        .eq("lesson_date", date)
        .maybeSingle(),

      supabase
        .from("students")
        .select(`
          id,
          student_name,
          school,
          registered_grade
        `)
        .eq("class_id", schedule.class_id)
        .order("student_name", { ascending: true }),

      supabase
        .from("attendance")
        .select(`
          student_id,
          attendance_status,
          attendance_memo,
          individual_memo
        `)
        .eq("schedule_id", schedule.id)
        .eq("lesson_date", date),
    ]);

    if (recordResult.error) {
      console.error("lesson record:", recordResult.error);
    }

    if (studentsResult.error) {
      console.error("lesson students:", studentsResult.error);
      throw new Error("학생 명단을 불러오지 못했습니다.");
    }

    if (attendanceResult.error) {
      console.error("lesson attendance:", attendanceResult.error);
      throw new Error("출결을 불러오지 못했습니다.");
    }

    const attendanceMap = new Map(
      (attendanceResult.data || []).map((row) => [
        row.student_id,
        row,
      ])
    );

    const students = (studentsResult.data || []).map((student) => {
      const attendance = attendanceMap.get(student.id);

      return {
        ...student,
        attendance_status:
          attendance?.attendance_status || "",
        attendance_memo:
          attendance?.attendance_memo || "",
        individual_memo:
          attendance?.individual_memo || "",
      };
    });

    return NextResponse.json({
      ok: true,
      date,
      schedule,
      record: recordResult.data || {
        progress: "",
        homework: "",
        lesson_memo: "",
      },
      students,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "수업 정보를 불러오지 못했습니다.",
      },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ scheduleCode: string }> }
) {
  try {
    const session = await getCurrentSession();

    if (!session) {
      return NextResponse.json(
        { ok: false, message: "로그인이 필요합니다." },
        { status: 401 }
      );
    }

    const { scheduleCode } = await context.params;
    const body = await request.json();

    const date =
      String(body?.lessonDate || "").trim() ||
      getKoreaDate().date;

    const progress =
      String(body?.progress ?? "").trim();

    const homework =
      String(body?.homework ?? "").trim();

    const lessonMemo =
      String(body?.lessonMemo ?? "").trim();

    const students =
      Array.isArray(body?.students)
        ? body.students
        : [];

    const schedule = await getAccessibleSchedule(
      scheduleCode,
      session.teacherId,
      session.role,
      date
    );

    if (!schedule) {
      return NextResponse.json(
        { ok: false, message: "접근할 수 없는 수업입니다." },
        { status: 403 }
      );
    }

    const supabase = getSupabaseAdmin();

    /*
     * 관리자 저장 시에는 실제 수업 담당 선생님을 기록자로 사용한다.
     */
    const recordTeacherId =
      session.role === "teacher"
        ? session.teacherId
        : schedule.teacher_id;

    const { error: recordError } = await supabase
      .from("lesson_records")
      .upsert(
        {
          schedule_id: schedule.id,
          class_id: schedule.class_id,
          lesson_date: date,
          teacher_id: recordTeacherId,
          progress,
          homework,
          lesson_memo: lessonMemo,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "schedule_id,lesson_date",
        }
      );

    if (recordError) {
      console.error("save lesson record:", recordError);
      return NextResponse.json(
        { ok: false, message: "진도·숙제 저장에 실패했습니다." },
        { status: 500 }
      );
    }

    /*
     * 출결은 상태를 선택한 학생만 저장한다.
     * 모든 학생을 선택해야 오늘 화면에서 '출결 완료'가 된다.
     */
    const attendanceRows = students
      .filter((student: any) =>
        ["출석", "지각", "결석", "보강"].includes(
          String(student?.attendance_status || "")
        )
      )
      .map((student: any) => ({
        schedule_id: schedule.id,
        class_id: schedule.class_id,
        student_id: String(student.id),
        lesson_date: date,
        attendance_status: String(
          student.attendance_status
        ),
        attendance_memo: String(
          student.attendance_memo || ""
        ).trim(),
        individual_memo: String(
          student.individual_memo || ""
        ).trim(),
        updated_at: new Date().toISOString(),
      }));

    if (attendanceRows.length > 0) {
      const { error: attendanceError } =
        await supabase
          .from("attendance")
          .upsert(attendanceRows, {
            onConflict:
              "schedule_id,student_id,lesson_date",
          });

      if (attendanceError) {
        console.error(
          "save attendance:",
          attendanceError
        );

        return NextResponse.json(
          {
            ok: false,
            message:
              "진도는 저장됐지만 출결 저장에 실패했습니다.",
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      ok: true,
      message: "수업 내용이 저장되었습니다.",
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "저장 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}
