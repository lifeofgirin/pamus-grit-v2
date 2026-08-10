import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
export async function POST(req:Request){
 const s=await getCurrentSession(); if(!s||s.role!=="admin") return NextResponse.json({ok:false,message:"관리자 전용입니다."},{status:403});
 const b=await req.json(); const db=getSupabaseAdmin();
 const row={event_type:b.eventType,title:b.title,start_date:b.startDate,end_date:b.endDate,teacher_id:b.teacherId||null,memo:b.memo||null,updated_at:new Date().toISOString()};
 const {error}=await db.from("academy_calendar_events").insert(row);
 if(error){console.error(error);return NextResponse.json({ok:false,message:"일정 저장에 실패했습니다."},{status:500});}
 return NextResponse.json({ok:true});
}
