import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

function cleanBody(b:any){
  return {
    event_type:String(b.eventType||"기타").trim()||"기타",
    title:String(b.title||"").trim(),
    start_date:String(b.startDate||"").trim(),
    end_date:String(b.endDate||b.startDate||"").trim(),
    teacher_id:b.teacherId||null,
    memo:String(b.memo||"").trim()||null,
    updated_at:new Date().toISOString()
  };
}

function validRow(row:ReturnType<typeof cleanBody>){
  return Boolean(
    row.title &&
    /^\d{4}-\d{2}-\d{2}$/.test(row.start_date) &&
    /^\d{4}-\d{2}-\d{2}$/.test(row.end_date) &&
    row.start_date<=row.end_date
  );
}

export async function POST(req:Request){
  const session=await getCurrentSession();

  if(!session||session.role!=="admin"){
    return NextResponse.json(
      {ok:false,message:"관리자 전용입니다."},
      {status:403}
    );
  }

  const body=await req.json();
  const row=cleanBody(body);

  if(!validRow(row)){
    return NextResponse.json(
      {ok:false,message:"제목과 날짜를 확인해주세요."},
      {status:400}
    );
  }

  const db=getSupabaseAdmin();
  const {error}=await db
    .from("academy_calendar_events")
    .insert(row);

  if(error){
    console.error(error);

    return NextResponse.json(
      {ok:false,message:"일정 저장에 실패했습니다."},
      {status:500}
    );
  }

  return NextResponse.json({ok:true});
}

export async function PUT(req:Request){
  const session=await getCurrentSession();

  if(!session||session.role!=="admin"){
    return NextResponse.json(
      {ok:false,message:"관리자 전용입니다."},
      {status:403}
    );
  }

  const body=await req.json();
  const id=String(body.id||"").trim();
  const row=cleanBody(body);

  if(!id||!validRow(row)){
    return NextResponse.json(
      {ok:false,message:"일정 정보를 확인해주세요."},
      {status:400}
    );
  }

  const db=getSupabaseAdmin();
  const {error}=await db
    .from("academy_calendar_events")
    .update(row)
    .eq("id",id);

  if(error){
    console.error(error);

    return NextResponse.json(
      {ok:false,message:"일정 수정에 실패했습니다."},
      {status:500}
    );
  }

  return NextResponse.json({ok:true});
}

export async function DELETE(req:Request){
  const session=await getCurrentSession();

  if(!session||session.role!=="admin"){
    return NextResponse.json(
      {ok:false,message:"관리자 전용입니다."},
      {status:403}
    );
  }

  const body=await req.json();
  const id=String(body.id||"").trim();

  if(!id){
    return NextResponse.json(
      {ok:false,message:"삭제할 일정이 없습니다."},
      {status:400}
    );
  }

  const db=getSupabaseAdmin();
  const {error}=await db
    .from("academy_calendar_events")
    .delete()
    .eq("id",id);

  if(error){
    console.error(error);

    return NextResponse.json(
      {ok:false,message:"일정 삭제에 실패했습니다."},
      {status:500}
    );
  }

  return NextResponse.json({ok:true});
}
