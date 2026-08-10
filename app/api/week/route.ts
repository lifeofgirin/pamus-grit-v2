import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getKoreaDate } from "@/lib/korea-time";
import { getLessonsForDate } from "@/lib/schedule-ops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseKoreaDate(date: string) {
  return new Date(
    `${date}T00:00:00+09:00`
  );
}

function addDays(
  date: Date,
  amount: number
) {
  return new Date(
    date.getTime() +
      amount * 86400000
  );
}

function dateKey(date: Date) {
  const parts =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }
    ).formatToParts(date);

  const map =
    Object.fromEntries(
      parts.map((p) => [
        p.type,
        p.value,
      ])
    );

  return `${map.year}-${map.month}-${map.day}`;
}

function getMonday(
  dateString: string
) {
  const date =
    parseKoreaDate(dateString);

  const day = date.getDay();

  const offset =
    day === 0
      ? -6
      : 1 - day;

  return addDays(
    date,
    offset
  );
}

export async function GET(
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

    const url =
      new URL(request.url);

    const baseDate =
      url.searchParams.get("date") ||
      getKoreaDate().date;

    const monday =
      getMonday(baseDate);

    const days =
      Array.from(
        { length: 5 },
        (_, index) => ({
          date: dateKey(
            addDays(
              monday,
              index
            )
          ),
          dayOfWeek:
            index + 1,
        })
      );

    const supabase =
      getSupabaseAdmin();

    const responseDays = [];

    for (const day of days) {
      const {
        lessons: rows,
        events,
        vacation,
      } =
        await getLessonsForDate(
          day.date,
          day.dayOfWeek,
          session
        );

      const regularRows =
        rows.filter(
          (row: any) =>
            !row.isCustomMakeup
        );

      const scheduleIds =
        regularRows.map(
          (row: any) =>
            row.id
        );

      const classIds = [
        ...new Set(
          regularRows
            .map(
              (row: any) =>
                row.class_id
            )
            .filter(Boolean)
        ),
      ];

      let recordsData: any[] = [];
      let attendanceData: any[] = [];
      let studentsData: any[] = [];

      if (scheduleIds.length) {
        const [
          recordsResult,
          attendanceResult,
        ] =
          await Promise.all([
            supabase
              .from(
                "lesson_records"
              )
              .select(
                "schedule_id, progress, homework"
              )
              .eq(
                "lesson_date",
                day.date
              )
              .in(
                "schedule_id",
                scheduleIds
              ),

            supabase
              .from(
                "attendance"
              )
              .select(
                "schedule_id, student_id"
              )
              .eq(
                "lesson_date",
                day.date
              )
              .in(
                "schedule_id",
                scheduleIds
              ),
          ]);

        if (recordsResult.error) {
          console.error(
            "week records:",
            recordsResult.error
          );
        }

        if (
          attendanceResult.error
        ) {
          console.error(
            "week attendance:",
            attendanceResult.error
          );
        }

        recordsData =
          recordsResult.data || [];

        attendanceData =
          attendanceResult.data || [];
      }

      if (classIds.length) {
        const studentsResult =
          await supabase
            .from("students")
            .select(
              "id, class_id"
            )
            .eq(
              "status",
              "재원"
            )
            .in(
              "class_id",
              classIds
            );

        if (studentsResult.error) {
          console.error(
            "week students:",
            studentsResult.error
          );
        }

        studentsData =
          studentsResult.data || [];
      }

      const recordMap =
        new Map(
          recordsData.map(
            (record: any) => [
              record.schedule_id,
              record,
            ]
          )
        );

      const studentCount =
        new Map<string, number>();

      for (
        const student
        of studentsData
      ) {
        studentCount.set(
          student.class_id,
          (studentCount.get(
            student.class_id
          ) || 0) + 1
        );
      }

      const attendanceCount =
        new Map<string, number>();

      for (
        const attendance
        of attendanceData
      ) {
        attendanceCount.set(
          attendance.schedule_id,
          (attendanceCount.get(
            attendance.schedule_id
          ) || 0) + 1
        );
      }

      const lessons =
        rows.map(
          (row: any) => {
            if (
              row.isCustomMakeup
            ) {
              return row;
            }

            const record: any =
              recordMap.get(row.id);

            const students =
              studentCount.get(
                row.class_id
              ) || 0;

            const attendance =
              attendanceCount.get(
                row.id
              ) || 0;

            return {
              ...row,

              progressDone:
                Boolean(
                  String(
                    record?.progress ||
                      ""
                  ).trim()
                ),

              homeworkDone:
                Boolean(record) &&
                record?.homework !==
                  null &&
                record?.homework !==
                  undefined,

              attendanceDone:
                students === 0 ||
                attendance >=
                  students,

              studentCount:
                students,

              attendanceCount:
                attendance,
            };
          }
        );

      responseDays.push({
        ...day,
        lessons,
        events,
        vacation,
      });
    }

    return NextResponse.json({
      ok: true,

      weekStart:
        days[0].date,

      weekEnd:
        days[4].date,

      days:
        responseDays,
    });
  } catch (error) {
    console.error(
      "week route:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        message:
          "주간 시간표를 불러오지 못했습니다.",
      },
      { status: 500 }
    );
  }
}
