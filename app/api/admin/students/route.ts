import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

async function requireAdmin(){
  const session=await getCurrentSession();

  if(!session||session.role!=="admin"){
    return null;
  }

  return session;
}

function text(v:any){
  return String(v??"").trim();
}

function nullable(v:any){
  const value=text(v);
  return value||null;
}


export async function GET(){
  const session=await requireAdmin();

  if(!session){
    return NextResponse.json(
      {ok:false,message:"관리자 전용입니다."},
      {status:403}
    );
  }

  const db=getSupabaseAdmin();

  const {data,error}=await db
    .from("students")
    .select(`
      id,
      student_name,
      school,
      registered_grade,
      registered_school_year,
      birth_date,
      class_id,
      classes (
        class_name
      )
    `)
    .order("student_name",{ascending:true});

  if(error){
    console.error("admin students:",error);

    return NextResponse.json(
      {ok:false,message:"학생 목록을 불러오지 못했습니다."},
      {status:500}
    );
  }

  return NextResponse.json({
    ok:true,
    hasBirthDate:true,
    students:(data||[]).map((student:any)=>({
      ...student,
      birth_date:student.birth_date||""
    }))
  });
}

export async function POST(req:Request){
  const session=await requireAdmin();

  if(!session){
    return NextResponse.json(
      {ok:false,message:"관리자 전용입니다."},
      {status:403}
    );
  }

  const body=await req.json();
  const studentName=text(body.studentName);

  if(!studentName){
    return NextResponse.json(
      {ok:false,message:"학생 이름을 입력해주세요."},
      {status:400}
    );
  }

  const db=getSupabaseAdmin();

  const row={
    student_name:studentName,
    school:nullable(body.school),
    registered_grade:nullable(body.registeredGrade),
    registered_school_year:Number(body.registeredSchoolYear)||new Date().getFullYear(),
    birth_date:nullable(body.birthDate),
    class_id:nullable(body.classId)
  };

  const {error}=await db
    .from("students")
    .insert(row);

  if(error){
    console.error("student insert:",error);

    return NextResponse.json(
      {ok:false,message:"학생 등록에 실패했습니다."},
      {status:500}
    );
  }

  return NextResponse.json({ok:true});
}

export async function PUT(req:Request){
  const session=await requireAdmin();

  if(!session){
    return NextResponse.json(
      {ok:false,message:"관리자 전용입니다."},
      {status:403}
    );
  }

  const body=await req.json();
  const id=text(body.id);
  const studentName=text(body.studentName);

  if(!id||!studentName){
    return NextResponse.json(
      {ok:false,message:"학생 정보를 확인해주세요."},
      {status:400}
    );
  }

  const db=getSupabaseAdmin();

  const row={
    student_name:studentName,
    school:nullable(body.school),
    registered_grade:nullable(body.registeredGrade),
    registered_school_year:Number(body.registeredSchoolYear)||new Date().getFullYear(),
    birth_date:nullable(body.birthDate),
    class_id:nullable(body.classId)
  };

  const {error}=await db
    .from("students")
    .update(row)
    .eq("id",id);

  if(error){
    console.error("student update:",error);

    return NextResponse.json(
      {ok:false,message:"학생 수정에 실패했습니다."},
      {status:500}
    );
  }

  return NextResponse.json({ok:true});
}

export async function DELETE(req:Request){
  const session=await requireAdmin();

  if(!session){
    return NextResponse.json(
      {ok:false,message:"관리자 전용입니다."},
      {status:403}
    );
  }

  const body=await req.json();
  const id=text(body.id);

  if(!id){
    return NextResponse.json(
      {ok:false,message:"삭제할 학생이 없습니다."},
      {status:400}
    );
  }

  const db=getSupabaseAdmin();

  const {error}=await db
    .from("students")
    .delete()
    .eq("id",id);

  if(error){
    console.error("student delete:",error);

    return NextResponse.json(
      {ok:false,message:"학생 삭제에 실패했습니다. 출결 기록 등이 연결되어 있으면 삭제 대신 상태를 변경해주세요."},
      {status:500}
    );
  }

  return NextResponse.json({ok:true});
}
