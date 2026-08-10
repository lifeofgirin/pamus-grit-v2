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
    if (!session) return NextResponse.json({ ok:false, message:"로그인이 필요합니다." }, { status:401 });

    const { date, dayOfWeek } = getKoreaDate();
    const supabase = getSupabaseAdmin();
    const { lessons: rows, events, vacation } = await getLessonsForDate(date, dayOfWeek, session);

    if (!rows.length) return NextResponse.json({ ok:true, date, role:session.role, displayName:session.displayName, lessons:[], events, vacation });

    const scheduleIds = rows.map((r:any)=>r.id);
    const classIds = [...new Set(rows.map((r:any)=>r.class_id))];
    const [records, attendance, students] = await Promise.all([
      supabase.from("lesson_records").select("schedule_id, progress, homework").eq("lesson_date",date).in("schedule_id",scheduleIds),
      supabase.from("attendance").select("schedule_id, student_id").eq("lesson_date",date).in("schedule_id",scheduleIds),
      supabase.from("students").select("id, class_id").eq("status","재원").in("class_id",classIds)
    ]);

    const recordMap = new Map((records.data||[]).map((r:any)=>[r.schedule_id,r]));
    const studentCount = new Map<string,number>();
    for (const s of students.data||[]) studentCount.set(s.class_id,(studentCount.get(s.class_id)||0)+1);
    const attCount = new Map<string,number>();
    for (const a of attendance.data||[]) attCount.set(a.schedule_id,(attCount.get(a.schedule_id)||0)+1);

    const lessons = rows.map((row:any)=>{
      const rec:any = recordMap.get(row.id);
      const sc = studentCount.get(row.class_id)||0;
      const ac = attCount.get(row.id)||0;
      return { ...row,
        progressDone:Boolean(String(rec?.progress||"").trim()),
        homeworkDone:Boolean(rec) && rec?.homework !== null && rec?.homework !== undefined,
        attendanceDone:sc===0 || ac>=sc,
        studentCount:sc, attendanceCount:ac
      };
    });

    return NextResponse.json({ ok:true, date, role:session.role, displayName:session.displayName, lessons, events, vacation });
  } catch(error) {
    console.error(error);
    return NextResponse.json({ ok:false, message:"오늘 시간표 조회 중 오류가 발생했습니다." }, { status:500 });
  }
}
