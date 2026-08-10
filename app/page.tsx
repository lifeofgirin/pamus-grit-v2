"use client";
import {FormEvent,useEffect,useMemo,useState} from "react";

type User={role:"teacher"|"admin";teacherCode:string|null;displayName:string};
type Lesson={id:string;schedule_code:string;class_id:string;start_time:string;end_time:string;subject:string;room:string|null;teacher_id:string|null;classes:{class_code:string;class_name:string}|null;teachers:{teacher_code:string;teacher_name:string}|null;lessonDate:string;progressDone:boolean;homeworkDone:boolean;attendanceDone:boolean;studentCount:number;attendanceCount:number;operationStatus?:string;operationMemo?:string;isCustomMakeup?:boolean;makeupId?:string};
type EventRow={id:string;event_type:string;title:string;start_date:string;end_date:string;teacher_id:string|null;memo:string|null;teachers?:{teacher_name:string}|null};
type WeekDay={date:string;dayOfWeek:number;lessons:Lesson[];events:EventRow[];vacation:boolean};
type Student={id:string;student_name:string;school:string|null;registered_grade:string|null;attendance_status:string;attendance_memo:string;individual_memo:string};
type Detail={date:string;schedule:Lesson;record:{progress:string;homework:string;lesson_memo:string};students:Student[]};
type Teacher={id:string;teacher_code:string;teacher_name:string};
type Meta={teachers:Teacher[];classes:{id:string;class_code:string;class_name:string}[];schedules:any[]};
const ROOMS=["101호","102호","103호","204호","205호","206호","207호","208호"];
const STATUSES=["출석","지각","결석","보강"];
const DAYS=["","월","화","수","목","금"];
const room=(v:string|null)=>String(v||"미지정").trim()||"미지정";
const fmt=(d:string)=>d?new Intl.DateTimeFormat("ko-KR",{month:"long",day:"numeric",weekday:"long",timeZone:"Asia/Seoul"}).format(new Date(`${d}T00:00:00+09:00`)):"오늘";
const short=(d:string)=>d?new Intl.DateTimeFormat("ko-KR",{month:"numeric",day:"numeric",timeZone:"Asia/Seoul"}).format(new Date(`${d}T00:00:00+09:00`)):"";
const add=(d:string,n:number)=>{
  if(!d)return d;
  const [y,m,day]=d.split("-").map(Number);
  const x=new Date(Date.UTC(y,m-1,day));
  x.setUTCDate(x.getUTCDate()+n);
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth()+1).padStart(2,"0")}-${String(x.getUTCDate()).padStart(2,"0")}`;
};
const TT_START=10*60;
const TT_END=20*60;
const TT_PX_PER_MIN=1;
const toMinutes=(v:string)=>{
  const [h,m]=String(v||"00:00").slice(0,5).split(":").map(Number);
  return h*60+m;
};
const ttTop=(v:string)=>Math.max(0,(toMinutes(v)-TT_START)*TT_PX_PER_MIN);
const ttHeight=(start:string,end:string)=>Math.max(38,(toMinutes(end)-toMinutes(start))*TT_PX_PER_MIN);
const TT_HOURS=Array.from({length:11},(_,i)=>10+i);
const layoutOverlaps=(lessons:Lesson[])=>{
  const sorted=[...lessons].sort((a,b)=>
    toMinutes(a.start_time)-toMinutes(b.start_time) ||
    toMinutes(a.end_time)-toMinutes(b.end_time)
  );

  const groups:Lesson[][]=[];
  let current:Lesson[]=[];
  let currentEnd=-1;

  sorted.forEach(lesson=>{
    const start=toMinutes(lesson.start_time);
    const end=toMinutes(lesson.end_time);

    if(!current.length || start<currentEnd){
      current.push(lesson);
      currentEnd=Math.max(currentEnd,end);
    }else{
      groups.push(current);
      current=[lesson];
      currentEnd=end;
    }
  });

  if(current.length)groups.push(current);

  const result=new Map<string,{column:number;columns:number}>();

  groups.forEach(group=>{
    const columnEnds:number[]=[];
    const assignments=new Map<string,number>();

    group.forEach(lesson=>{
      const start=toMinutes(lesson.start_time);
      let column=columnEnds.findIndex(end=>end<=start);

      if(column===-1){
        column=columnEnds.length;
        columnEnds.push(toMinutes(lesson.end_time));
      }else{
        columnEnds[column]=toMinutes(lesson.end_time);
      }

      assignments.set(lesson.schedule_code,column);
    });

    const columns=Math.max(columnEnds.length,1);

    group.forEach(lesson=>{
      result.set(
        lesson.schedule_code,
        {
          column:assignments.get(lesson.schedule_code)??0,
          columns
        }
      );
    });
  });

  return result;
};

export default function Home(){
 const[loading,setLoading]=useState(true),[loginLoading,setLoginLoading]=useState(false),[pin,setPin]=useState(""),[error,setError]=useState("");
 const[user,setUser]=useState<User|null>(null),[view,setView]=useState<"daily"|"work"|"weekly"|"classWeekly">("daily"),[date,setDate]=useState(""),[lessons,setLessons]=useState<Lesson[]>([]),[events,setEvents]=useState<EventRow[]>([]);
 const[weekBase,setWeekBase]=useState(""),[weekStart,setWeekStart]=useState(""),[weekEnd,setWeekEnd]=useState(""),[weekDays,setWeekDays]=useState<WeekDay[]>([]),[busy,setBusy]=useState(false);
 const[selected,setSelected]=useState<Lesson|null>(null),[detail,setDetail]=useState<Detail|null>(null),[detailBusy,setDetailBusy]=useState(false),[saving,setSaving]=useState(false),[toast,setToast]=useState("");
 const[meta,setMeta]=useState<Meta>({teachers:[],classes:[],schedules:[]}),[adminModal,setAdminModal]=useState<"change"|"makeup"|"event"|null>(null);
 const[adminWeekTeacher,setAdminWeekTeacher]=useState<string>("");
 const[classWeekClassId,setClassWeekClassId]=useState<string>("");
 const[classWeekData,setClassWeekData]=useState<any>(null);
 const[classWeekBusy,setClassWeekBusy]=useState(false);
 const[accessibleClasses,setAccessibleClasses]=useState<{id:string;class_code:string;class_name:string}[]>([]);
 const[workData,setWorkData]=useState<any>(null);
 const[workBusy,setWorkBusy]=useState(false);
 const[printDays,setPrintDays]=useState<number[]>([1,2,3,4,5]);
 const[changeForm,setChangeForm]=useState<any>({}),[eventForm,setEventForm]=useState<any>({eventType:"기타"});
 useEffect(()=>{restore()},[]); useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(""),2200);return()=>clearTimeout(t)},[toast]);
 const groups=useMemo(()=>ROOMS.map(r=>({room:r,lessons:lessons.filter(l=>room(l.room)===r)})),[lessons]);
 const pending=lessons.filter(l=>!l.progressDone||!l.homeworkDone||!l.attendanceDone).length;
 const selectedAdminTeacher=meta.teachers.find(t=>t.id===adminWeekTeacher)||null;
 function visibleWeekDays(){
   if(user?.role!=="admin"||!adminWeekTeacher)return weekDays;
   return weekDays.map(day=>({
     ...day,
     lessons:(day.lessons||[]).filter(lesson=>lesson.teacher_id===adminWeekTeacher)
   }));
 }
 async function restore(){try{const r=await fetch('/api/me',{cache:'no-store'});if(!r.ok)return;const j=await r.json();setUser(j.user);const t=await loadToday();if(t?.date)setWeekBase(t.date);loadClassOptions();if(j.user.role==='admin')loadMeta()}finally{setLoading(false)}}
 async function login(e:FormEvent){e.preventDefault();setError("");if(!/^\d{4}$/.test(pin)){setError('4자리 로그인번호를 입력해주세요.');return}setLoginLoading(true);try{const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin})});const j=await r.json();if(!r.ok){setError(j.message||'로그인 실패');return}setUser(j.user);setPin('');const t=await loadToday();if(t?.date)setWeekBase(t.date);loadClassOptions();if(j.user.role==='admin')loadMeta()}finally{setLoginLoading(false)}}
 async function loadWork(){
  setWorkBusy(true);

  try{
    const r=await fetch(
      '/api/work-today',
      {cache:'no-store'}
    );

    const j=await r.json();

    if(!r.ok||!j.ok){
      setToast(
        j.message ||
        '오늘 업무 현황을 불러오지 못했습니다.'
      );
      return;
    }

    setWorkData(j);
  }catch(e){
    console.error(
      'loadWork client:',
      e
    );

    setToast(
      '오늘 업무 화면 표시 중 오류가 발생했습니다.'
    );
  }finally{
    setWorkBusy(false);
  }
 }

 async function loadClassOptions(){
  try{
    const r=await fetch('/api/class-options',{cache:'no-store'});
    const j=await r.json();

    if(!r.ok||!j.ok){
      console.error('class options:',j);
      return;
    }

    const classes=Array.isArray(j.classes)?j.classes:[];
    setAccessibleClasses(classes);

    setClassWeekClassId(
      current =>
        current ||
        classes[0]?.id ||
        ''
    );
  }catch(e){
    console.error('loadClassOptions:',e);
  }
 }

 async function loadMeta(){try{const r=await fetch('/api/admin/meta',{cache:'no-store'});if(!r.ok)return;const j=await r.json();const teachers=Array.isArray(j.teachers)?j.teachers:[];const classes=Array.isArray(j.classes)?j.classes:[];setMeta({teachers,classes,schedules:Array.isArray(j.schedules)?j.schedules:[]});setAdminWeekTeacher(current=>current||teachers[0]?.id||'');setClassWeekClassId(current=>current||classes[0]?.id||'')}catch(e){console.error('loadMeta client:',e)}}
 async function loadToday(){setBusy(true);try{const r=await fetch('/api/today',{cache:'no-store'});const j=await r.json();if(!r.ok)return null;setDate(j.date);setLessons(j.lessons||[]);setEvents(j.events||[]);return j}finally{setBusy(false)}}
 async function loadWeek(base?:string){setBusy(true);try{const target=base||weekBase||date;if(!target){setToast('기준 날짜를 불러오는 중입니다. 잠시 후 다시 눌러주세요.');return}const r=await fetch(`/api/week?date=${encodeURIComponent(target)}`,{cache:'no-store'});const j=await r.json();if(!r.ok||!j.ok){setToast(j.message||'주간 시간표를 불러오지 못했습니다.');return}setWeekBase(target);setWeekStart(j.weekStart||'');setWeekEnd(j.weekEnd||'');setWeekDays(Array.isArray(j.days)?j.days:[])}catch(e){console.error('loadWeek client:',e);setToast('주간 화면 표시 중 오류가 발생했습니다.')}finally{setBusy(false)}}
 async function switchView(v:"daily"|"work"|"weekly"|"classWeekly"){setView(v);if(v==='daily'){await loadToday();return}if(v==='work'){await loadWork();return}if(v==='weekly'){await loadWeek(weekBase||date);return}await loadClassWeek(weekBase||date)}
 async function loadClassWeek(base?:string,classId?:string){
  const targetClass=classId||classWeekClassId;
  const targetDate=base||weekBase||date;
  if(!targetClass){setToast('반을 선택해주세요.');return}
  setClassWeekBusy(true);
  try{
    const r=await fetch(`/api/admin/class-week?classId=${encodeURIComponent(targetClass)}&date=${encodeURIComponent(targetDate)}`,{cache:'no-store'});
    const j=await r.json();
    if(!r.ok||!j.ok){setToast(j.message||'반별 주간 정보를 불러오지 못했습니다.');return}
    setClassWeekData(j);
    setWeekStart(j.weekStart||'');
    setWeekEnd(j.weekEnd||'');
  }catch(e){
    console.error('loadClassWeek:',e);
    setToast('반별 주간 화면 표시 중 오류가 발생했습니다.');
  }finally{
    setClassWeekBusy(false);
  }
 }

 function summaryText(mode:"progress"|"homework"|"all"){
  if(!classWeekData)return "";

  const className=
    classWeekData.classInfo?.class_name||
    '반';

  const records=
    Array.isArray(classWeekData.records)
      ?classWeekData.records
      :[];

  const dates=[
    ...new Set(
      records.map(
        (r:any)=>r.lesson_date
      )
    )
  ] as string[];

  const blocks:string[]=[];

  dates.forEach((lessonDate)=>{
    const rows=
      records.filter(
        (r:any)=>
          r.lesson_date===lessonDate
      );

    const dateText=
      short(lessonDate)
        .replace(
          /^0?/,
          ''
        );

    const lines=[
      `[${className} ${dateText}]`
    ];

    if(mode==='progress'){
      const progressLines=
        rows
          .map((r:any)=>{
            const value=
              String(
                r.progress||''
              ).trim();

            if(!value)return null;

            return `${r.teacher_name} 진도: ${value}`;
          })
          .filter(Boolean);

      lines.push(
        ...progressLines as string[]
      );
    }

    if(mode==='homework'){
      const homeworkLines=
        rows
          .map((r:any)=>{
            const value=
              String(
                r.homework||''
              ).trim();

            if(!value)return null;

            return `${r.teacher_name} 숙제: ${value}`;
          })
          .filter(Boolean);

      lines.push(
        ...homeworkLines as string[]
      );
    }

    if(mode==='all'){
      const progressLines=
        rows
          .map((r:any)=>{
            const value=
              String(
                r.progress||''
              ).trim();

            if(!value)return null;

            return `${r.teacher_name} 진도: ${value}`;
          })
          .filter(Boolean) as string[];

      const homeworkLines=
        rows
          .map((r:any)=>{
            const value=
              String(
                r.homework||''
              ).trim();

            if(!value)return null;

            return `${r.teacher_name} 숙제: ${value}`;
          })
          .filter(Boolean) as string[];

      if(progressLines.length){
        lines.push(
          '',
          ...progressLines
        );
      }

      if(homeworkLines.length){
        lines.push(
          '',
          ...homeworkLines
        );
      }
    }

    if(lines.length>1){
      blocks.push(
        lines.join('\n')
      );
    }
  });

  return blocks.join('\n\n');
 }

 async function copySummary(mode:"progress"|"homework"|"all"){
  const text=summaryText(mode);
  if(!text){setToast('복사할 작성 내용이 없습니다.');return}

  try{
    await navigator.clipboard.writeText(text);
    setToast(
      mode==='progress'
        ?'진도 복사 완료'
        :mode==='homework'
          ?'숙제 복사 완료'
          :'전체 복사 완료'
    );
  }catch{
    setToast('클립보드 복사에 실패했습니다.');
  }
 }

 function togglePrintDay(day:number){
  setPrintDays(current=>{
    if(current.includes(day)){
      const next=current.filter(d=>d!==day);
      return next.length?next:current;
    }
    return [...current,day].sort();
  });
 }

 function printCurrentSchedule(){
  document.body.classList.add('printing-schedule');
  setTimeout(()=>{
    window.print();
    setTimeout(()=>{
      document.body.classList.remove('printing-schedule');
    },300);
  },100);
 }

 async function logout(){await fetch('/api/logout',{method:'POST'});setUser(null);setLessons([]);setWeekDays([]);setSelected(null);setAccessibleClasses([]);setClassWeekData(null);setClassWeekClassId('');setWorkData(null)}
 async function openLesson(l:Lesson){if(l.isCustomMakeup){setToast(`${l.classes?.class_name||'보강'} · ${l.start_time?.slice(0,5)} 보강 수업`);return}if(l.operationStatus==='학원방학'||l.operationStatus==='휴강'){if(user?.role==='admin')openChange(l);else setToast(l.operationStatus==='휴강'?'휴강된 수업입니다.':'학원방학입니다.');return}setSelected(l);setDetail(null);setDetailBusy(true);try{const r=await fetch(`/api/lesson/${encodeURIComponent(l.schedule_code)}?date=${l.lessonDate}`,{cache:'no-store'});const j=await r.json();if(!r.ok){setToast(j.message);setSelected(null);return}setDetail(j)}finally{setDetailBusy(false)}}
 function updateRecord(k:string,v:string){setDetail((d:any)=>d?({...d,record:{...d.record,[k]:v}}):d)} function updateStudent(i:number,p:any){setDetail((d:any)=>{if(!d)return d;const s=[...d.students];s[i]={...s[i],...p};return{...d,students:s}})} function allPresent(){setDetail((d:any)=>d?({...d,students:d.students.map((s:any)=>({...s,attendance_status:'출석'}))}):d)}
 async function saveLesson(){if(!selected||!detail)return;setSaving(true);try{const r=await fetch(`/api/lesson/${encodeURIComponent(selected.schedule_code)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lessonDate:detail.date,progress:detail.record.progress,homework:detail.record.homework,lessonMemo:detail.record.lesson_memo,students:detail.students})});const j=await r.json();if(!r.ok){setToast(j.message);return}setToast('저장되었습니다.');setSelected(null);view==='daily'?await loadToday():view==='work'?await loadWork():view==='weekly'?await loadWeek(weekBase):await loadClassWeek(weekBase)}finally{setSaving(false)}}
 function openChange(l:Lesson){setChangeForm({scheduleId:l.id,date:l.lessonDate,status:l.operationStatus==='휴강'?'휴강':'정상',startTime:l.start_time?.slice(0,5),endTime:l.end_time?.slice(0,5),subject:l.subject,room:room(l.room),teacherId:l.teacher_id||'',memo:l.operationMemo||''});setAdminModal('change')}
 function openMakeup(){setChangeForm({title:'',date:date,startTime:'',endTime:'',subject:'보강',room:'101호',teacherId:user?.role==='teacher'?(user.teacherCode||''):'',memo:''});setAdminModal('makeup')}
 async function saveCustomMakeup(){const payload={...changeForm};if(user?.role==='teacher')delete payload.teacherId;const r=await fetch('/api/makeup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const j=await r.json();if(!r.ok){setToast(j.message||'보강 등록 실패');return}setToast('보강 등록 완료');setAdminModal(null);view==='daily'?await loadToday():await loadWeek(weekBase)}
 async function saveChange(){const r=await fetch('/api/admin/schedule-change',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(changeForm)});const j=await r.json();if(!r.ok){setToast(j.message);return}setToast('운영 변경 저장 완료');setAdminModal(null);view==='daily'?await loadToday():await loadWeek(weekBase)}
 async function resetChange(){await fetch('/api/admin/schedule-change',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({scheduleId:changeForm.scheduleId,date:changeForm.date})});setAdminModal(null);setToast('기본 시간표로 복원했습니다.');view==='daily'?await loadToday():await loadWeek(weekBase)}
 async function saveEvent(){const r=await fetch('/api/admin/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(eventForm)});const j=await r.json();if(!r.ok){setToast(j.message);return}setAdminModal(null);setToast('학원 일정 저장 완료');view==='daily'?await loadToday():await loadWeek(weekBase)}
 function pickMakeupSchedule(id:string){const s=meta.schedules.find((x:any)=>x.id===id);setChangeForm((f:any)=>({...f,scheduleId:id,startTime:s?.start_time?.slice(0,5)||'',endTime:s?.end_time?.slice(0,5)||'',subject:s?.subject||'',room:s?.room||'101호',teacherId:s?.teacher_id||''}))}
 const statusClass=(l:Lesson)=>l.operationStatus==='휴강'?'cancelled':l.operationStatus==='보강'?'makeup':l.operationStatus==='학원방학'?'vacation':'';
 if(loading)return <main className="app-shell centered"><div className="loading-card">Pamus Grit을 불러오는 중입니다.</div></main>;
 if(!user)return <main className="app-shell centered"><section className="login-card"><div className="brand-mark">P</div><div className="brand-label">PAMUS GRIT ENGLISH</div><h1>선생님 로그인</h1><p className="login-copy">4자리 로그인번호를 입력해주세요.</p><form onSubmit={login}><input className="pin-input" type="password" inputMode="numeric" maxLength={4} autoFocus value={pin} onChange={e=>{setPin(e.target.value.replace(/\D/g,'').slice(0,4));setError('')}} placeholder="••••"/>{error&&<div className="error-box">{error}</div>}<button className="login-button" disabled={loginLoading}>{loginLoading?'확인 중...':'로그인'}</button></form></section></main>;
 return <>
 <main className="app-shell"><div className="dashboard">
  <header className="topbar"><div><div className="brand-label">PAMUS GRIT ENGLISH</div><h1 className="dashboard-title">{user.role==='admin'
  ?(view==='daily'
    ?'오늘 전체 수업'
    :view==='work'
      ?'오늘 업무 현황'
      :view==='weekly'
        ?'전체 주간 수업'
        :'반별 주간 관리')
  :(view==='daily'
    ?`${user.displayName} 오늘 수업`
    :view==='work'
      ?`${user.displayName} 오늘 업무`
      :view==='weekly'
        ?`${user.displayName} 주간 수업`
        :`${user.displayName} 반별 기록`)}</h1><div className="date-text">{view==='daily'?fmt(date):`${short(weekStart)} ~ ${short(weekEnd)}`}</div></div><div className="top-actions"><button className="refresh-button" onClick={()=>view==='daily'?loadToday():view==='work'?loadWork():view==='weekly'?loadWeek(weekBase):loadClassWeek(weekBase)}>↻ 새로고침</button><button className="logout-button" onClick={logout}>로그아웃</button></div></header>
  <div className="view-tabs"><button className={`view-tab ${view==='daily'?'active':''}`} onClick={()=>switchView('daily')}>오늘</button><button className={`view-tab ${view==='work'?'active':''}`} onClick={()=>switchView('work')}>업무</button><button className={`view-tab ${view==='weekly'?'active':''}`} onClick={()=>switchView('weekly')}>주간</button><button className={`view-tab ${view==='classWeekly'?'active':''}`} onClick={()=>switchView('classWeekly')}>반별</button></div>
  <div className="admin-tools"><button onClick={openMakeup}>+ 보강 추가</button>{user.role==='admin'&&<button onClick={()=>{setEventForm({eventType:'기타',title:'',startDate:date,endDate:date,teacherId:'',memo:''});setAdminModal('event')}}>+ 학원 일정</button>}</div>
  {view==='daily'&&events.length>0&&<div className="event-strip">{events.map(e=><div key={e.id} className={`event-chip type-${e.event_type}`}><strong>{e.event_type}</strong><span>{e.title}</span>{e.teachers?.teacher_name&&<small>{e.teachers.teacher_name}</small>}</div>)}</div>}
  <section className="summary-strip"><div><span>{view==='daily'?'오늘 수업':view==='work'?'오늘 업무':view==='weekly'?'이번 주 수업':'선택 반'}</span><strong>{view==='daily'?lessons.length:view==='work'?(workData?.summary?.totalLessons||0):view==='weekly'?weekDays.reduce((a,d)=>a+d.lessons.length,0):(classWeekData?.classInfo?.class_name||'-')}</strong></div><div><span>{view==='classWeekly'?'작성 기록':view==='work'?'미완료 수업':'업무 미완료'}</span><strong className="pending-number">{view==='daily'?pending:view==='work'?(workData?.summary?.pendingLessons||0):view==='weekly'?weekDays.reduce((a,d)=>a+d.lessons.filter(l=>!l.progressDone||!l.homeworkDone||!l.attendanceDone).length,0):(classWeekData?.records?.length||0)}</strong></div><div><span>계정</span><strong>{user.role==='admin'?'관리자':user.displayName}</strong></div></section>
  {view==='daily'?(user.role==='admin'?<section className="schedule-panel"><div className="section-head"><div><div className="section-kicker">ADMIN DAILY</div><h2>강의실별 오늘 시간표</h2></div></div><div className="room-board">{groups.map(g=><section className="room-column" key={g.room}><div className="room-head"><strong>{g.room}</strong><span>{g.lessons.length}개</span></div><div className="room-lessons">{g.lessons.length?g.lessons.map(l=><button key={l.schedule_code} className={`lesson-card ${statusClass(l)}`} onClick={()=>openLesson(l)} onContextMenu={e=>{if(!l.isCustomMakeup){e.preventDefault();openChange(l)}}}><div className="lesson-time"><strong>{l.start_time?.slice(0,5)}</strong><span>~ {l.end_time?.slice(0,5)}</span></div><div className="lesson-name">{l.classes?.class_name}</div><div className="lesson-subject">{l.subject}</div><div className="teacher-chip">{l.teachers?.teacher_name}</div><div className="op-badge">{l.operationStatus}</div></button>):<div className="room-empty">수업 없음</div>}</div></section>)}</div><div className="admin-hint">관리자: 수업 클릭 = 수업 작성 · 우클릭 = 당일 변경/휴강</div></section>
  :<section className="schedule-panel"><div className="section-head"><div><div className="section-kicker">MY DAILY</div><h2>오늘 내 수업</h2></div></div><div className="teacher-daily-list">{lessons.length?lessons.map(l=><button key={l.schedule_code} className={`teacher-daily-card ${statusClass(l)}`} onClick={()=>openLesson(l)}><div className="teacher-daily-time"><strong>{l.start_time?.slice(0,5)}</strong><span>~ {l.end_time?.slice(0,5)}</span></div><div className="teacher-daily-main"><strong>{l.classes?.class_name}</strong><span>{l.subject} · {room(l.room)}</span></div><div className="op-badge">{l.operationStatus}</div></button>):<div className="empty-state">오늘 예정된 수업이 없습니다.</div>}</div></section>)
  :view==='work'?<section className="schedule-panel work-panel">
   <div className="section-head">
     <div>
       <div className="section-kicker">TODAY WORK</div>
       <h2>{user.role==='admin'?'선생님별 오늘 업무 현황':'오늘 작성해야 할 수업'}</h2>
     </div>
     {!workBusy&&workData&&<span className="board-help">미완료 수업을 누르면 바로 작성</span>}
   </div>

   {workBusy&&<div className="weekly-state-box">오늘 업무 현황을 불러오는 중입니다.</div>}

   {!workBusy&&workData&&<>
     <div className="work-summary-grid">
       <div className="work-summary-card">
         <span>전체 수업</span>
         <strong>{workData.summary?.totalLessons||0}</strong>
       </div>

       <div className="work-summary-card success">
         <span>작성 완료</span>
         <strong>{workData.summary?.completeLessons||0}</strong>
       </div>

       <div className="work-summary-card warning">
         <span>미완료</span>
         <strong>{workData.summary?.pendingLessons||0}</strong>
       </div>

       <div className="work-summary-card mini">
         <span>진도 미작성</span>
         <strong>{workData.summary?.progressPending||0}</strong>
       </div>

       <div className="work-summary-card mini">
         <span>숙제 미작성</span>
         <strong>{workData.summary?.homeworkPending||0}</strong>
       </div>

       <div className="work-summary-card mini">
         <span>출결 미완료</span>
         <strong>{workData.summary?.attendancePending||0}</strong>
       </div>
     </div>

     {user.role==='admin'
       ? <div className="admin-work-groups">
           {(workData.teacherGroups||[]).map((group:any)=><section className={`admin-work-teacher ${group.pendingLessons===0?'complete':''}`} key={group.teacherId}>
             <div className="admin-work-teacher-head">
               <div>
                 <strong>{group.teacherName}</strong>
                 <span>{group.totalLessons}개 수업</span>
               </div>

               <div className="admin-work-numbers">
                 {group.pendingLessons===0
                   ? <b className="all-done">완료</b>
                   : <b>{group.pendingLessons}개 미완료</b>}
               </div>
             </div>

             <div className="admin-work-tags">
               <span>진도 {group.progressPending}</span>
               <span>숙제 {group.homeworkPending}</span>
               <span>출결 {group.attendancePending}</span>
             </div>

             {group.pendingLessons>0&&<div className="work-lesson-list">
               {(group.items||[]).filter((item:any)=>item.pendingCount>0).map((item:any)=><button
                 type="button"
                 className="work-lesson-card"
                 key={`${item.schedule_code}_${item.lessonDate}`}
                 onClick={()=>openLesson(item)}
               >
                 <div className="work-lesson-time">{item.start_time?.slice(0,5)}</div>

                 <div className="work-lesson-main">
                   <strong>{item.classes?.class_name||'반 미지정'}</strong>
                   <span>{item.subject} · {room(item.room)}</span>
                 </div>

                 <div className="work-pending-tags">
                   {!item.progressDone&&<span>진도</span>}
                   {!item.homeworkDone&&<span>숙제</span>}
                   {!item.attendanceDone&&<span>출결</span>}
                 </div>
               </button>)}
             </div>}
           </section>)}
         </div>
       : <div className="work-lesson-list teacher-work-list">
           {(workData.items||[]).filter((item:any)=>item.pendingCount>0).length===0
             ? <div className="work-all-complete">
                 <strong>오늘 작성 완료</strong>
                 <span>오늘 수업의 진도 · 숙제 · 출결이 모두 작성되었습니다.</span>
               </div>
             : (workData.items||[]).filter((item:any)=>item.pendingCount>0).map((item:any)=><button
                 type="button"
                 className="work-lesson-card teacher-work-card"
                 key={`${item.schedule_code}_${item.lessonDate}`}
                 onClick={()=>openLesson(item)}
               >
                 <div className="work-lesson-time">
                   <strong>{item.start_time?.slice(0,5)}</strong>
                   <span>~ {item.end_time?.slice(0,5)}</span>
                 </div>

                 <div className="work-lesson-main">
                   <strong>{item.classes?.class_name||'반 미지정'}</strong>
                   <span>{item.subject} · {room(item.room)}</span>
                 </div>

                 <div className="work-pending-tags">
                   {!item.progressDone&&<span>진도</span>}
                   {!item.homeworkDone&&<span>숙제</span>}
                   {!item.attendanceDone&&<span>출결</span>}
                 </div>
               </button>)}
         </div>}
   </>}
  </section>:view==='weekly'?<section className="schedule-panel printable-schedule">
   <div className="weekly-toolbar">
     <div>
       <div className="section-kicker">WEEKLY SCHEDULE</div>
       <h2>{user.role==='admin'?'선생님별 주간 시간표':'월~금 주간 시간표'}</h2>
       {user.role==='admin'&&<div className="admin-week-caption">{selectedAdminTeacher?`${selectedAdminTeacher.teacher_name} 수업만 표시 중`:'전체 선생님 수업'}</div>}
     </div>
     <div className="week-nav">
       <button onClick={()=>loadWeek(add(weekStart||weekBase,-7))}>‹ 지난주</button>
       <button onClick={()=>loadWeek(date)}>이번주</button>
       <button onClick={()=>loadWeek(add(weekStart||weekBase,7))}>다음주 ›</button>
     </div>
   </div>

   {user.role==='admin'&&<div className="print-toolbar no-print">
     <div className="print-day-picker">
       {[1,2,3,4,5].map(day=><button
         type="button"
         key={day}
         className={`print-day-button ${printDays.includes(day)?'active':''}`}
         onClick={()=>togglePrintDay(day)}
       >
         {DAYS[day]}
       </button>)}
     </div>
     <button type="button" className="print-action-button" onClick={printCurrentSchedule}>A4 인쇄</button>
   </div>}

   {user.role==='admin'&&<div className="teacher-week-filter">
     <button
       className={`teacher-filter-button ${adminWeekTeacher===''?'active':''}`}
       onClick={()=>setAdminWeekTeacher('')}
     >
       전체
     </button>
     {meta.teachers.map(t=><button
       key={t.id}
       className={`teacher-filter-button ${adminWeekTeacher===t.id?'active':''}`}
       onClick={()=>setAdminWeekTeacher(t.id)}
     >
       {t.teacher_name}
     </button>)}
   </div>}

   {busy&&<div className="weekly-state-box">주간 시간표를 불러오는 중입니다.</div>}
   {!busy&&weekDays.length===0&&<div className="weekly-state-box">표시할 주간 데이터가 없습니다.</div>}
   {!busy&&weekDays.length>0&&(
     user.role==='admin'
       ? <div
           className={adminWeekTeacher?'week-board compact-admin-week':'week-board'}
           style={{'--print-column-count':Math.max(printDays.length,1)} as React.CSSProperties}
         >
           {visibleWeekDays().map(d=><section className={`week-day-column ${!printDays.includes(d.dayOfWeek)?'print-day-hidden':''}`} key={d.date}>
             <div className="week-day-head">
               <strong>{DAYS[d.dayOfWeek]}</strong>
               <span>{short(d.date)}</span>
               <small>{d.lessons.length}개</small>
             </div>

             {d.events?.length>0&&<div className="week-events">
               {d.events.map(e=><span key={e.id}>{e.event_type} · {e.title}</span>)}
             </div>}

             <div className="week-day-lessons">
               {d.lessons.length?d.lessons.map(l=><button
                 key={l.schedule_code}
                 className={`week-lesson-card ${statusClass(l)} ${adminWeekTeacher?'compact-week-card':''}`}
                 onClick={()=>openLesson(l)}
                 onContextMenu={e=>{if(!l.isCustomMakeup){e.preventDefault();openChange(l)}}}
               >
                 <div className="week-card-top">
                   <strong>{l.start_time?.slice(0,5)}</strong>
                   <span>{room(l.room)}</span>
                 </div>
                 <div className="lesson-name">{l.classes?.class_name}</div>
                 <div className="lesson-subject">{l.subject}</div>
                 {!adminWeekTeacher&&<div className="teacher-chip">{l.teachers?.teacher_name}</div>}
                 {l.operationStatus!=='정상'&&<div className="op-badge">{l.operationStatus}</div>}
               </button>):<div className="week-empty">수업 없음</div>}
             </div>
           </section>)}
         </div>
       : <div className="teacher-timetable-wrap">
           <div className="teacher-timetable">
             <div className="tt-corner">TIME</div>

             {weekDays.map(d=><div className="tt-day-head" key={`head_${d.date}`}>
               <strong>{DAYS[d.dayOfWeek]}</strong>
               <span>{short(d.date)}</span>
               {d.events?.length>0&&<small>{d.events.map(e=>e.title).join(' · ')}</small>}
             </div>)}

             <div className="tt-time-axis" style={{height:(TT_END-TT_START)*TT_PX_PER_MIN}}>
               {TT_HOURS.map(hour=><div
                 className="tt-time-label"
                 key={hour}
                 style={{top:(hour*60-TT_START)*TT_PX_PER_MIN}}
               >
                 {String(hour).padStart(2,'0')}:00
               </div>)}
             </div>

             {weekDays.map(d=><div
               className="tt-day-lane"
               key={`lane_${d.date}`}
               style={{height:(TT_END-TT_START)*TT_PX_PER_MIN}}
             >
               {TT_HOURS.map(hour=><div
                 className="tt-hour-line"
                 key={`${d.date}_${hour}`}
                 style={{top:(hour*60-TT_START)*TT_PX_PER_MIN}}
               />)}

               {(()=>{
                 const overlapLayout=layoutOverlaps(d.lessons);

                 return d.lessons.map(l=>{
                   const layout=overlapLayout.get(l.schedule_code)??{column:0,columns:1};
                   const gap=4;
                   const width=`calc(${100/layout.columns}% - ${gap}px)`;
                   const left=`calc(${(100/layout.columns)*layout.column}% + ${layout.column?gap/2:gap}px)`;

                   return <button
                     type="button"
                     key={`${d.date}_${l.schedule_code}`}
                     className={`tt-lesson ${statusClass(l)} ${layout.columns>1?'tt-overlap':''}`}
                     style={{
                       top:ttTop(l.start_time),
                       height:ttHeight(l.start_time,l.end_time),
                       left,
                       width,
                       right:'auto'
                     }}
                     onClick={()=>openLesson(l)}
                   >
                     <div className="tt-lesson-simple">
                       <strong>{l.classes?.class_name}</strong>
                       <span>{l.start_time?.slice(0,5)}-{l.end_time?.slice(0,5)}</span>
                     </div>
                     {l.operationStatus!=='정상'&&<em>{l.operationStatus}</em>}
                   </button>;
                 });
               })()}
             </div>)}
           </div>
         </div>
   )}
  </section>:<section className="schedule-panel class-week-panel printable-schedule">
   <div className="weekly-toolbar">
     <div>
       <div className="section-kicker">CLASS WEEKLY</div>
       <h2>반별 주간 · 진도/숙제 요약</h2>
       <div className="admin-week-caption">{user.role==='admin'?'반 하나를 선택해서 월~금 수업과 작성 내용을 한 번에 확인합니다.':'내가 담당하는 반의 월~금 수업과 선생님들의 작성 내용을 함께 확인합니다.'}</div>
     </div>

     <div className="week-nav">
       <button onClick={()=>loadClassWeek(add(weekStart||weekBase,-7))}>‹ 지난주</button>
       <button onClick={()=>loadClassWeek(date)}>이번주</button>
       <button onClick={()=>loadClassWeek(add(weekStart||weekBase,7))}>다음주 ›</button>
     </div>
   </div>

   <div className="class-week-toolbar">
     <select
       value={classWeekClassId}
       onChange={async e=>{
         const id=e.target.value;
         setClassWeekClassId(id);
         await loadClassWeek(weekBase||date,id);
       }}
     >
       <option value="">반 선택</option>
       {accessibleClasses.map(c=><option key={c.id} value={c.id}>{c.class_name}</option>)}
     </select>

     <div className="summary-copy-buttons no-print">
       <button onClick={()=>copySummary('progress')}>진도 복사</button>
       <button onClick={()=>copySummary('homework')}>숙제 복사</button>
       <button onClick={()=>copySummary('all')}>전체 복사</button>
     </div>
   </div>

   {user.role==='admin'&&<div className="print-toolbar no-print">
     <div className="print-day-picker">
       {[1,2,3,4,5].map(day=><button
         type="button"
         key={day}
         className={`print-day-button ${printDays.includes(day)?'active':''}`}
         onClick={()=>togglePrintDay(day)}
       >
         {DAYS[day]}
       </button>)}
     </div>
     <button type="button" className="print-action-button" onClick={printCurrentSchedule}>A4 인쇄</button>
   </div>}

   {classWeekBusy&&<div className="weekly-state-box">반별 주간 정보를 불러오는 중입니다.</div>}

   {!classWeekBusy&&!classWeekData&&<div className="weekly-state-box">반을 선택해주세요.</div>}

   {!classWeekBusy&&classWeekData&&<>
     <div className="class-week-title">
       <strong>{classWeekData.classInfo?.class_name}</strong>
       <span>{short(classWeekData.weekStart)} ~ {short(classWeekData.weekEnd)}</span>
     </div>

     <div
       className="week-board class-week-board"
       style={{'--print-column-count':Math.max(printDays.length,1)} as React.CSSProperties}
     >
       {(classWeekData.days||[]).map((d:any)=><section className={`week-day-column ${!printDays.includes(d.dayOfWeek)?'print-day-hidden':''}`} key={d.date}>
         <div className="week-day-head">
           <strong>{DAYS[d.dayOfWeek]}</strong>
           <span>{short(d.date)}</span>
           <small>{d.lessons.length}개</small>
         </div>

         <div className="week-day-lessons">
           {d.lessons.length
             ? d.lessons.map((l:any)=><div
                 key={`${l.schedule_code}_${d.date}`}
                 className={`week-lesson-card class-week-card ${
                   l.operationStatus==='휴강'
                     ?'cancelled'
                     :l.operationStatus==='보강'
                       ?'makeup'
                       :''
                 }`}
               >
                 <div className="week-card-top">
                   <strong>{l.start_time?.slice(0,5)}</strong>
                   <span>{room(l.room)}</span>
                 </div>

                 <div className="lesson-name">{l.subject}</div>
                 <div className="teacher-chip">{l.teachers?.teacher_name||'미지정'}</div>

                 {l.operationStatus!=='정상'&&<div className="op-badge">{l.operationStatus}</div>}
               </div>)
             : <div className="week-empty">수업 없음</div>}
         </div>
       </section>)}
     </div>

     <section className="class-summary-section">
       <div className="section-kicker">LESSON SUMMARY</div>
       <h3>진도 · 숙제 통합 요약</h3>

       {(classWeekData.records||[]).length===0
         ? <div className="weekly-state-box">이 주에 작성된 진도/숙제가 없습니다.</div>
         : <div className="class-summary-list">
             {([...new Set((classWeekData.records||[]).map((r:any)=>r.lesson_date))] as string[]).map((lessonDate)=><div className="summary-date-group" key={lessonDate}>
               <div className="summary-date-head">{fmt(lessonDate)}</div>

               {(classWeekData.records||[])
                 .filter((r:any)=>r.lesson_date===lessonDate)
                 .map((r:any,index:number)=><article className="summary-record-card" key={`${r.schedule_id}_${index}`}>
                   <div className="summary-record-head">
                     <strong>{r.teacher_name}</strong>
                     <span>{r.subject||'수업'}</span>
                   </div>

                   <div className="summary-content-row">
                     <b>진도</b>
                     <p>{r.progress||'작성 없음'}</p>
                   </div>

                   <div className="summary-content-row">
                     <b>숙제</b>
                     <p>{r.homework||'작성 없음'}</p>
                   </div>

                   {r.lesson_memo&&<div className="summary-content-row">
                     <b>메모</b>
                     <p>{r.lesson_memo}</p>
                   </div>}
                 </article>)}
             </div>)}
           </div>}
     </section>
   </>}
  </section>}
 </div></main>
 {selected&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null)}}><section className="lesson-modal"><header className="modal-head"><div><div className="modal-kicker">LESSON MANAGEMENT</div><h2>{selected.classes?.class_name}</h2><div className="modal-sub">{fmt(selected.lessonDate)} · {selected.start_time?.slice(0,5)} ~ {selected.end_time?.slice(0,5)} · {selected.subject} · {room(selected.room)}</div></div><button className="modal-close" onClick={()=>setSelected(null)}>×</button></header>{detailBusy||!detail?<div className="modal-loading">불러오는 중...</div>:<div className="modal-body"><section className="record-grid"><label className="record-field"><span>수업 진도</span><textarea value={detail.record.progress} onChange={e=>updateRecord('progress',e.target.value)}/></label><label className="record-field"><span>숙제</span><textarea value={detail.record.homework} onChange={e=>updateRecord('homework',e.target.value)}/></label></section><label className="record-field memo-field"><span>특이사항</span><textarea value={detail.record.lesson_memo} onChange={e=>updateRecord('lesson_memo',e.target.value)}/></label><section className="attendance-section"><div className="attendance-head"><h3>학생 출결 <small>{detail.students.length}명</small></h3><button className="all-present-button" onClick={allPresent}>전체 출석</button></div><div className="student-list">{detail.students.map((s,i)=><article className="student-row" key={s.id}><div className="student-info"><strong>{s.student_name}</strong><span>{[s.school,s.registered_grade].filter(Boolean).join(' · ')}</span></div><div className="attendance-buttons">{STATUSES.map(st=><button key={st} className={`attendance-button ${s.attendance_status===st?`active ${st}`:''}`} onClick={()=>updateStudent(i,{attendance_status:st})}>{st}</button>)}</div><input className="attendance-memo" value={s.attendance_memo} onChange={e=>updateStudent(i,{attendance_memo:e.target.value})} placeholder="출결 메모"/></article>)}</div></section><div className="modal-actions"><button className="cancel-button" onClick={()=>setSelected(null)}>닫기</button><button className="save-button" disabled={saving} onClick={saveLesson}>{saving?'저장 중...':'저장'}</button></div></div>}</section></div>}
 {adminModal&&<div className="modal-backdrop"><section className="admin-modal"><header className="modal-head"><div><div className="modal-kicker">ADMIN OPERATION</div><h2>{adminModal==='event'?'학원 일정 등록':adminModal==='makeup'?'보강 수업 추가':'당일 수업 변경'}</h2></div><button className="modal-close" onClick={()=>setAdminModal(null)}>×</button></header><div className="admin-form">{adminModal==='event'?<><label>일정 종류<select value={eventForm.eventType||'기타'} onChange={e=>setEventForm({...eventForm,eventType:e.target.value})}><option>학원방학</option><option>시험집중</option><option>Day-off</option><option>기타</option></select></label><label>제목<input value={eventForm.title||''} onChange={e=>setEventForm({...eventForm,title:e.target.value})}/></label><div className="two"><label>시작일<input type="date" value={eventForm.startDate||''} onChange={e=>setEventForm({...eventForm,startDate:e.target.value})}/></label><label>종료일<input type="date" value={eventForm.endDate||''} onChange={e=>setEventForm({...eventForm,endDate:e.target.value})}/></label></div><label>선생님 (Day-off용)<select value={eventForm.teacherId||''} onChange={e=>setEventForm({...eventForm,teacherId:e.target.value})}><option value="">전체/없음</option>{meta.teachers.map(t=><option value={t.id} key={t.id}>{t.teacher_name}</option>)}</select></label><label>메모<textarea value={eventForm.memo||''} onChange={e=>setEventForm({...eventForm,memo:e.target.value})}/></label><button className="save-button wide" onClick={saveEvent}>일정 저장</button></>:<>{adminModal==='makeup'?<><label>보강명 / 학생명<input value={changeForm.title||''} onChange={e=>setChangeForm({...changeForm,title:e.target.value})} placeholder="예: 김민준 개별보강"/></label><div className="two"><label>날짜<input type="date" value={changeForm.date||''} onChange={e=>setChangeForm({...changeForm,date:e.target.value})}/></label><label>강의실<select value={changeForm.room||''} onChange={e=>setChangeForm({...changeForm,room:e.target.value})}>{ROOMS.map(r=><option key={r}>{r}</option>)}</select></label></div><div className="two"><label>시작<input type="time" value={changeForm.startTime||''} onChange={e=>setChangeForm({...changeForm,startTime:e.target.value})}/></label><label>종료<input type="time" value={changeForm.endTime||''} onChange={e=>setChangeForm({...changeForm,endTime:e.target.value})}/></label></div><label>과목<input value={changeForm.subject||''} onChange={e=>setChangeForm({...changeForm,subject:e.target.value})} placeholder="예: 문법 보강"/></label>{user.role==='admin'&&<label>담당 선생님<select value={changeForm.teacherId||''} onChange={e=>setChangeForm({...changeForm,teacherId:e.target.value})}><option value="">선생님 선택</option>{meta.teachers.map(t=><option value={t.id} key={t.id}>{t.teacher_name}</option>)}</select></label>}<label>메모<textarea value={changeForm.memo||''} onChange={e=>setChangeForm({...changeForm,memo:e.target.value})}/></label><button className="save-button wide" onClick={saveCustomMakeup}>보강 등록</button></>:<><div className="two"><label>날짜<input type="date" value={changeForm.date||''} onChange={e=>setChangeForm({...changeForm,date:e.target.value})}/></label><label>상태<select value={changeForm.status||'정상'} onChange={e=>setChangeForm({...changeForm,status:e.target.value})}><option>정상</option><option>휴강</option><option>보강</option></select></label></div><div className="two"><label>시작<input type="time" value={changeForm.startTime||''} onChange={e=>setChangeForm({...changeForm,startTime:e.target.value})}/></label><label>종료<input type="time" value={changeForm.endTime||''} onChange={e=>setChangeForm({...changeForm,endTime:e.target.value})}/></label></div><label>과목<input value={changeForm.subject||''} onChange={e=>setChangeForm({...changeForm,subject:e.target.value})}/></label><label>강의실<select value={changeForm.room||''} onChange={e=>setChangeForm({...changeForm,room:e.target.value})}>{ROOMS.map(r=><option key={r}>{r}</option>)}</select></label><label>선생님<select value={changeForm.teacherId||''} onChange={e=>setChangeForm({...changeForm,teacherId:e.target.value})}>{meta.teachers.map(t=><option value={t.id} key={t.id}>{t.teacher_name}</option>)}</select></label><label>메모<textarea value={changeForm.memo||''} onChange={e=>setChangeForm({...changeForm,memo:e.target.value})}/></label><div className="admin-actions"><button className="reset-button" onClick={resetChange}>기본 시간표 복원</button><button className="save-button" onClick={saveChange}>변경 저장</button></div></>}</>}</div></section></div>}
 {toast&&<div className="toast">{toast}</div>}
 </>;
}
