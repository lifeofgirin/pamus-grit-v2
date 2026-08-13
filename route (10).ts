import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

async function requireAdmin(){
  const session=await getCurrentSession();
  return session?.role==="admin" ? session : null;
}

function text(v:any){
  return String(v??"").trim();
}

function nullable(v:any){
  const value=text(v);
  return value||null;
}

function makeClassCode(){
  return `C${Date.now().toString().slice(-9)}`;
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

  const [{data:classes,error:classError},{data:students,error:studentError}]=await Promise.all([
    db
      .from("classes")
      .select(`
        id,
        class_code,
        class_name,
        primary_teacher_id,
        teachers:primary_teacher_id (
          teacher_name
        )
      `)
      .order("class_name",{ascending:true}),
    db
      .from("students")
      .select(`
        id,
        student_name,
        school,
        registered_grade,
        class_id
      `)
      .order("student_name",{ascending:true})
  ]);

  if(classError||studentError){
    console.error("admin classes:",classError,studentError);

    return NextResponse.json(
      {ok:false,message:"반관리 데이터를 불러오지 못했습니다. DB SQL 적용 여부를 확인해주세요."},
      {status:500}
    );
  }

  const counts=new Map<string,number>();

  (students||[]).forEach((student:any)=>{
    if(!student.class_id)return;
    counts.set(student.class_id,(counts.get(student.class_id)||0)+1);
  });

  return NextResponse.json({
    ok:true,
    classes:(classes||[]).map((row:any)=>({
      ...row,
      student_count:counts.get(row.id)||0
    })),
    students:students||[]
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
  const className=text(body.className);

  if(!className){
    return NextResponse.json(
      {ok:false,message:"반 이름을 입력해주세요."},
      {status:400}
    );
  }

  const db=getSupabaseAdmin();

  const row={
    class_code:text(body.classCode)||makeClassCode(),
    class_name:className,
    primary_teacher_id:nullable(body.primaryTeacherId)
  };

  const {error}=await db
    .from("classes")
    .insert(row);

  if(error){
    console.error("class insert:",error);

    return NextResponse.json(
      {ok:false,message:"반 등록에 실패했습니다. 반 코드 중복 여부를 확인해주세요."},
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
  const className=text(body.className);

  if(!id||!className){
    return NextResponse.json(
      {ok:false,message:"반 정보를 확인해주세요."},
      {status:400}
    );
  }

  const db=getSupabaseAdmin();

  const row={
    class_name:className,
    primary_teacher_id:nullable(body.primaryTeacherId)
  };

  const {error}=await db
    .from("classes")
    .update(row)
    .eq("id",id);

  if(error){
    console.error("class update:",error);

    return NextResponse.json(
      {ok:false,message:"반 수정에 실패했습니다."},
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
      {ok:false,message:"삭제할 반이 없습니다."},
      {status:400}
    );
  }

  const db=getSupabaseAdmin();

  const [{count:studentCount},{count:scheduleCount}]=await Promise.all([
    db
      .from("students")
      .select("id",{count:"exact",head:true})
      .eq("class_id",id),
    db
      .from("schedules")
      .select("id",{count:"exact",head:true})
      .eq("class_id",id)
  ]);

  if((studentCount||0)>0||(scheduleCount||0)>0){
    return NextResponse.json(
      {
        ok:false,
        message:"학생 또는 시간표가 연결된 반은 삭제할 수 없습니다. 먼저 학생을 제외하고 시간표 연결을 정리해주세요."
      },
      {status:409}
    );
  }

  const {error}=await db
    .from("classes")
    .delete()
    .eq("id",id);

  if(error){
    console.error("class delete:",error);

    return NextResponse.json(
      {ok:false,message:"반 삭제에 실패했습니다."},
      {status:500}
    );
  }

  return NextResponse.json({ok:true});
}
