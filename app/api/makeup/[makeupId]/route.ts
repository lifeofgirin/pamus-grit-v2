import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getKoreaDate } from "@/lib/korea-time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getAccessibleMakeup(
  makeupId:string,
  teacherId:string|null,
  role:"teacher"|"admin"
){
  const db=getSupabaseAdmin();

  const {data,error}=await db
    .from("makeup_lessons")
    .select(`
      id,
      makeup_date,
      title,
      start_time,
      end_time,
      subject,
      room,
      teacher_id,
      class_id,
      memo,
      classes (
        class_code,
        class_name
      ),
      teachers (
        teacher_code,
        teacher_name
      )
    `)
    .eq("id",makeupId)
    .maybeSingle();

  if(error)throw error;
  if(!data)return null;

  if(
    role==="teacher" &&
    data.teacher_id!==teacherId
  ){
    return null;
  }

  return data;
}

export async function GET(
  request:Request,
  context:{params:Promise<{makeupId:string}>}
){
  try{
    const session=await getCurrentSession();

    if(!session){
      return NextResponse.json(
        {ok:false,message:"로그인이 필요합니다."},
        {status:401}
      );
    }

    const {makeupId}=await context.params;
    const url=new URL(request.url);

    const date=
      url.searchParams.get("date")||
      getKoreaDate().date;

    const makeup:any=
      await getAccessibleMakeup(
        makeupId,
        session.teacherId,
        session.role
      );

    if(!makeup){
      return NextResponse.json(
        {ok:false,message:"접근할 수 없는 추가수업입니다."},
        {status:403}
      );
    }

    const db=getSupabaseAdmin();

    const recordPromise=db
      .from("makeup_lesson_records")
      .select("progress,homework,lesson_memo")
      .eq("makeup_lesson_id",makeup.id)
      .eq("lesson_date",date)
      .maybeSingle();

    const studentsPromise=makeup.class_id
      ?db
        .from("students")
        .select(`
          id,
          student_name,
          school,
          registered_grade
        `)
        .eq("class_id",makeup.class_id)
        .order("student_name",{ascending:true})
      :Promise.resolve({data:[],error:null});

    const attendancePromise=db
      .from("makeup_attendance")
      .select(`
        student_id,
        attendance_status,
        attendance_memo,
        individual_memo
      `)
      .eq("makeup_lesson_id",makeup.id)
      .eq("lesson_date",date);

    const[
      recordResult,
      studentsResult,
      attendanceResult
    ]=await Promise.all([
      recordPromise,
      studentsPromise,
      attendancePromise
    ]);

    if(recordResult.error){
      console.error("makeup record:",recordResult.error);
    }

    if(studentsResult.error){
      throw studentsResult.error;
    }

    if(attendanceResult.error){
      throw attendanceResult.error;
    }

    const attendanceMap=new Map(
      (attendanceResult.data||[]).map(
        (row:any)=>[row.student_id,row]
      )
    );

    const students=(studentsResult.data||[]).map(
      (student:any)=>{
        const attendance:any=
          attendanceMap.get(student.id);

        return{
          ...student,
          attendance_status:
            attendance?.attendance_status||"",
          attendance_memo:
            attendance?.attendance_memo||"",
          individual_memo:
            attendance?.individual_memo||""
        };
      }
    );

    return NextResponse.json({
      ok:true,
      date,
      schedule:{
        id:`makeup_${makeup.id}`,
        makeupId:makeup.id,
        schedule_code:`MAKEUP_${makeup.id}`,
        class_id:makeup.class_id,
        start_time:makeup.start_time,
        end_time:makeup.end_time,
        subject:makeup.subject||"추가수업",
        room:makeup.room,
        teacher_id:makeup.teacher_id,
        classes:
          makeup.classes||{
            class_code:"MAKEUP",
            class_name:makeup.title
          },
        teachers:makeup.teachers,
        lessonDate:date,
        operationStatus:"보강",
        operationMemo:makeup.memo||"",
        isCustomMakeup:true
      },
      record:recordResult.data||{
        progress:"",
        homework:"",
        lesson_memo:""
      },
      students
    });
  }catch(error){
    console.error("makeup detail:",error);

    return NextResponse.json(
      {
        ok:false,
        message:
          error instanceof Error
            ?error.message
            :"추가수업 정보를 불러오지 못했습니다."
      },
      {status:500}
    );
  }
}

export async function POST(
  request:Request,
  context:{params:Promise<{makeupId:string}>}
){
  try{
    const session=await getCurrentSession();

    if(!session){
      return NextResponse.json(
        {ok:false,message:"로그인이 필요합니다."},
        {status:401}
      );
    }

    const {makeupId}=await context.params;
    const body=await request.json();

    const date=
      String(body?.lessonDate||"").trim()||
      getKoreaDate().date;

    const makeup:any=
      await getAccessibleMakeup(
        makeupId,
        session.teacherId,
        session.role
      );

    if(!makeup){
      return NextResponse.json(
        {ok:false,message:"접근할 수 없는 추가수업입니다."},
        {status:403}
      );
    }

    const db=getSupabaseAdmin();

    const recordTeacherId=
      session.role==="teacher"
        ?session.teacherId
        :makeup.teacher_id;

    const {error:recordError}=await db
      .from("makeup_lesson_records")
      .upsert(
        {
          makeup_lesson_id:makeup.id,
          class_id:makeup.class_id,
          lesson_date:date,
          teacher_id:recordTeacherId,
          progress:String(body?.progress??"").trim(),
          homework:String(body?.homework??"").trim(),
          lesson_memo:String(body?.lessonMemo??"").trim(),
          updated_at:new Date().toISOString()
        },
        {
          onConflict:"makeup_lesson_id,lesson_date"
        }
      );

    if(recordError){
      console.error("save makeup record:",recordError);

      return NextResponse.json(
        {ok:false,message:"추가수업 진도·숙제 저장에 실패했습니다."},
        {status:500}
      );
    }

    const students=
      Array.isArray(body?.students)
        ?body.students
        :[];

    const attendanceRows=students
      .filter((student:any)=>
        ["출석","지각","결석","보강"].includes(
          String(student?.attendance_status||"")
        )
      )
      .map((student:any)=>({
        makeup_lesson_id:makeup.id,
        class_id:makeup.class_id,
        student_id:String(student.id),
        lesson_date:date,
        attendance_status:String(student.attendance_status),
        attendance_memo:String(student.attendance_memo||"").trim(),
        individual_memo:String(student.individual_memo||"").trim(),
        updated_at:new Date().toISOString()
      }));

    if(attendanceRows.length){
      const {error:attendanceError}=await db
        .from("makeup_attendance")
        .upsert(
          attendanceRows,
          {
            onConflict:
              "makeup_lesson_id,student_id,lesson_date"
          }
        );

      if(attendanceError){
        console.error(
          "save makeup attendance:",
          attendanceError
        );

        return NextResponse.json(
          {
            ok:false,
            message:"진도·숙제는 저장됐지만 출결 저장에 실패했습니다."
          },
          {status:500}
        );
      }
    }

    return NextResponse.json({
      ok:true,
      message:"추가수업 내용을 저장했습니다."
    });
  }catch(error){
    console.error("save makeup lesson:",error);

    return NextResponse.json(
      {
        ok:false,
        message:
          error instanceof Error
            ?error.message
            :"추가수업 저장 중 오류가 발생했습니다."
      },
      {status:500}
    );
  }
}
