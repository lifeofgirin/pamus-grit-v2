import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getKoreaDate } from "@/lib/korea-time";

export async function GET(){
 const s=await getCurrentSession();
 if(!s||s.role!=="admin") return NextResponse.json({ok:false},{status:403});

 const db=getSupabaseAdmin();
 const today=getKoreaDate().date;

 const [teachers,classes,schedules]=await Promise.all([
  db.from("teachers")
    .select("id,teacher_code,teacher_name")
    .eq("is_active",true)
    .order("teacher_code"),
  db.from("classes")
    .select("id,class_code,class_name")
    .order("class_code"),
  db.from("schedules")
    .select("id,schedule_code,class_id,start_time,end_time,subject,room,teacher_id,day_of_week,valid_from,valid_to,classes(class_name),teachers(teacher_name)")
    .eq("is_active",true)
    .lte("valid_from",today)
    .or(`valid_to.is.null,valid_to.gte.${today}`)
    .order("schedule_code")
 ]);

 return NextResponse.json({
  ok:true,
  teachers:teachers.data||[],
  classes:classes.data||[],
  schedules:schedules.data||[]
 });
}
