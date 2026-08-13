import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getKoreaDate } from "@/lib/korea-time";
import { getLessonsForDate } from "@/lib/schedule-ops";

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

    const {
      lessons: rows,
      events,
    } = await getLessonsForDate(
      date,
      dayOfWeek,
      session
    );

    const activeRows = rows.filter(
      (row: any) =>
        row.operationStatus !== "휴강" &&
        row.operationStatus !== "학원방학"
    );

    const regularRows = activeRows.filter(
      (row: any) => !row.isCustomMakeup
    );

    const makeupRows = activeRows.filter(
      (row: any) =>
        row.isCustomMakeup &&
        row.makeupId
    );

    const scheduleIds = regularRows
      .map((row: any) => row.id)
      .filter(Boolean);

    const makeupIds = makeupRows
      .map((row: any) => row.makeupId)
      .filter(Boolean);

    const classIds = [
      ...new Set(
        activeRows
          .map((row: any) => row.class_id)
          .filter(Boolean)
      ),
    ];

    let recordsData: any[] = [];
    let attendanceData: any[] = [];
    let makeupRecordsData: any[] = [];
    let makeupAttendanceData: any[] = [];
    let studentsData: any[] = [];

    const jobs: Promise<any>[] = [];

    if (scheduleIds.length) {
      jobs.push(
        Promise.all([
          supabase
            .from("lesson_records")
            .select(
              "schedule_id, progress, homework"
            )
            .eq("lesson_date", date)
            .in("schedule_id", scheduleIds),

          supabase
            .from("attendance")
            .select(
              "schedule_id, student_id"
            )
            .eq("lesson_date", date)
            .in("schedule_id", scheduleIds),
        ]).then(([recordsResult, attendanceResult]) => {
          if (recordsResult.error) {
            console.error("work regular records:", recordsResult.error);
          } else {
            recordsData = recordsResult.data || [];
          }

          if (attendanceResult.error) {
            console.error("work regular attendance:", attendanceResult.error);
          } else {
            attendanceData = attendanceResult.data || [];
          }
        })
      );
    }

    if (makeupIds.length) {
      jobs.push(
        Promise.all([
          supabase
            .from("makeup_lesson_records")
            .select(
              "makeup_lesson_id, progress, homework"
            )
            .eq("lesson_date", date)
            .in("makeup_lesson_id", makeupIds),

          supabase
            .from("makeup_attendance")
            .select(
              "makeup_lesson_id, student_id"
            )
            .eq("lesson_date", date)
            .in("makeup_lesson_id", makeupIds),
        ]).then(([recordsResult, attendanceResult]) => {
          if (recordsResult.error) {
            console.error("work makeup records:", recordsResult.error);
          } else {
            makeupRecordsData = recordsResult.data || [];
          }

          if (attendanceResult.error) {
            console.error("work makeup attendance:", attendanceResult.error);
          } else {
            makeupAttendanceData = attendanceResult.data || [];
          }
        })
      );
    }

    if (classIds.length) {
      jobs.push(
        supabase
          .from("students")
          .select("id, class_id")
          .in("class_id", classIds)
          .then((studentsResult: any) => {
            if (studentsResult.error) {
              console.error("work students:", studentsResult.error);
            } else {
              studentsData = studentsResult.data || [];
            }
          })
      );
    }

    await Promise.all(jobs);

    const regularRecordMap = new Map(
      recordsData.map((record: any) => [
        record.schedule_id,
        record,
      ])
    );

    const makeupRecordMap = new Map(
      makeupRecordsData.map((record: any) => [
        record.makeup_lesson_id,
        record,
      ])
    );

    const studentCountMap =
      new Map<string, number>();

    for (const student of studentsData) {
      if (!student.class_id) continue;

      studentCountMap.set(
        student.class_id,
        (studentCountMap.get(student.class_id) || 0) + 1
      );
    }

    const regularAttendanceCountMap =
      new Map<string, number>();

    for (const attendance of attendanceData) {
      regularAttendanceCountMap.set(
        attendance.schedule_id,
        (regularAttendanceCountMap.get(attendance.schedule_id) || 0) + 1
      );
    }

    const makeupAttendanceCountMap =
      new Map<string, number>();

    for (const attendance of makeupAttendanceData) {
      makeupAttendanceCountMap.set(
        attendance.makeup_lesson_id,
        (makeupAttendanceCountMap.get(attendance.makeup_lesson_id) || 0) + 1
      );
    }

    const items = activeRows.map(
      (row: any) => {
        const isMakeup =
          Boolean(row.isCustomMakeup && row.makeupId);

        const record: any =
          isMakeup
            ? makeupRecordMap.get(row.makeupId)
            : regularRecordMap.get(row.id);

        const studentCount =
          row.class_id
            ? (studentCountMap.get(row.class_id) || 0)
            : 0;

        const attendanceCount =
          isMakeup
            ? (makeupAttendanceCountMap.get(row.makeupId) || 0)
            : (regularAttendanceCountMap.get(row.id) || 0);

        const progressDone =
          Boolean(
            String(
              record?.progress || ""
            ).trim()
          );

        // 숙제는 빈 문자열도 "숙제 없음"으로 저장할 수 있으므로
        // 레코드가 만들어졌으면 작성 완료로 판단한다.
        const homeworkDone =
          Boolean(record) &&
          record?.homework !== null &&
          record?.homework !== undefined;

        const attendanceDone =
          studentCount === 0 ||
          attendanceCount >= studentCount;

        return {
          ...row,
          progressDone,
          homeworkDone,
          attendanceDone,
          studentCount,
          attendanceCount,
          pendingCount:
            Number(!progressDone) +
            Number(!homeworkDone) +
            Number(!attendanceDone),
          workExcluded: false,
        };
      }
    );

    const summary = {
      totalLessons: items.length,

      completeLessons:
        items.filter(
          (item: any) =>
            item.pendingCount === 0
        ).length,

      pendingLessons:
        items.filter(
          (item: any) =>
            item.pendingCount > 0
        ).length,

      progressPending:
        items.filter(
          (item: any) =>
            !item.progressDone
        ).length,

      homeworkPending:
        items.filter(
          (item: any) =>
            !item.homeworkDone
        ).length,

      attendancePending:
        items.filter(
          (item: any) =>
            !item.attendanceDone
        ).length,
    };

    let teacherGroups: any[] = [];

    if (session.role === "admin") {
      const groupMap =
        new Map<string, any>();

      for (const item of items) {
        const teacherId =
          item.teacher_id ||
          "unassigned";

        const teacherName =
          item.teachers?.teacher_name ||
          "미지정";

        if (!groupMap.has(teacherId)) {
          groupMap.set(
            teacherId,
            {
              teacherId,
              teacherName,
              totalLessons: 0,
              completeLessons: 0,
              pendingLessons: 0,
              progressPending: 0,
              homeworkPending: 0,
              attendancePending: 0,
              items: [],
            }
          );
        }

        const group =
          groupMap.get(teacherId);

        group.totalLessons += 1;

        if (item.pendingCount === 0) {
          group.completeLessons += 1;
        } else {
          group.pendingLessons += 1;
        }

        if (!item.progressDone) {
          group.progressPending += 1;
        }

        if (!item.homeworkDone) {
          group.homeworkPending += 1;
        }

        if (!item.attendanceDone) {
          group.attendancePending += 1;
        }

        group.items.push(item);
      }

      teacherGroups = [
        ...groupMap.values(),
      ].sort(
        (a: any, b: any) =>
          String(a.teacherName).localeCompare(
            String(b.teacherName),
            "ko"
          )
      );
    }

    return NextResponse.json({
      ok: true,
      date,
      role: session.role,
      displayName: session.displayName,
      summary,
      items,
      teacherGroups,
      events,
    });
  } catch (error) {
    console.error(
      "work-today:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? `오늘 업무 현황 오류: ${error.message}`
            : "오늘 업무 현황을 불러오지 못했습니다.",
      },
      { status: 500 }
    );
  }
}
