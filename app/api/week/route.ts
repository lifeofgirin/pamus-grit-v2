import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getKoreaDate } from "@/lib/korea-time";
import { getLessonsForDate } from "@/lib/schedule-ops";

export const runtime="nodejs";
export const dynamic="force-dynamic";

function parseKoreaDate(date:string){ return new Date(`${date}T00:00:00+09:00`); }
function addDays(date:Date,n:number){ return new Date(date.getTime()+n*86400000); }
function key(date:Date){
  const f = new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"});
  return f.format(date);
}
function monday(base:string){ const d=parseKoreaDate(base); const day=d.getDay(); return addDays(d,day===0?-6:1-day); }

export async function GET(request:Request){
  try{
    const session=await getCurrentSession();
    if(!session) return NextResponse.json({ok:false,message:"로그인이 필요합니다."},{status:401});
    const url=new URL(request.url);
    const base=url.searchParams.get("date")||getKoreaDate().date;
    const mon=monday(base);
    const days=Array.from({length:5},(_,i)=>({date:key(addDays(mon,i)),dayOfWeek:i+1}));
    const supabase=getSupabaseAdmin();
    const responseDays=[];

    for(const day of days){
      const {lessons:rows,events,vacation}=await getLessonsForDate(day.date,day.dayOfWeek,session);
      if(!rows.length){ responseDays.push({...day,lessons:[],events,vacation}); continue; }
      const scheduleIds=rows.map((r:any)=>r.id);
      const classIds=[...new Set(rows.map((r:any)=>r.class_id))];
      const [records,attendance,students]=await Promise.all([
        supabase.from("lesson_records").select("schedule_id,progress,homework").eq("lesson_date",day.date).in("schedule_id",scheduleIds),
        supabase.from("attendance").select("schedule_id,student_id").eq("lesson_date",day.date).in("schedule_id",scheduleIds),
        supabase.from("students").select("id,class_id").eq("status","재원").in("class_id",classIds)
      ]);
      const rm=new Map((records.data||[]).map((r:any)=>[r.schedule_id,r]));
      const sm=new Map<string,number>(); for(const s of students.data||[]) sm.set(s.class_id,(sm.get(s.class_id)||0)+1);
      const am=new Map<string,number>(); for(const a of attendance.data||[]) am.set(a.schedule_id,(am.get(a.schedule_id)||0)+1);
      const lessons=rows.map((r:any)=>{ const rec:any=rm.get(r.id); const sc=sm.get(r.class_id)||0; const ac=am.get(r.id)||0; return {...r,
        progressDone:Boolean(String(rec?.progress||"").trim()), homeworkDone:Boolean(rec)&&rec?.homework!==null&&rec?.homework!==undefined,
        attendanceDone:sc===0||ac>=sc, studentCount:sc, attendanceCount:ac}; });
      responseDays.push({...day,lessons,events,vacation});
    }
    return NextResponse.json({ok:true,weekStart:days[0].date,weekEnd:days[4].date,days:responseDays});
  }catch(error){ console.error(error); return NextResponse.json({ok:false,message:"주간 시간표 조회 중 오류가 발생했습니다."},{status:500}); }
}
