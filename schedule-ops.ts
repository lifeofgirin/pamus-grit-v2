import { getSupabaseAdmin } from "@/lib/supabase-admin";

type SessionLike = {
  role: "teacher" | "admin";
  teacherId: string | null;
};

export async function getLessonsForDate(
  date: string,
  dayOfWeek: number,
  session: SessionLike
) {
  const supabase = getSupabaseAdmin();

  const [
    baseResult,
    changesResult,
    eventsResult,
    makeupResult,
  ] = await Promise.all([
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
        valid_from,
        valid_to,
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
      .lte("valid_from", date)
      .or(`valid_to.is.null,valid_to.gte.${date}`),

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
      .eq("change_date", date),

    supabase
      .from("academy_calendar_events")
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
      .lte("start_date", date)
      .gte("end_date", date),

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
        created_by_role,
        classes (
          class_code,
          class_name
        ),
        teachers (
          teacher_code,
          teacher_name
        )
      `)
      .eq("makeup_date", date),
  ]);

  if (baseResult.error) throw baseResult.error;
  if (changesResult.error) throw changesResult.error;
  if (eventsResult.error) throw eventsResult.error;
  if (makeupResult.error) throw makeupResult.error;

  const base = baseResult.data || [];
  const changes = changesResult.data || [];
  const events = eventsResult.data || [];
  const makeups = makeupResult.data || [];

  const vacation = events.some(
    (event: any) => event.event_type === "학원방학"
  );

  const changeMap = new Map(
    changes.map((change: any) => [
      change.schedule_id,
      change,
    ])
  );

  let lessons: any[] = base
    .filter((schedule: any) => {
      const change: any = changeMap.get(schedule.id);

      return (
        schedule.day_of_week === dayOfWeek ||
        change?.status === "보강"
      );
    })
    .map((schedule: any) => {
      const change: any =
        changeMap.get(schedule.id);

      const effectiveTeacherId =
        change?.teacher_id ||
        schedule.teacher_id;

      const effectiveTeacher =
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
          effectiveTeacherId,

        teachers:
          effectiveTeacher,

        lessonDate: date,

        operationStatus:
          vacation
            ? "학원방학"
            : change?.status || "정상",

        operationMemo:
          change?.memo || "",

        changeId:
          change?.id || null,

        isCustomMakeup: false,
      };
    });

  const customMakeups = makeups.map(
    (makeup: any) => ({
      id: `makeup_${makeup.id}`,
      makeupId: makeup.id,
      schedule_code:
        `MAKEUP_${makeup.id}`,
      class_id:
        makeup.class_id || null,
      day_of_week: dayOfWeek,

      start_time: makeup.start_time,
      end_time: makeup.end_time,

      subject:
        makeup.subject || "보강",

      room: makeup.room,

      teacher_id:
        makeup.teacher_id,

      teachers:
        makeup.teachers,

      classes:
        makeup.classes || {
          class_code: "MAKEUP",
          class_name: makeup.title,
        },

      lessonDate: date,

      operationStatus: "보강",
      operationMemo:
        makeup.memo || "",

      isCustomMakeup: true,

      progressDone: true,
      homeworkDone: true,
      attendanceDone: true,
      studentCount: 0,
      attendanceCount: 0,
    })
  );

  lessons = [
    ...lessons,
    ...customMakeups,
  ];

  if (session.role === "teacher") {
    lessons = lessons.filter(
      (lesson: any) =>
        lesson.teacher_id ===
        session.teacherId
    );
  }

  lessons.sort((a: any, b: any) =>
    String(a.start_time).localeCompare(
      String(b.start_time)
    )
  );

  let visibleEvents = events;

  if (session.role === "teacher") {
    visibleEvents = events.filter(
      (event: any) =>
        !event.teacher_id ||
        event.teacher_id ===
          session.teacherId
    );
  }

  return {
    lessons,
    events: visibleEvents,
    vacation,
  };
}
