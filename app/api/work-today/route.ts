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

    const regularRows = rows.filter(
      (row: any) =>
        !row.isCustomMakeup &&
        row.operationStatus !== "휴강" &&
        row.operationStatus !== "학원방학"
    );

    const scheduleIds = regularRows.map(
      (row: any) => row.id
    );

    const classIds = [
      ...new Set(
        regularRows
          .map((row: any) => row.class_id)
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
      ] = await Promise.all([
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
      ]);

      if (recordsResult.error) {
        console.error(
          "work records:",
          recordsResult.error
        );
      } else {
        recordsData =
          recordsResult.data || [];
      }

      if (attendanceResult.error) {
        console.error(
          "work attendance:",
          attendanceResult.error
        );
      } else {
        attendanceData =
          attendanceResult.data || [];
      }
    }

    if (classIds.length) {
      const studentsResult =
        await supabase
          .from("students")
          .select("id, class_id")
          .eq("status", "재원")
          .in("class_id", classIds);

      if (studentsResult.error) {
        console.error(
          "work students:",
          studentsResult.error
        );
      } else {
        studentsData =
          studentsResult.data || [];
      }
    }

    const recordMap = new Map(
      recordsData.map(
        (record: any) => [
          record.schedule_id,
          record,
        ]
      )
    );

    const studentCountMap =
      new Map<string, number>();

    for (const student of studentsData) {
      studentCountMap.set(
        student.class_id,
        (studentCountMap.get(
          student.class_id
        ) || 0) + 1
      );
    }

    const attendanceCountMap =
      new Map<string, number>();

    for (
      const attendance
      of attendanceData
    ) {
      attendanceCountMap.set(
        attendance.schedule_id,
        (attendanceCountMap.get(
          attendance.schedule_id
        ) || 0) + 1
      );
    }

    const items = rows.map(
      (row: any) => {
        if (row.isCustomMakeup) {
          return {
            ...row,
            progressDone: true,
            homeworkDone: true,
            attendanceDone: true,
            pendingCount: 0,
            workExcluded: true,
          };
        }

        if (
          row.operationStatus ===
            "휴강" ||
          row.operationStatus ===
            "학원방학"
        ) {
          return {
            ...row,
            progressDone: true,
            homeworkDone: true,
            attendanceDone: true,
            pendingCount: 0,
            workExcluded: true,
          };
        }

        const record: any =
          recordMap.get(row.id);

        const studentCount =
          studentCountMap.get(
            row.class_id
          ) || 0;

        const attendanceCount =
          attendanceCountMap.get(
            row.id
          ) || 0;

        const progressDone =
          Boolean(
            String(
              record?.progress || ""
            ).trim()
          );

        const homeworkDone =
          Boolean(record) &&
          record?.homework !== null &&
          record?.homework !== undefined;

        const attendanceDone =
          studentCount === 0 ||
          attendanceCount >=
            studentCount;

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

    const activeItems = items.filter(
      (item: any) =>
        !item.workExcluded
    );

    const summary = {
      totalLessons:
        activeItems.length,

      completeLessons:
        activeItems.filter(
          (item: any) =>
            item.pendingCount === 0
        ).length,

      pendingLessons:
        activeItems.filter(
          (item: any) =>
            item.pendingCount > 0
        ).length,

      progressPending:
        activeItems.filter(
          (item: any) =>
            !item.progressDone
        ).length,

      homeworkPending:
        activeItems.filter(
          (item: any) =>
            !item.homeworkDone
        ).length,

      attendancePending:
        activeItems.filter(
          (item: any) =>
            !item.attendanceDone
        ).length,
    };

    let teacherGroups: any[] = [];

    if (session.role === "admin") {
      const groupMap =
        new Map<string, any>();

      for (const item of activeItems) {
        const teacherId =
          item.teacher_id ||
          "unassigned";

        const teacherName =
          item.teachers
            ?.teacher_name ||
          "미지정";

        if (
          !groupMap.has(
            teacherId
          )
        ) {
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
          groupMap.get(
            teacherId
          );

        group.totalLessons += 1;

        if (
          item.pendingCount === 0
        ) {
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
          String(
            a.teacherName
          ).localeCompare(
            String(
              b.teacherName
            ),
            "ko"
          )
      );
    }

    return NextResponse.json({
      ok: true,
      date,
      role: session.role,
      displayName:
        session.displayName,
      summary,
      items: activeItems,
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
          "오늘 업무 현황을 불러오지 못했습니다.",
      },
      { status: 500 }
    );
  }
}
