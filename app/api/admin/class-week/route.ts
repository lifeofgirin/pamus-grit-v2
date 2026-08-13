import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getKoreaDate } from "@/lib/korea-time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseDateParts(
  date: string
) {
  const [
    year,
    month,
    day,
  ] = date
    .split("-")
    .map(Number);

  return {
    year,
    month,
    day,
  };
}

function toUtcDate(
  date: string
) {
  const {
    year,
    month,
    day,
  } = parseDateParts(date);

  return new Date(
    Date.UTC(
      year,
      month - 1,
      day
    )
  );
}

function addDays(
  date: Date,
  amount: number
) {
  const next =
    new Date(date);

  next.setUTCDate(
    next.getUTCDate() +
      amount
  );

  return next;
}

function toDateKey(
  date: Date
) {
  return [
    date.getUTCFullYear(),
    String(
      date.getUTCMonth() + 1
    ).padStart(2, "0"),
    String(
      date.getUTCDate()
    ).padStart(2, "0"),
  ].join("-");
}

function getMonday(
  baseDate: string
) {
  const date =
    toUtcDate(baseDate);

  const day =
    date.getUTCDay();

  const offset =
    day === 0
      ? -6
      : 1 - day;

  return addDays(
    date,
    offset
  );
}

export async function GET(request: Request) {
  try {
    const session = await getCurrentSession();

    if (!session) {
      return NextResponse.json(
        {
          ok: false,
          message: "로그인이 필요합니다.",
        },
        { status: 401 }
      );
    }

    const url = new URL(request.url);
    const classId = String(
      url.searchParams.get("classId") || ""
    ).trim();

    const baseDate =
      url.searchParams.get("date") ||
      getKoreaDate().date;

    if (!classId) {
      return NextResponse.json(
        { ok: false, message: "반을 선택해주세요." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    if (session.role === "teacher") {
      if (!session.teacherId) {
        return NextResponse.json(
          {
            ok: false,
            message: "선생님 정보가 없습니다.",
          },
          { status: 403 }
        );
      }

      const {
        data: accessSchedule,
        error: accessError,
      } = await supabase
        .from("schedules")
        .select("id")
        .eq("class_id", classId)
        .eq(
          "teacher_id",
          session.teacherId
        )
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      if (accessError) {
        throw accessError;
      }

      if (!accessSchedule) {
        return NextResponse.json(
          {
            ok: false,
            message:
              "본인이 담당하는 반만 확인할 수 있습니다.",
          },
          { status: 403 }
        );
      }
    }

    const monday = getMonday(baseDate);

    const days = Array.from(
      { length: 5 },
      (_, index) => ({
        date: toDateKey(addDays(monday, index)),
        dayOfWeek: index + 1,
      })
    );

    const weekStart = days[0].date;
    const weekEnd = days[4].date;

    const [
      classResult,
      schedulesResult,
      changesResult,
      recordsResult,
      makeupsResult,
      makeupRecordsResult,
    ] = await Promise.all([
      supabase
        .from("classes")
        .select("id, class_code, class_name")
        .eq("id", classId)
        .maybeSingle(),

      supabase
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
          valid_from,
          valid_to,
          teachers (
            teacher_code,
            teacher_name
          )
        `)
        .eq("class_id", classId)
        .eq("is_active", true)
        .lte("valid_from",weekEnd)
        .or(`valid_to.is.null,valid_to.gte.${weekStart}`)
        .in("day_of_week", [1, 2, 3, 4, 5])
        .order("day_of_week", { ascending: true })
        .order("start_time", { ascending: true }),

      supabase
        .from("daily_schedule_changes")
        .select(`
          id,
          schedule_id,
          change_date,
          status,
          start_time,
          end_time,
          subject,
          room,
          teacher_id,
          memo,
          teachers (
            teacher_code,
            teacher_name
          )
        `)
        .gte("change_date", weekStart)
        .lte("change_date", weekEnd),

      Promise.resolve({
        data: [],
        error: null,
      }),

      supabase
        .from("makeup_lessons")
        .select(`
          id,
          makeup_date,
          title,
          start_time,
          end_time,
          subject,
          room,
          teacher_id,
          class_id,
          memo,
          teachers (
            teacher_code,
            teacher_name
          )
        `)
        .eq("class_id",classId)
        .gte("makeup_date",weekStart)
        .lte("makeup_date",weekEnd),

      supabase
        .from("makeup_lesson_records")
        .select(`
          makeup_lesson_id,
          class_id,
          lesson_date,
          teacher_id,
          progress,
          homework,
          lesson_memo,
          teachers (
            teacher_code,
            teacher_name
          )
        `)
        .eq("class_id",classId)
        .gte("lesson_date",weekStart)
        .lte("lesson_date",weekEnd),
    ]);

    if (classResult.error) throw classResult.error;
    if (schedulesResult.error) throw schedulesResult.error;
    if (changesResult.error) throw changesResult.error;
    if (makeupsResult.error) throw makeupsResult.error;
    if (makeupRecordsResult.error) throw makeupRecordsResult.error;

    if (!classResult.data) {
      return NextResponse.json(
        { ok: false, message: "반 정보를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const schedules = schedulesResult.data || [];
    const changes = changesResult.data || [];
    const makeups = makeupsResult.data || [];
    const makeupRecords = makeupRecordsResult.data || [];

    /*
     * v7.1:
     * 반별 요약은 lesson_records.class_id를 믿지 않는다.
     * 기존 저장 기록 중 class_id가 비어 있어도 잡히도록
     * 이 반의 schedule_id 목록으로 기록을 조회한다.
     */
    const scheduleIds = schedules.map(
      (schedule: any) => schedule.id
    );

    let records: any[] = [];

    if (scheduleIds.length) {
      const recordsByScheduleResult =
        await supabase
          .from("lesson_records")
          .select(`
            schedule_id,
            class_id,
            lesson_date,
            teacher_id,
            progress,
            homework,
            lesson_memo,
            teachers (
              teacher_code,
              teacher_name
            )
          `)
          .in("schedule_id", scheduleIds)
          .gte("lesson_date", weekStart)
          .lte("lesson_date", weekEnd)
          .order("lesson_date", {
            ascending: true,
          });

      if (recordsByScheduleResult.error) {
        throw recordsByScheduleResult.error;
      }

      records =
        recordsByScheduleResult.data || [];
    }

    const changeMap = new Map<string, any>();

    for (const change of changes) {
      changeMap.set(
        `${change.schedule_id}__${change.change_date}`,
        change
      );
    }

    const scheduleMap = new Map(
      schedules.map((schedule: any) => [
        schedule.id,
        schedule,
      ])
    );

    const responseDays = days.map((day) => {
      const lessons = schedules
        .filter(
          (schedule: any) =>
            schedule.day_of_week === day.dayOfWeek &&
            schedule.valid_from<=day.date &&
            (
              !schedule.valid_to ||
              schedule.valid_to>=day.date
            )
        )
        .map((schedule: any) => {
          const change = changeMap.get(
            `${schedule.id}__${day.date}`
          );

          const teacher =
            change?.teacher_id
              ? change.teachers
              : schedule.teachers;

          return {
            id: schedule.id,
            schedule_code: schedule.schedule_code,
            lessonDate: day.date,

            start_time:
              change?.start_time ||
              schedule.start_time,

            end_time:
              change?.end_time ||
              schedule.end_time,

            subject:
              change?.subject ??
              schedule.subject,

            room:
              change?.room ??
              schedule.room,

            teacher_id:
              change?.teacher_id ||
              schedule.teacher_id,

            teachers: teacher,

            operationStatus:
              change?.status || "정상",

            operationMemo:
              change?.memo || "",
          };
        })
        .concat(
          makeups
            .filter((makeup:any)=>makeup.makeup_date===day.date)
            .map((makeup:any)=>({
              id:`makeup_${makeup.id}`,
              makeupId:makeup.id,
              schedule_code:`MAKEUP_${makeup.id}`,
              class_id:makeup.class_id,
              lessonDate:day.date,
              start_time:makeup.start_time,
              end_time:makeup.end_time,
              subject:makeup.subject||"추가수업",
              room:makeup.room,
              teacher_id:makeup.teacher_id,
              teachers:makeup.teachers,
              operationStatus:"보강",
              operationMemo:makeup.memo||"",
              isCustomMakeup:true
            }))
        )
        .sort((a: any, b: any) =>
          String(a.start_time).localeCompare(
            String(b.start_time)
          )
        );

      return {
        ...day,
        lessons,
      };
    });

    const summaryRecords = records.map((record: any) => {
      const schedule = scheduleMap.get(
        record.schedule_id
      ) as any;

      return {
        schedule_id: record.schedule_id,
        lesson_date: record.lesson_date,

        teacher_name:
          record.teachers?.teacher_name ||
          schedule?.teachers?.teacher_name ||
          "선생님 미지정",

        subject:
          schedule?.subject || "",

        progress:
          record.progress || "",

        homework:
          record.homework || "",

        lesson_memo:
          record.lesson_memo || "",
      };
    });

    const makeupMap = new Map(
      makeups.map((makeup:any)=>[makeup.id,makeup])
    );

    summaryRecords.push(
      ...makeupRecords.map((record:any)=>{
        const makeup:any=
          makeupMap.get(record.makeup_lesson_id);

        return {
          schedule_id:`makeup_${record.makeup_lesson_id}`,
          lesson_date:record.lesson_date,

          teacher_name:
            record.teachers?.teacher_name ||
            makeup?.teachers?.teacher_name ||
            "선생님 미지정",

          subject:
            makeup?.subject || "추가수업",

          progress:
            record.progress || "",

          homework:
            record.homework || "",

          lesson_memo:
            record.lesson_memo || "",
        };
      })
    );

    summaryRecords.sort((a:any,b:any)=>
      String(a.lesson_date).localeCompare(String(b.lesson_date))
    );

    return NextResponse.json({
      ok: true,
      classInfo: classResult.data,
      weekStart,
      weekEnd,
      days: responseDays,
      records: summaryRecords,
    });
  } catch (error) {
    console.error("class-week:", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          "반별 주간 정보를 불러오지 못했습니다.",
      },
      { status: 500 }
    );
  }
}
