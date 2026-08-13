import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

function monthBounds(month:string){
  const match=/^(\d{4})-(\d{2})$/.exec(month);
  if(!match)return null;

  const year=Number(match[1]);
  const mon=Number(match[2]);

  if(mon<1||mon>12)return null;

  const start=`${year}-${String(mon).padStart(2,"0")}-01`;
  const nextMon=mon===12?1:mon+1;
  const nextYear=mon===12?year+1:year;
  const nextStart=`${nextYear}-${String(nextMon).padStart(2,"0")}-01`;

  const next=new Date(`${nextStart}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate()-1);

  const end=[
    next.getUTCFullYear(),
    String(next.getUTCMonth()+1).padStart(2,"0"),
    String(next.getUTCDate()).padStart(2,"0")
  ].join("-");

  return {start,end};
}

export async function GET(req:Request){
  const session=await getCurrentSession();

  if(!session||session.role!=="admin"){
    return NextResponse.json(
      {ok:false,message:"관리자 전용입니다."},
      {status:403}
    );
  }

  const {searchParams}=new URL(req.url);
  const month=searchParams.get("month")||"";
  const bounds=monthBounds(month);

  if(!bounds){
    return NextResponse.json(
      {ok:false,message:"월 형식이 올바르지 않습니다."},
      {status:400}
    );
  }

  const db=getSupabaseAdmin();

  const {data,error}=await db
    .from("academy_calendar_events")
    .select(`
      id,
      event_type,
      title,
      start_date,
      end_date,
      teacher_id,
      memo,
      teachers (
        teacher_name
      )
    `)
    .lte("start_date",bounds.end)
    .gte("end_date",bounds.start)
    .order("start_date",{ascending:true})
    .order("created_at",{ascending:true});

  if(error){
    console.error("month events:",error);

    return NextResponse.json(
      {ok:false,message:"월간 일정을 불러오지 못했습니다."},
      {status:500}
    );
  }

  return NextResponse.json({
    ok:true,
    month,
    monthStart:bounds.start,
    monthEnd:bounds.end,
    events:data||[]
  });
}
