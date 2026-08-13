import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

export async function GET(
  _req:Request,
  context:{params:Promise<{studentId:string}>}
){
  const session=await getCurrentSession();

  if(!session||session.role!=="admin"){
    return NextResponse.json(
      {ok:false,message:"관리자 전용입니다."},
      {status:403}
    );
  }

  const {studentId}=await context.params;

  if(!studentId){
    return NextResponse.json(
      {ok:false,message:"학생 정보가 없습니다."},
      {status:400}
    );
  }

  const db=getSupabaseAdmin();

  const {data:student,error:studentError}=await db
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
        id,
        class_name,
        primary_teacher_id,
        teachers:primary_teacher_id (
          teacher_name
        )
      )
    `)
    .eq("id",studentId)
    .single();

  if(studentError||!student){
    console.error("student detail:",studentError);

    return NextResponse.json(
      {ok:false,message:"학생 정보를 불러오지 못했습니다."},
      {status:404}
    );
  }

  const {data:attendance,error:attendanceError}=await db
    .from("attendance")
    .select(`
      schedule_id,
      class_id,
      lesson_date,
      attendance_status,
      attendance_memo,
      individual_memo
    `)
    .eq("student_id",studentId)
    .order("lesson_date",{ascending:false})
    .limit(60);

  if(attendanceError){
    console.error("student attendance detail:",attendanceError);
  }

  const attendanceRows=attendance||[];
  const scheduleIds=[
    ...new Set(
      attendanceRows
        .map((row:any)=>row.schedule_id)
        .filter(Boolean)
    )
  ];

  let scheduleMap=new Map<string,any>();

  if(scheduleIds.length){
    const {data:schedules,error:scheduleError}=await db
      .from("schedules")
      .select(`
        id,
        start_time,
        end_time,
        subject,
        room,
        class_id,
        teacher_id,
        classes (
          class_name
        ),
        teachers (
          teacher_name
        )
      `)
      .in("id",scheduleIds);

    if(scheduleError){
      console.error("student detail schedules:",scheduleError);
    }else{
      scheduleMap=new Map(
        (schedules||[]).map((row:any)=>[row.id,row])
      );
    }
  }

  const attendanceDetailed=attendanceRows.map((row:any)=>{
    const schedule=scheduleMap.get(row.schedule_id);

    return {
      ...row,
      class_name:schedule?.classes?.class_name||null,
      teacher_name:schedule?.teachers?.teacher_name||null,
      subject:schedule?.subject||null,
      room:schedule?.room||null,
      start_time:schedule?.start_time||null,
      end_time:schedule?.end_time||null
    };
  });

  let lessonRecords:any[]=[];

  if(student.class_id){
    const {data:records,error:recordError}=await db
      .from("lesson_records")
      .select(`
        lesson_date,
        progress,
        homework,
        lesson_memo,
        teacher_id,
        teachers (
          teacher_name
        )
      `)
      .eq("class_id",student.class_id)
      .order("lesson_date",{ascending:false})
      .limit(16);

    if(recordError){
      console.error("student class records:",recordError);
    }else{
      lessonRecords=(records||[]).map((row:any)=>({
        ...row,
        teacher_name:row.teachers?.teacher_name||null
      }));
    }
  }

  let customMakeups:any[]=[];

  const safeName=String(student.student_name||"").trim();

  if(safeName){
    const {data:makeups,error:makeupError}=await db
      .from("makeup_lessons")
      .select(`
        id,
        makeup_date,
        title,
        start_time,
        end_time,
        subject,
        room,
        memo,
        teacher_id,
        teachers (
          teacher_name
        )
      `)
      .ilike("title",`%${safeName}%`)
      .order("makeup_date",{ascending:false})
      .limit(20);

    if(makeupError){
      console.error("student custom makeups:",makeupError);
    }else{
      customMakeups=(makeups||[]).map((row:any)=>({
        ...row,
        teacher_name:row.teachers?.teacher_name||null
      }));
    }
  }

  const counts={
    total:attendanceDetailed.length,
    present:attendanceDetailed.filter((r:any)=>r.attendance_status==="출석").length,
    late:attendanceDetailed.filter((r:any)=>r.attendance_status==="지각").length,
    absent:attendanceDetailed.filter((r:any)=>r.attendance_status==="결석").length,
    makeup:attendanceDetailed.filter((r:any)=>r.attendance_status==="보강").length
  };

  const makeupHistory=[
    ...attendanceDetailed
      .filter((r:any)=>r.attendance_status==="보강")
      .map((r:any)=>({
        id:`attendance_${r.schedule_id}_${r.lesson_date}`,
        date:r.lesson_date,
        title:`${r.class_name||"수업"} 보강`,
        teacher_name:r.teacher_name,
        subject:r.subject,
        room:r.room,
        memo:r.attendance_memo||r.individual_memo||"",
        source:"attendance"
      })),
    ...customMakeups.map((r:any)=>({
      id:`makeup_${r.id}`,
      date:r.makeup_date,
      title:r.title,
      teacher_name:r.teacher_name,
      subject:r.subject,
      room:r.room,
      memo:r.memo||"",
      source:"custom"
    }))
  ]
    .sort((a:any,b:any)=>String(b.date).localeCompare(String(a.date)))
    .slice(0,20);

  return NextResponse.json({
    ok:true,
    student:{
      ...student,
      class_name:(student as any).classes?.class_name||null,
      primary_teacher_name:(student as any).classes?.teachers?.teacher_name||null
    },
    counts,
    attendance:attendanceDetailed.slice(0,30),
    makeups:makeupHistory,
    lessonRecords
  });
}
