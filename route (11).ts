import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getKoreaDate } from "@/lib/korea-time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin(){
  const session=await getCurrentSession();
  return session?.role==="admin" ? session : null;
}

function text(v:any){
  return String(v??"").trim();
}

function normalizeDate(v:any){
  const value=text(v);
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ?value
    :getKoreaDate().date;
}

export async function GET(req:Request){
  const session=await requireAdmin();

  if(!session){
    return NextResponse.json(
      {ok:false,message:"관리자 전용입니다."},
      {status:403}
    );
  }

  const url=new URL(req.url);
  const classId=text(url.searchParams.get("classId"));
  const date=normalizeDate(url.searchParams.get("date"));

  if(!classId){
    return NextResponse.json(
      {ok:false,message:"반을 선택해주세요."},
      {status:400}
    );
  }

  const db=getSupabaseAdmin();

  const {data,error}=await db
    .from("schedules")
    .select(`
      id,
      schedule_code,
      class_id,
      day_of_week,
      start_time,
      end_time,
      subject,
      room,
      teacher_id,
      valid_from,
      valid_to,
      teachers (
        teacher_name
      )
    `)
    .eq("class_id",classId)
    .eq("is_active",true)
    .lte("valid_from",date)
    .or(`valid_to.is.null,valid_to.gte.${date}`)
    .order("day_of_week",{ascending:true})
    .order("start_time",{ascending:true});

  if(error){
    console.error("class schedule get:",error);

    return NextResponse.json(
      {
        ok:false,
        message:"기본 시간표를 불러오지 못했습니다. 17차 DB SQL을 먼저 실행해주세요."
      },
      {status:500}
    );
  }

  return NextResponse.json({
    ok:true,
    date,
    rows:data||[]
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
  const classId=text(body.classId);
  const effectiveFrom=normalizeDate(body.effectiveFrom);
  const rows=Array.isArray(body.rows)?body.rows:[];

  if(!classId){
    return NextResponse.json(
      {ok:false,message:"반을 선택해주세요."},
      {status:400}
    );
  }

  const today=getKoreaDate().date;

  if(effectiveFrom<today){
    return NextResponse.json(
      {ok:false,message:"과거 날짜부터 기본 시간표를 변경할 수 없습니다."},
      {status:400}
    );
  }

  for(const row of rows){
    const day=Number(row.day_of_week);

    if(day<1||day>5){
      return NextResponse.json(
        {ok:false,message:"요일을 확인해주세요."},
        {status:400}
      );
    }

    if(!text(row.start_time)||!text(row.end_time)){
      return NextResponse.json(
        {ok:false,message:"수업 시작/종료 시간을 입력해주세요."},
        {status:400}
      );
    }

    if(text(row.end_time)<=text(row.start_time)){
      return NextResponse.json(
        {ok:false,message:"종료 시간은 시작 시간보다 늦어야 합니다."},
        {status:400}
      );
    }
  }

  const db=getSupabaseAdmin();

  const {error}=await db.rpc(
    "replace_class_schedule_from_date",
    {
      p_class_id:classId,
      p_effective_from:effectiveFrom,
      p_rows:rows.map((row:any)=>({
        day_of_week:Number(row.day_of_week),
        start_time:text(row.start_time).slice(0,5),
        end_time:text(row.end_time).slice(0,5),
        subject:text(row.subject),
        room:text(row.room),
        teacher_id:text(row.teacher_id)
      }))
    }
  );

  if(error){
    console.error("replace class schedule:",error);

    return NextResponse.json(
      {
        ok:false,
        message:error.message||"기본 시간표 저장에 실패했습니다. 17차 DB SQL을 확인해주세요."
      },
      {status:500}
    );
  }

  return NextResponse.json({ok:true});
}
