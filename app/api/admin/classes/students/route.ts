import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function PUT(req:Request){
  const session=await getCurrentSession();

  if(!session||session.role!=="admin"){
    return NextResponse.json(
      {ok:false,message:"관리자 전용입니다."},
      {status:403}
    );
  }

  const body=await req.json();
  const studentId=String(body.studentId||"").trim();
  const classId=String(body.classId||"").trim()||null;

  if(!studentId){
    return NextResponse.json(
      {ok:false,message:"학생 정보가 없습니다."},
      {status:400}
    );
  }

  const db=getSupabaseAdmin();

  const {error}=await db
    .from("students")
    .update({class_id:classId})
    .eq("id",studentId);

  if(error){
    console.error("class student assignment:",error);

    return NextResponse.json(
      {ok:false,message:"학생 반 배정 변경에 실패했습니다."},
      {status:500}
    );
  }

  return NextResponse.json({ok:true});
}
