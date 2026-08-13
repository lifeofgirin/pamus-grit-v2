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
  const teacherId=String(body.teacherId||"").trim();
  const pin=String(body.pin||"").trim();

  if(!teacherId){
    return NextResponse.json(
      {ok:false,message:"선생님 정보가 없습니다."},
      {status:400}
    );
  }

  if(!/^\d{4,8}$/.test(pin)){
    return NextResponse.json(
      {ok:false,message:"PIN은 숫자 4~8자리로 입력해주세요."},
      {status:400}
    );
  }

  const db=getSupabaseAdmin();

  const {data:teacher,error:teacherError}=await db
    .from("teachers")
    .select("id,teacher_code,teacher_name,is_active")
    .eq("id",teacherId)
    .single();

  if(teacherError||!teacher){
    return NextResponse.json(
      {ok:false,message:"선생님을 찾을 수 없습니다."},
      {status:404}
    );
  }

  const {error}=await db.rpc(
    "set_teacher_login_pin",
    {
      input_teacher_id:teacher.id,
      input_teacher_code:teacher.teacher_code,
      input_display_name:teacher.teacher_name,
      input_pin:pin,
      input_is_active:teacher.is_active!==false
    }
  );

  if(error){
    console.error("teacher pin reset:",error);

    return NextResponse.json(
      {ok:false,message:"PIN 재설정에 실패했습니다. 12차 DB SQL을 확인해주세요."},
      {status:500}
    );
  }

  return NextResponse.json({ok:true});
}
