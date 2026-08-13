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

function makeTeacherCode(existing:string[]){
  const nums=existing
    .map(code=>/^T(\d+)$/.exec(code))
    .filter(Boolean)
    .map(match=>Number((match as RegExpExecArray)[1]))
    .filter(Number.isFinite);

  const next=(nums.length?Math.max(...nums):0)+1;
  return `T${String(next).padStart(3,"0")}`;
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

  const [
    {data:teachers,error:teacherError},
    {data:schedules,error:scheduleError},
    {data:classes,error:classError},
    {data:credentials,error:credentialError}
  ]=await Promise.all([
    db
      .from("teachers")
      .select("id,teacher_code,teacher_name,is_active")
      .order("teacher_code",{ascending:true}),
    db
      .from("schedules")
      .select("id,teacher_id")
      .eq("is_active",true),
    db
      .from("classes")
      .select("id,primary_teacher_id"),
    db
      .from("login_credentials")
      .select("teacher_id,is_active")
      .eq("role","teacher")
  ]);

  if(teacherError||scheduleError||classError||credentialError){
    console.error(
      "admin teachers:",
      teacherError,
      scheduleError,
      classError,
      credentialError
    );

    return NextResponse.json(
      {ok:false,message:"선생님관리 데이터를 불러오지 못했습니다."},
      {status:500}
    );
  }

  const scheduleCounts=new Map<string,number>();
  const primaryClassCounts=new Map<string,number>();
  const loginMap=new Map<string,boolean>();

  (schedules||[]).forEach((row:any)=>{
    if(!row.teacher_id)return;
    scheduleCounts.set(
      row.teacher_id,
      (scheduleCounts.get(row.teacher_id)||0)+1
    );
  });

  (classes||[]).forEach((row:any)=>{
    if(!row.primary_teacher_id)return;
    primaryClassCounts.set(
      row.primary_teacher_id,
      (primaryClassCounts.get(row.primary_teacher_id)||0)+1
    );
  });

  (credentials||[]).forEach((row:any)=>{
    if(!row.teacher_id)return;
    loginMap.set(row.teacher_id,Boolean(row.is_active));
  });

  return NextResponse.json({
    ok:true,
    teachers:(teachers||[]).map((teacher:any)=>({
      ...teacher,
      schedule_count:scheduleCounts.get(teacher.id)||0,
      primary_class_count:primaryClassCounts.get(teacher.id)||0,
      has_login:loginMap.has(teacher.id),
      login_active:loginMap.get(teacher.id)??false
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
  const teacherName=text(body.teacherName);
  const pin=text(body.pin);

  if(!teacherName){
    return NextResponse.json(
      {ok:false,message:"선생님 이름을 입력해주세요."},
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

  const {data:existing,error:existingError}=await db
    .from("teachers")
    .select("teacher_code");

  if(existingError){
    return NextResponse.json(
      {ok:false,message:"선생님 코드를 생성하지 못했습니다."},
      {status:500}
    );
  }

  const teacherCode=
    text(body.teacherCode)||
    makeTeacherCode(
      (existing||[]).map((row:any)=>String(row.teacher_code||""))
    );

  const {data:teacher,error:insertError}=await db
    .from("teachers")
    .insert({
      teacher_code:teacherCode,
      teacher_name:teacherName,
      is_active:true
    })
    .select("id,teacher_code,teacher_name,is_active")
    .single();

  if(insertError||!teacher){
    console.error("teacher insert:",insertError);

    return NextResponse.json(
      {ok:false,message:"선생님 등록에 실패했습니다. 선생님 코드 중복 여부를 확인해주세요."},
      {status:500}
    );
  }

  const {error:pinError}=await db.rpc(
    "set_teacher_login_pin",
    {
      input_teacher_id:teacher.id,
      input_teacher_code:teacher.teacher_code,
      input_display_name:teacher.teacher_name,
      input_pin:pin,
      input_is_active:true
    }
  );

  if(pinError){
    console.error("teacher pin create:",pinError);

    await db
      .from("teachers")
      .delete()
      .eq("id",teacher.id);

    return NextResponse.json(
      {ok:false,message:"PIN 생성에 실패했습니다. 12차 DB SQL을 먼저 실행해주세요."},
      {status:500}
    );
  }

  return NextResponse.json({
    ok:true,
    teacher
  });
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
  const teacherName=text(body.teacherName);
  const teacherCode=text(body.teacherCode);
  const isActive=body.isActive!==false;

  if(!id||!teacherName||!teacherCode){
    return NextResponse.json(
      {ok:false,message:"선생님 정보를 확인해주세요."},
      {status:400}
    );
  }

  const db=getSupabaseAdmin();

  const {error:updateError}=await db
    .from("teachers")
    .update({
      teacher_code:teacherCode,
      teacher_name:teacherName,
      is_active:isActive
    })
    .eq("id",id);

  if(updateError){
    console.error("teacher update:",updateError);

    return NextResponse.json(
      {ok:false,message:"선생님 정보 수정에 실패했습니다."},
      {status:500}
    );
  }

  const {error:syncError}=await db.rpc(
    "sync_teacher_login_profile",
    {
      input_teacher_id:id,
      input_teacher_code:teacherCode,
      input_display_name:teacherName,
      input_is_active:isActive
    }
  );

  if(syncError){
    console.error("teacher login sync:",syncError);

    return NextResponse.json(
      {ok:false,message:"선생님 정보는 수정됐지만 로그인 정보 동기화에 실패했습니다. 12차 DB SQL을 확인해주세요."},
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
      {ok:false,message:"삭제할 선생님이 없습니다."},
      {status:400}
    );
  }

  const db=getSupabaseAdmin();

  const [
    {count:scheduleCount},
    {count:classCount},
    {count:makeupCount}
  ]=await Promise.all([
    db
      .from("schedules")
      .select("id",{count:"exact",head:true})
      .eq("teacher_id",id),
    db
      .from("classes")
      .select("id",{count:"exact",head:true})
      .eq("primary_teacher_id",id),
    db
      .from("makeup_lessons")
      .select("id",{count:"exact",head:true})
      .eq("teacher_id",id)
  ]);

  if(
    (scheduleCount||0)>0||
    (classCount||0)>0||
    (makeupCount||0)>0
  ){
    return NextResponse.json(
      {
        ok:false,
        message:"시간표·주담당 반·보강 기록이 연결된 선생님은 삭제할 수 없습니다. 비활성으로 변경해주세요."
      },
      {status:409}
    );
  }

  const {error}=await db
    .from("teachers")
    .delete()
    .eq("id",id);

  if(error){
    console.error("teacher delete:",error);

    return NextResponse.json(
      {ok:false,message:"선생님 삭제에 실패했습니다."},
      {status:500}
    );
  }

  return NextResponse.json({ok:true});
}
