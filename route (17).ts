import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
export async function POST(req:Request){
 const s=await getCurrentSession(); if(!s||s.role!=="admin") return NextResponse.json({ok:false,message:"관리자 전용입니다."},{status:403});
 const b=await req.json(); const db=getSupabaseAdmin();
 const row={schedule_id:b.scheduleId,change_date:b.date,status:b.status||"정상",start_time:b.startTime||null,end_time:b.endTime||null,subject:b.subject||null,room:b.room||null,teacher_id:b.teacherId||null,memo:b.memo||null,updated_at:new Date().toISOString()};
 const {error}=await db.from("daily_schedule_changes").upsert(row,{onConflict:"schedule_id,change_date"});
 if(error){console.error(error); return NextResponse.json({ok:false,message:"변경 저장에 실패했습니다."},{status:500});}
 return NextResponse.json({ok:true});
}
export async function DELETE(req:Request){
 const s=await getCurrentSession(); if(!s||s.role!=="admin") return NextResponse.json({ok:false},{status:403});
 const b=await req.json(); const db=getSupabaseAdmin();
 const {error}=await db.from("daily_schedule_changes").delete().eq("schedule_id",b.scheduleId).eq("change_date",b.date);
 if(error) return NextResponse.json({ok:false,message:"변경 취소에 실패했습니다."},{status:500});
 return NextResponse.json({ok:true});
}
