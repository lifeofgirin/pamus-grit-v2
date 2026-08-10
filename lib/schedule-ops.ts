import { getSupabaseAdmin } from "@/lib/supabase-admin";

type SessionLike = {
  role: "teacher" | "admin";
  teacherId: string | null;
};

export async function getLessonsForDate(date: string, dayOfWeek: number, session: SessionLike) {
  const supabase = getSupabaseAdmin();

  const [{ data: base, error: baseError }, { data: changes, error: changesError }, { data: events, error: eventsError }] = await Promise.all([
    supabase.from("schedules").select(`
      id, schedule_code, class_id, day_of_week, start_time, end_time, subject, room, teacher_id, is_active,
      classes ( class_code, class_name ),
      teachers ( teacher_code, teacher_name )
    `).eq("is_active", true),
    supabase.from("daily_schedule_changes").select(`
      id, schedule_id, change_date, status, start_time, end_time, subject, room, teacher_id, memo,
      teachers ( teacher_code, teacher_name )
    `).eq("change_date", date),
    supabase.from("academy_calendar_events").select(`
      id, event_type, title, start_date, end_date, teacher_id, memo,
      teachers ( teacher_code, teacher_name )
    `).lte("start_date", date).gte("end_date", date)
  ]);

  if (baseError) throw baseError;
  if (changesError) throw changesError;
  if (eventsError) throw eventsError;

  const vacation = (events || []).some((e: any) => e.event_type === "학원방학");
  const changeMap = new Map((changes || []).map((c: any) => [c.schedule_id, c]));

  const relevant = (base || []).filter((s: any) => {
    const change = changeMap.get(s.id) as any;
    return s.day_of_week === dayOfWeek || change?.status === "보강";
  });

  let lessons = relevant.map((s: any) => {
    const change = changeMap.get(s.id) as any;
    const effectiveTeacherId = change?.teacher_id || s.teacher_id;
    const effectiveTeacher = change?.teacher_id ? change.teachers : s.teachers;

    return {
      ...s,
      start_time: change?.start_time || s.start_time,
      end_time: change?.end_time || s.end_time,
      subject: change?.subject ?? s.subject,
      room: change?.room ?? s.room,
      teacher_id: effectiveTeacherId,
      teachers: effectiveTeacher,
      lessonDate: date,
      operationStatus: vacation ? "학원방학" : (change?.status || "정상"),
      operationMemo: change?.memo || "",
      changeId: change?.id || null,
    };
  });

  if (session.role === "teacher") {
    lessons = lessons.filter((lesson: any) => lesson.teacher_id === session.teacherId);
  }

  lessons.sort((a: any, b: any) => String(a.start_time).localeCompare(String(b.start_time)));

  let visibleEvents = events || [];
  if (session.role === "teacher") {
    visibleEvents = visibleEvents.filter((e: any) => !e.teacher_id || e.teacher_id === session.teacherId);
  }

  return { lessons, events: visibleEvents, vacation };
}
