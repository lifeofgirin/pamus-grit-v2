import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getKoreaDate } from "@/lib/korea-time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseKoreaDate(
  date: string
) {
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

function dateKey(
  date: Date
) {
  const parts =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }
    ).formatToParts(date);

  const map =
    Object.fromEntries(
      parts.map((part) => [
        part.type,
        part.value,
      ])
    );

  return (
    `${map.year}-` +
    `${map.month}-` +
    `${map.day}`
  );
}

function getMonday(
  baseDate: string
) {
  const date =
    parseKoreaDate(
      baseDate
    );

  const day =
    date.getDay();

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
        {
          status: 401,
        }
      );
    }

    const url =
      new URL(request.url);

    const baseDate =
      url.searchParams.get(
        "date"
      ) ||
      getKoreaDate().date;

    const monday =
      getMonday(
        baseDate
      );

    const days =
      Array.from(
        {
          length: 5,
        },
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

    const weekStart =
      days[0].date;

    const weekEnd =
      days[4].date;

    const supabase =
      getSupabaseAdmin();

    /*
     * v5.2 핵심:
     * 날짜별 반복 조회를 제거한다.
     *
     * 주간 전체에서 필요한 데이터를
     * 각각 딱 한 번씩만 가져온다.
     */
    const [
      schedulesResult,
      changesResult,
      eventsResult,
      makeupsResult,
    ] =
      await Promise.all([
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
            is_active,
            classes (
              class_code,
              class_name
            ),
            teachers (
              teacher_code,
              teacher_name
            )
          `)
          .eq(
            "is_active",
            true
          )
          .in(
            "day_of_week",
            [1, 2, 3, 4, 5]
          )
          .order(
            "day_of_week",
            {
              ascending:
                true,
            }
          )
          .order(
            "start_time",
            {
              ascending:
                true,
            }
          ),

        supabase
          .from(
            "daily_schedule_changes"
          )
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
          .gte(
            "change_date",
            weekStart
          )
          .lte(
            "change_date",
            weekEnd
          ),

        supabase
          .from(
            "academy_calendar_events"
          )
          .select(`
            id,
            event_type,
            title,
            start_date,
            end_date,
            teacher_id,
            memo,
            teachers (
              teacher_code,
              teacher_name
            )
          `)
          .lte(
            "start_date",
            weekEnd
          )
          .gte(
            "end_date",
            weekStart
          ),

        supabase
          .from(
            "makeup_lessons"
          )
          .select(`
            id,
            makeup_date,
            title,
            start_time,
            end_time,
            subject,
            room,
            teacher_id,
            memo,
            created_by_role,
            teachers (
              teacher_code,
              teacher_name
            )
          `)
          .gte(
            "makeup_date",
            weekStart
          )
          .lte(
            "makeup_date",
            weekEnd
          ),
      ]);

    if (
      schedulesResult.error
    ) {
      throw schedulesResult.error;
    }

    if (
      changesResult.error
    ) {
      throw changesResult.error;
    }

    if (
      eventsResult.error
    ) {
      throw eventsResult.error;
    }

    if (
      makeupsResult.error
    ) {
      throw makeupsResult.error;
    }

    const schedules =
      schedulesResult.data ||
      [];

    const changes =
      changesResult.data ||
      [];

    const events =
      eventsResult.data ||
      [];

    const makeups =
      makeupsResult.data ||
      [];

    /*
     * 변경사항 빠른 조회용:
     * schedule_id + 날짜
     */
    const changeMap =
      new Map<string, any>();

    for (
      const change
      of changes
    ) {
      changeMap.set(
        `${change.schedule_id}__${change.change_date}`,
        change
      );
    }

    /*
     * 먼저 주간 수업을 조립한다.
     * 이 단계에서는 진도/출결 DB를
     * 아직 조회하지 않는다.
     */
    const rawDays =
      days.map((day) => {
        const dayEvents =
          events.filter(
            (event: any) =>
              event.start_date <=
                day.date &&
              event.end_date >=
                day.date
          );

        const vacation =
          dayEvents.some(
            (event: any) =>
              event.event_type ===
              "학원방학"
          );

        let lessons: any[] =
          schedules
            .filter(
              (
                schedule: any
              ) => {
                const change =
                  changeMap.get(
                    `${schedule.id}__${day.date}`
                  );

                return (
                  schedule.day_of_week ===
                    day.dayOfWeek ||
                  change?.status ===
                    "보강"
                );
              }
            )
            .map(
              (
                schedule: any
              ) => {
                const change =
                  changeMap.get(
                    `${schedule.id}__${day.date}`
                  );

                const teacherId =
                  change?.teacher_id ||
                  schedule.teacher_id;

                const teacher =
                  change?.teacher_id
                    ? change.teachers
                    : schedule.teachers;

                return {
                  ...schedule,

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
                    teacherId,

                  teachers:
                    teacher,

                  lessonDate:
                    day.date,

                  operationStatus:
                    vacation
                      ? "학원방학"
                      : change?.status ||
                        "정상",

                  operationMemo:
                    change?.memo ||
                    "",

                  changeId:
                    change?.id ||
                    null,

                  isCustomMakeup:
                    false,
                };
              }
            );

        const dayMakeups =
          makeups
            .filter(
              (makeup: any) =>
                makeup.makeup_date ===
                day.date
            )
            .map(
              (makeup: any) => ({
                id:
                  `makeup_${makeup.id}`,

                makeupId:
                  makeup.id,

                schedule_code:
                  `MAKEUP_${makeup.id}`,

                class_id:
                  null,

                day_of_week:
                  day.dayOfWeek,

                start_time:
                  makeup.start_time,

                end_time:
                  makeup.end_time,

                subject:
                  makeup.subject ||
                  "보강",

                room:
                  makeup.room,

                teacher_id:
                  makeup.teacher_id,

                teachers:
                  makeup.teachers,

                classes: {
                  class_code:
                    "MAKEUP",

                  class_name:
                    makeup.title,
                },

                lessonDate:
                  day.date,

                operationStatus:
                  "보강",

                operationMemo:
                  makeup.memo ||
                  "",

                isCustomMakeup:
                  true,

                progressDone:
                  true,

                homeworkDone:
                  true,

                attendanceDone:
                  true,

                studentCount:
                  0,

                attendanceCount:
                  0,
              })
            );

        lessons = [
          ...lessons,
          ...dayMakeups,
        ];

        /*
         * 선생님 계정은
         * 최종 담당교사 기준으로 필터링.
         *
         * 당일 선생님 변경도
         * 정상 반영된다.
         */
        if (
          session.role ===
          "teacher"
        ) {
          lessons =
            lessons.filter(
              (
                lesson: any
              ) =>
                lesson.teacher_id ===
                session.teacherId
            );
        }

        let visibleEvents =
          dayEvents;

        if (
          session.role ===
          "teacher"
        ) {
          visibleEvents =
            dayEvents.filter(
              (
                event: any
              ) =>
                !event.teacher_id ||
                event.teacher_id ===
                  session.teacherId
            );
        }

        lessons.sort(
          (
            a: any,
            b: any
          ) =>
            String(
              a.start_time
            ).localeCompare(
              String(
                b.start_time
              )
            )
        );

        return {
          ...day,

          lessons,
          events:
            visibleEvents,

          vacation,
        };
      });

    /*
     * 완료상태 계산용 정규수업 목록.
     * 자유 보강은 학생/진도 테이블과
     * 연결하지 않는다.
     */
    const regularLessons =
      rawDays.flatMap(
        (day) =>
          day.lessons.filter(
            (
              lesson: any
            ) =>
              !lesson.isCustomMakeup
          )
      );

    const scheduleIds = [
      ...new Set(
        regularLessons.map(
          (
            lesson: any
          ) =>
            lesson.id
        )
      ),
    ];

    const classIds = [
      ...new Set(
        regularLessons
          .map(
            (
              lesson: any
            ) =>
              lesson.class_id
          )
          .filter(Boolean)
      ),
    ];

    let recordsData: any[] =
      [];

    let attendanceData: any[] =
      [];

    let studentsData: any[] =
      [];

    /*
     * 이것도 주간 범위당
     * 한 번씩만 조회.
     */
    const statusQueries = [];

    if (
      scheduleIds.length
    ) {
      statusQueries.push(
        supabase
          .from(
            "lesson_records"
          )
          .select(
            "schedule_id, lesson_date, progress, homework"
          )
          .gte(
            "lesson_date",
            weekStart
          )
          .lte(
            "lesson_date",
            weekEnd
          )
          .in(
            "schedule_id",
            scheduleIds
          )
      );

      statusQueries.push(
        supabase
          .from(
            "attendance"
          )
          .select(
            "schedule_id, lesson_date, student_id"
          )
          .gte(
            "lesson_date",
            weekStart
          )
          .lte(
            "lesson_date",
            weekEnd
          )
          .in(
            "schedule_id",
            scheduleIds
          )
      );
    }

    if (
      classIds.length
    ) {
      statusQueries.push(
        supabase
          .from(
            "students"
          )
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
          )
      );
    }

    if (
      statusQueries.length
    ) {
      const results =
        await Promise.all(
          statusQueries
        );

      let index = 0;

      if (
        scheduleIds.length
      ) {
        const recordsResult:
          any =
          results[index++];

        const attendanceResult:
          any =
          results[index++];

        if (
          recordsResult.error
        ) {
          console.error(
            "week records:",
            recordsResult.error
          );
        } else {
          recordsData =
            recordsResult.data ||
            [];
        }

        if (
          attendanceResult.error
        ) {
          console.error(
            "week attendance:",
            attendanceResult.error
          );
        } else {
          attendanceData =
            attendanceResult.data ||
            [];
        }
      }

      if (
        classIds.length
      ) {
        const studentsResult:
          any =
          results[index++];

        if (
          studentsResult.error
        ) {
          console.error(
            "week students:",
            studentsResult.error
          );
        } else {
          studentsData =
            studentsResult.data ||
            [];
        }
      }
    }

    const recordMap =
      new Map<string, any>();

    for (
      const record
      of recordsData
    ) {
      recordMap.set(
        `${record.schedule_id}__${record.lesson_date}`,
        record
      );
    }

    const attendanceCountMap =
      new Map<
        string,
        number
      >();

    for (
      const attendance
      of attendanceData
    ) {
      const key =
        `${attendance.schedule_id}__${attendance.lesson_date}`;

      attendanceCountMap.set(
        key,
        (
          attendanceCountMap.get(
            key
          ) || 0
        ) + 1
      );
    }

    const studentCountMap =
      new Map<
        string,
        number
      >();

    for (
      const student
      of studentsData
    ) {
      studentCountMap.set(
        student.class_id,
        (
          studentCountMap.get(
            student.class_id
          ) || 0
        ) + 1
      );
    }

    const responseDays =
      rawDays.map(
        (day) => ({
          ...day,

          lessons:
            day.lessons.map(
              (
                lesson: any
              ) => {
                if (
                  lesson.isCustomMakeup
                ) {
                  return lesson;
                }

                const key =
                  `${lesson.id}__${day.date}`;

                const record =
                  recordMap.get(
                    key
                  );

                const studentCount =
                  studentCountMap.get(
                    lesson.class_id
                  ) || 0;

                const attendanceCount =
                  attendanceCountMap.get(
                    key
                  ) || 0;

                return {
                  ...lesson,

                  progressDone:
                    Boolean(
                      String(
                        record?.progress ||
                          ""
                      ).trim()
                    ),

                  homeworkDone:
                    Boolean(
                      record
                    ) &&
                    record?.homework !==
                      null &&
                    record?.homework !==
                      undefined,

                  attendanceDone:
                    studentCount ===
                      0 ||
                    attendanceCount >=
                      studentCount,

                  studentCount,

                  attendanceCount,
                };
              }
            ),
        })
      );

    return NextResponse.json({
      ok: true,

      weekStart,
      weekEnd,

      days:
        responseDays,

      meta: {
        queryMode:
          "bulk-v5.2",

        lessonCount:
          responseDays.reduce(
            (
              total,
              day
            ) =>
              total +
              day.lessons
                .length,
            0
          ),
      },
    });
  } catch (error) {
    console.error(
      "week v5.2:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        message:
          "주간 시간표를 불러오지 못했습니다.",
      },
      {
        status: 500,
      }
    );
  }
}
