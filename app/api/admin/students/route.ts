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

function makeStudentCode(){
  return `S${Date.now().toString().slice(-9)}`;
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

  // 이관 시 birth_date 컬럼이 없는 DB도 화면 자체는 열리도록 fallback.
  let hasBirthDate=true;

  let result=await db
    .from("students")
    .select(`
      id,
      student_code,
      student_name,
      school,
      registered_grade,
      birth_date,
      class_id,
      status,
      classes (
        class_name
      )
    `)
    .order("student_name",{ascending:true});

  if(result.error){
    hasBirthDate=false;

    result=await db
      .from("students")
      .select(`
        id,
        student_code,
        student_name,
        school,
        registered_grade,
        class_id,
        status,
        classes (
          class_name
        )
      `)
      .order("student_name",{ascending:true});
  }

  if(result.error){
    console.error("admin students:",result.error);

    return NextResponse.json(
      {ok:false,message:"학생 목록을 불러오지 못했습니다."},
      {status:500}
    );
  }

  return NextResponse.json({
    ok:true,
    hasBirthDate,
    students:(result.data||[]).map((student:any)=>({
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

  const baseRow={
    student_name:studentName,
    school:nullable(body.school),
    registered_grade:nullable(body.registeredGrade),
    class_id:nullable(body.classId),
    status:text(body.status)||"재원"
  };

  const fullRow={
    ...baseRow,
    student_code:text(body.studentCode)||makeStudentCode(),
    birth_date:nullable(body.birthDate)
  };

  let {error}=await db
    .from("students")
    .insert(fullRow);

  if(error){
    // 선택 컬럼이 없는 구조라면 최소 필드로 한 번 더 시도.
    console.warn("student insert full row failed:",error.message);

    const retry=await db
      .from("students")
      .insert(baseRow);

    error=retry.error;
  }

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

  const baseRow={
    student_name:studentName,
    school:nullable(body.school),
    registered_grade:nullable(body.registeredGrade),
    class_id:nullable(body.classId),
    status:text(body.status)||"재원"
  };

  const fullRow={
    ...baseRow,
    birth_date:nullable(body.birthDate)
  };

  let {error}=await db
    .from("students")
    .update(fullRow)
    .eq("id",id);

  if(error){
    console.warn("student update full row failed:",error.message);

    const retry=await db
      .from("students")
      .update(baseRow)
      .eq("id",id);

    error=retry.error;
  }

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
