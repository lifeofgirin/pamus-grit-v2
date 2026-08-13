"use client";
import {FormEvent,useEffect,useMemo,useState} from "react";

type User={role:"teacher"|"admin";teacherCode:string|null;displayName:string};
type Lesson={id:string;schedule_code:string;class_id:string;start_time:string;end_time:string;subject:string;room:string|null;teacher_id:string|null;classes:{class_code:string;class_name:string}|null;teachers:{teacher_code:string;teacher_name:string}|null;lessonDate:string;progressDone:boolean;homeworkDone:boolean;attendanceDone:boolean;studentCount:number;attendanceCount:number;operationStatus?:string;operationMemo?:string;isCustomMakeup?:boolean;makeupId?:string};
type EventRow={id:string;event_type:string;title:string;start_date:string;end_date:string;teacher_id:string|null;memo:string|null;teachers?:{teacher_name:string}|null};
type WeekDay={date:string;dayOfWeek:number;lessons:Lesson[];events:EventRow[];vacation:boolean};
type Student={id:string;student_name:string;school:string|null;registered_grade:string|null;attendance_status:string;attendance_memo:string;individual_memo:string};
type Detail={date:string;schedule:Lesson;record:{progress:string;homework:string;lesson_memo:string};students:Student[]};
type Teacher={id:string;teacher_code:string;teacher_name:string};

type AdminTeacher={
  id:string;
  teacher_code:string;
  teacher_name:string;
  is_active:boolean;
  schedule_count:number;
  primary_class_count:number;
  has_login:boolean;
  login_active:boolean;
};
type AdminStudent={
  id:string;
  student_name:string;
  school:string|null;
  registered_grade:string|null;
  registered_school_year:number|null;
  birth_date:string|null;
  class_id:string|null;
  classes?:{class_name:string}|null;
};

type AdminClass={
  id:string;
  class_code:string;
  class_name:string;
  primary_teacher_id:string|null;
  teachers?:{teacher_name:string}|null;
  student_count:number;
};

type ClassStudent={
  id:string;
  student_name:string;
  school:string|null;
  registered_grade:string|null;
  class_id:string|null;
};
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
const TT_START=13*60;
const TT_END=20*60;
const TT_PX_PER_MIN=1;
const toMinutes=(v:string)=>{
  const [h,m]=String(v||"00:00").slice(0,5).split(":").map(Number);
  return h*60+m;
};
const ttTop=(v:string)=>Math.max(0,(toMinutes(v)-TT_START)*TT_PX_PER_MIN);
const ttHeight=(start:string,end:string)=>Math.max(38,(toMinutes(end)-toMinutes(start))*TT_PX_PER_MIN);
const TT_HOURS=Array.from({length:8},(_,i)=>13+i);
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


const monthKeyFromDate=(d:string)=>d?d.slice(0,7):"";
const addMonths=(month:string,amount:number)=>{
  if(!month)return month;
  const [y,m]=month.split("-").map(Number);
  const x=new Date(Date.UTC(y,m-1+amount,1));
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth()+1).padStart(2,"0")}`;
};
const monthTitle=(month:string)=>{
  if(!month)return "";
  const [y,m]=month.split("-").map(Number);
  return `${y}년 ${m}월`;
};
const calendarCells=(month:string)=>{
  if(!month)return [] as string[];

  const [year,mon]=month.split("-").map(Number);
  const first=new Date(Date.UTC(year,mon-1,1));
  const start=new Date(first);

  start.setUTCDate(
    start.getUTCDate()-start.getUTCDay()
  );

  return Array.from({length:42},(_,index)=>{
    const d=new Date(start);
    d.setUTCDate(start.getUTCDate()+index);

    return [
      d.getUTCFullYear(),
      String(d.getUTCMonth()+1).padStart(2,"0"),
      String(d.getUTCDate()).padStart(2,"0")
    ].join("-");
  });
};

export default function Home(){
 const[loading,setLoading]=useState(true),[loginLoading,setLoginLoading]=useState(false),[pin,setPin]=useState(""),[error,setError]=useState("");
 const[user,setUser]=useState<User|null>(null),[view,setView]=useState<"daily"|"work"|"weekly"|"monthly"|"students"|"classes"|"teachers"|"classWeekly">("daily"),[date,setDate]=useState(""),[lessons,setLessons]=useState<Lesson[]>([]),[events,setEvents]=useState<EventRow[]>([]);
 const[weekBase,setWeekBase]=useState(""),[weekStart,setWeekStart]=useState(""),[weekEnd,setWeekEnd]=useState(""),[weekDays,setWeekDays]=useState<WeekDay[]>([]),[busy,setBusy]=useState(false);
 const[selected,setSelected]=useState<Lesson|null>(null),[detail,setDetail]=useState<Detail|null>(null),[detailBusy,setDetailBusy]=useState(false),[saving,setSaving]=useState(false),[toast,setToast]=useState("");
 const[meta,setMeta]=useState<Meta>({teachers:[],classes:[],schedules:[]}),[adminModal,setAdminModal]=useState<"change"|"makeup"|"event"|null>(null);
 const[adminWeekTeacher,setAdminWeekTeacher]=useState<string>("");
 const[classWeekClassId,setClassWeekClassId]=useState<string>("");
 const[classWeekData,setClassWeekData]=useState<any>(null);
 const[classWeekBusy,setClassWeekBusy]=useState(false);
 const[bandModal,setBandModal]=useState(false);
 const[bandForm,setBandForm]=useState<{date:string;title:string;content:string}>({
   date:'',
   title:'',
   content:''
 });
 const[accessibleClasses,setAccessibleClasses]=useState<{id:string;class_code:string;class_name:string}[]>([]);
 const[workData,setWorkData]=useState<any>(null);
 const[workBusy,setWorkBusy]=useState(false);
 const[printDays,setPrintDays]=useState<number[]>([1,2,3,4,5]);
 const[monthBase,setMonthBase]=useState("");
 const[monthEvents,setMonthEvents]=useState<EventRow[]>([]);
 const[monthBusy,setMonthBusy]=useState(false);
 const[adminStudents,setAdminStudents]=useState<AdminStudent[]>([]);
 const[studentsBusy,setStudentsBusy]=useState(false);
 const[studentSearch,setStudentSearch]=useState("");
 const[studentModal,setStudentModal]=useState(false);
 const[studentForm,setStudentForm]=useState<any>({});
 const[studentBirthSupported,setStudentBirthSupported]=useState(true);
 const[studentDetail,setStudentDetail]=useState<any>(null);
 const[studentDetailBusy,setStudentDetailBusy]=useState(false);
 const[adminClasses,setAdminClasses]=useState<AdminClass[]>([]);
 const[classStudents,setClassStudents]=useState<ClassStudent[]>([]);
 const[classesBusy,setClassesBusy]=useState(false);
 const[classSearch,setClassSearch]=useState("");
 const[classModal,setClassModal]=useState(false);
 const[classForm,setClassForm]=useState<any>({});
 const[classStudentSearch,setClassStudentSearch]=useState("");
 const[classScheduleDate,setClassScheduleDate]=useState(date);
 const[classScheduleRows,setClassScheduleRows]=useState<any[]>([]);
 const[classScheduleBusy,setClassScheduleBusy]=useState(false);
 const[classScheduleSaving,setClassScheduleSaving]=useState(false);
 const[uiLang,setUiLang]=useState<'ko'|'en'>('ko');
 const[adminTeachers,setAdminTeachers]=useState<AdminTeacher[]>([]);
 const[teachersBusy,setTeachersBusy]=useState(false);
 const[teacherSearch,setTeacherSearch]=useState("");
 const[teacherModal,setTeacherModal]=useState(false);
 const[teacherForm,setTeacherForm]=useState<any>({});
 const[teacherPin,setTeacherPin]=useState("");
 const[changeForm,setChangeForm]=useState<any>({}),[eventForm,setEventForm]=useState<any>({eventType:"기타"});

 useEffect(()=>{
  try{
   const saved=window.localStorage.getItem('pamus_ui_lang');
   if(saved==='en'||saved==='ko'){
    setUiLang(saved);
   }
  }catch{}
 },[]);

 function changeUiLang(next:'ko'|'en'){
  setUiLang(next);
  try{
   window.localStorage.setItem('pamus_ui_lang',next);
  }catch{}
 }

 const tr=(ko:string,en:string)=>uiLang==='en'?en:ko;

 const TEACHER_ENGLISH_NAMES:Record<string,string>={
  '소피아T':'Sophia',
  '에릭T':'Eric',
  '리나T':'Lina',
  '한T':'Han',
  '이니T':'Iny',
  '마이클T':'Michael',
  '안나T':'Anna',
  '메이T':'May',
  'Adriana T':'Adriana',
  '현지T':'Hyunji',
  '조이T':'Joy'
 };

 const CLASS_ENGLISH_PREFIXES:[string,string][]=[
  ['컬럼비아','Columbia'],
  ['예일','Yale'],
  ['버클리','Berkeley'],
  ['프린스턴','Princeton'],
  ['뉴욕','New york']
 ];

 function teacherDisplayName(name?:string|null){
  const raw=String(name||'').trim();
  if(uiLang!=='en'||!raw)return raw;
  return TEACHER_ENGLISH_NAMES[raw]||raw;
 }

 function classDisplayName(name?:string|null){
  const raw=String(name||'').trim();
  if(uiLang!=='en'||!raw)return raw;

  for(const [ko,en] of CLASS_ENGLISH_PREFIXES){
   if(raw.startsWith(ko)){
    const suffix=raw.slice(ko.length).trim();
    return suffix?`${en} ${suffix}`:en;
   }
  }

  return raw;
 }

 function statusDisplayName(status?:string|null){
  const raw=String(status||'');
  if(uiLang!=='en')return raw;

  const map:Record<string,string>={
   '정상':'Normal',
   '휴강':'Cancelled',
   '보강':'Make-up',
   '학원방학':'Academy Break',
   '출석':'Present',
   '지각':'Late',
   '결석':'Absent'
  };

  return map[raw]||raw;
 }


 useEffect(()=>{restore()},[]); useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(""),2200);return()=>clearTimeout(t)},[toast]);
 const groups=useMemo(()=>ROOMS.map(r=>({room:r,lessons:lessons.filter(l=>room(l.room)===r)})),[lessons]);
 const pending=lessons.filter(l=>!l.progressDone||!l.homeworkDone||!l.attendanceDone).length;
 const selectedAdminTeacher=meta.teachers.find(t=>t.id===adminWeekTeacher)||null;
 const filteredAdminStudents=useMemo(()=>{
   const q=studentSearch.trim().toLowerCase();

   if(!q)return adminStudents;

   return adminStudents.filter(student=>
     [
       student.student_name,
       student.school,
       student.registered_grade,
       student.registered_school_year,
       student.classes?.class_name
     ]
       .filter(Boolean)
       .some(value=>String(value).toLowerCase().includes(q))
   );
 },[adminStudents,studentSearch]);

 const filteredAdminClasses=useMemo(()=>{
   const q=classSearch.trim().toLowerCase();

   if(!q)return adminClasses;

   return adminClasses.filter(item=>
     [
       item.class_name,
       item.class_code,
       item.teachers?.teacher_name
     ]
       .filter(Boolean)
       .some(value=>String(value).toLowerCase().includes(q))
   );
 },[adminClasses,classSearch]);

 const selectedClassStudents=useMemo(()=>{
   if(!classForm.id)return [];

   const q=classStudentSearch.trim().toLowerCase();

   return classStudents
     .filter(student=>student.class_id===classForm.id)
     .filter(student=>{
       if(!q)return true;

       return [
         student.student_name,
         student.school,
         student.registered_grade
       ]
         .filter(Boolean)
         .some(value=>String(value).toLowerCase().includes(q));
     });
 },[classStudents,classForm.id,classStudentSearch]);

 const unassignedOrOtherStudents=useMemo(()=>{
   if(!classForm.id)return [];

   const q=classStudentSearch.trim().toLowerCase();

   return classStudents
     .filter(student=>student.class_id!==classForm.id)
     .filter(student=>{
       if(!q)return true;

       return [
         student.student_name,
         student.school,
         student.registered_grade
       ]
         .filter(Boolean)
         .some(value=>String(value).toLowerCase().includes(q));
     })
     .slice(0,80);
 },[classStudents,classForm.id,classStudentSearch]);

 const filteredAdminTeachers=useMemo(()=>{
   const q=teacherSearch.trim().toLowerCase();

   if(!q)return adminTeachers;

   return adminTeachers.filter(teacher=>
     [
       teacher.teacher_name,
       teacher.teacher_code
     ]
       .filter(Boolean)
       .some(value=>String(value).toLowerCase().includes(q))
   );
 },[adminTeachers,teacherSearch]);
 function visibleWeekDays(){
   if(user?.role!=="admin"||!adminWeekTeacher)return weekDays;
   return weekDays.map(day=>({
     ...day,
     lessons:(day.lessons||[]).filter(lesson=>lesson.teacher_id===adminWeekTeacher)
   }));
 }
 async function restore(){try{const r=await fetch('/api/me',{cache:'no-store'});if(!r.ok)return;const j=await r.json();setUser(j.user);const t=await loadToday();if(t?.date)setWeekBase(t.date);loadClassOptions();if(j.user.role==='admin')loadMeta()}finally{setLoading(false)}}
 async function login(e:FormEvent){e.preventDefault();setError("");if(!/^\d{4}$/.test(pin)){setError('4자리 로그인번호를 입력해주세요.');return}setLoginLoading(true);try{const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin})});const j=await r.json();if(!r.ok){setError(j.message||'로그인 실패');return}setUser(j.user);setPin('');const t=await loadToday();if(t?.date)setWeekBase(t.date);loadClassOptions();if(j.user.role==='admin')loadMeta()}finally{setLoginLoading(false)}}
 async function loadTeachers(){
  if(user?.role!=='admin')return;

  setTeachersBusy(true);

  try{
    const r=await fetch('/api/admin/teachers',{cache:'no-store'});
    const j=await r.json();

    if(!r.ok||!j.ok){
      setToast(j.message||'선생님 목록을 불러오지 못했습니다.');
      return;
    }

    setAdminTeachers(Array.isArray(j.teachers)?j.teachers:[]);
  }catch(e){
    console.error('loadTeachers:',e);
    setToast('선생님관리 화면 표시 중 오류가 발생했습니다.');
  }finally{
    setTeachersBusy(false);
  }
 }

 function openNewTeacher(){
  setTeacherForm({
    id:'',
    teacherCode:'',
    teacherName:'',
    isActive:true
  });
  setTeacherPin('');
  setTeacherModal(true);
 }

 function openTeacherEdit(teacher:AdminTeacher){
  setTeacherForm({
    id:teacher.id,
    teacherCode:teacher.teacher_code,
    teacherName:teacher.teacher_name,
    isActive:teacher.is_active!==false
  });
  setTeacherPin('');
  setTeacherModal(true);
 }

 async function saveTeacher(){
  if(!String(teacherForm.teacherName||'').trim()){
    setToast('선생님 이름을 입력해주세요.');
    return;
  }

  const editing=Boolean(teacherForm.id);

  if(!editing&&!/^\d{4,8}$/.test(teacherPin)){
    setToast('새 선생님 PIN은 숫자 4~8자리로 입력해주세요.');
    return;
  }

  const payload={
    ...teacherForm,
    pin:teacherPin
  };

  const r=await fetch(
    '/api/admin/teachers',
    {
      method:editing?'PUT':'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload)
    }
  );

  const j=await r.json();

  if(!r.ok||!j.ok){
    setToast(j.message||'선생님 저장에 실패했습니다.');
    return;
  }

  setTeacherModal(false);
  setToast(editing?'선생님 정보 수정 완료':'선생님 등록 완료');

  await Promise.all([
    loadTeachers(),
    loadMeta(),
    loadClassOptions()
  ]);
 }

 async function resetTeacherPin(){
  if(!teacherForm.id)return;

  if(!/^\d{4,8}$/.test(teacherPin)){
    setToast('새 PIN은 숫자 4~8자리로 입력해주세요.');
    return;
  }

  const r=await fetch(
    '/api/admin/teachers/pin',
    {
      method:'PUT',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        teacherId:teacherForm.id,
        pin:teacherPin
      })
    }
  );

  const j=await r.json();

  if(!r.ok||!j.ok){
    setToast(j.message||'PIN 재설정에 실패했습니다.');
    return;
  }

  setTeacherPin('');
  setToast('PIN 재설정 완료');
  await loadTeachers();
 }

 async function deleteTeacher(){
  if(!teacherForm.id)return;

  if(!window.confirm(`${teacherForm.teacherName} 선생님을 정말 삭제할까요?`))return;

  const r=await fetch(
    '/api/admin/teachers',
    {
      method:'DELETE',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({id:teacherForm.id})
    }
  );

  const j=await r.json();

  if(!r.ok||!j.ok){
    setToast(j.message||'선생님 삭제에 실패했습니다.');
    return;
  }

  setTeacherModal(false);
  setToast('선생님 삭제 완료');

  await Promise.all([
    loadTeachers(),
    loadMeta(),
    loadClassOptions()
  ]);
 }

 async function loadClassBaseSchedule(classId:string,targetDate:string){
  if(!classId)return;

  setClassScheduleBusy(true);

  try{
    const r=await fetch(
      `/api/admin/classes/schedule?classId=${encodeURIComponent(classId)}&date=${encodeURIComponent(targetDate)}`,
      {cache:'no-store'}
    );
    const j=await r.json();

    if(!r.ok||!j.ok){
      setClassScheduleRows([]);
      setToast(j.message||'기본 시간표를 불러오지 못했습니다.');
      return;
    }

    setClassScheduleRows(
      (j.rows||[]).map((row:any)=>({
        _client_id:
          row.id ||
          `${row.day_of_week}_${String(row.start_time||'').slice(0,5)}_${Math.random().toString(36).slice(2)}`,
        day_of_week:Number(row.day_of_week),
        start_time:String(row.start_time||'').slice(0,5),
        end_time:String(row.end_time||'').slice(0,5),
        subject:row.subject||'',
        room:row.room||'',
        teacher_id:row.teacher_id||''
      }))
    );
  }catch(e){
    console.error('loadClassBaseSchedule:',e);
    setToast('기본 시간표 표시 중 오류가 발생했습니다.');
  }finally{
    setClassScheduleBusy(false);
  }
 }

 function addClassScheduleRow(){
  setClassScheduleRows(rows=>[
    ...rows,
    {
      _client_id:`new_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      day_of_week:1,
      start_time:'14:00',
      end_time:'14:40',
      subject:'',
      room:'',
      teacher_id:''
    }
  ]);
 }

 function updateClassScheduleRow(index:number,key:string,value:any){
  setClassScheduleRows(rows=>
    rows.map((row,i)=>
      i===index
        ?{...row,[key]:value}
        :row
    )
  );
 }

 function removeClassScheduleRow(index:number){
  setClassScheduleRows(rows=>rows.filter((_,i)=>i!==index));
 }

 async function saveClassBaseSchedule(){
  if(!classForm.id)return;

  if(!classScheduleDate){
    setToast('적용 시작일을 선택해주세요.');
    return;
  }

  for(const row of classScheduleRows){
    if(!row.start_time||!row.end_time){
      setToast('모든 수업의 시작/종료 시간을 입력해주세요.');
      return;
    }

    if(row.end_time<=row.start_time){
      setToast('종료 시간은 시작 시간보다 늦어야 합니다.');
      return;
    }
  }

  if(!window.confirm(
    `${classScheduleDate}부터 ${classForm.className} 반의 기본 시간표를 변경할까요?\n\n이 날짜 이전 시간표는 그대로 보존됩니다.`
  ))return;

  setClassScheduleSaving(true);

  try{
    const r=await fetch(
      '/api/admin/classes/schedule',
      {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          classId:classForm.id,
          effectiveFrom:classScheduleDate,
          rows:classScheduleRows
        })
      }
    );

    const j=await r.json();

    if(!r.ok||!j.ok){
      setToast(j.message||'기본 시간표 저장에 실패했습니다.');
      return;
    }

    setToast(`${classScheduleDate}부터 새 기본 시간표가 적용됩니다.`);

    await Promise.all([
      loadClassBaseSchedule(classForm.id,classScheduleDate),
      loadMeta(),
      loadWeek(weekBase),
      loadClassWeek(weekBase)
    ]);
  }finally{
    setClassScheduleSaving(false);
  }
 }

 async function loadClasses(){
  if(user?.role!=='admin')return;

  setClassesBusy(true);

  try{
    const r=await fetch('/api/admin/classes',{cache:'no-store'});
    const j=await r.json();

    if(!r.ok||!j.ok){
      setToast(j.message||'반 목록을 불러오지 못했습니다.');
      return;
    }

    setAdminClasses(Array.isArray(j.classes)?j.classes:[]);
    setClassStudents(Array.isArray(j.students)?j.students:[]);
  }catch(e){
    console.error('loadClasses:',e);
    setToast('반관리 화면 표시 중 오류가 발생했습니다.');
  }finally{
    setClassesBusy(false);
  }
 }

 function openNewClass(){
  setClassForm({
    id:'',
    classCode:'',
    className:'',
    primaryTeacherId:''
  });
  setClassStudentSearch('');
  setClassModal(true);
 }

 function openClassEdit(item:AdminClass){
  setClassForm({
    id:item.id,
    classCode:item.class_code||'',
    className:item.class_name||'',
    primaryTeacherId:item.primary_teacher_id||''
  });
  setClassStudentSearch('');
  setClassScheduleDate(date);
  setClassScheduleRows([]);
  setClassModal(true);
  loadClassBaseSchedule(item.id,date);
 }

 async function saveClass(){
  if(!String(classForm.className||'').trim()){
    setToast('반 이름을 입력해주세요.');
    return;
  }

  const editing=Boolean(classForm.id);

  const r=await fetch(
    '/api/admin/classes',
    {
      method:editing?'PUT':'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(classForm)
    }
  );

  const j=await r.json();

  if(!r.ok||!j.ok){
    setToast(j.message||'반 저장에 실패했습니다.');
    return;
  }

  setToast(editing?'반 정보 수정 완료':'반 등록 완료');

  if(!editing){
    setClassModal(false);
  }

  await Promise.all([
    loadClasses(),
    loadMeta(),
    loadClassOptions()
  ]);
 }

 async function deleteClass(){
  if(!classForm.id)return;

  if(!window.confirm(`${classForm.className} 반을 정말 삭제할까요?`))return;

  const r=await fetch(
    '/api/admin/classes',
    {
      method:'DELETE',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({id:classForm.id})
    }
  );

  const j=await r.json();

  if(!r.ok||!j.ok){
    setToast(j.message||'반 삭제에 실패했습니다.');
    return;
  }

  setClassModal(false);
  setToast('반 삭제 완료');

  await Promise.all([
    loadClasses(),
    loadMeta(),
    loadClassOptions()
  ]);
 }

 async function setStudentClass(studentId:string,classId:string){
  const r=await fetch(
    '/api/admin/classes/students',
    {
      method:'PUT',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({studentId,classId})
    }
  );

  const j=await r.json();

  if(!r.ok||!j.ok){
    setToast(j.message||'학생 반 배정 변경에 실패했습니다.');
    return;
  }

  await Promise.all([
    loadClasses(),
    loadStudents()
  ]);
 }

 async function loadStudents(){
  if(user?.role!=='admin')return;

  setStudentsBusy(true);

  try{
    const r=await fetch('/api/admin/students',{cache:'no-store'});
    const j=await r.json();

    if(!r.ok||!j.ok){
      setToast(j.message||'학생 목록을 불러오지 못했습니다.');
      return;
    }

    setAdminStudents(Array.isArray(j.students)?j.students:[]);
    setStudentBirthSupported(j.hasBirthDate!==false);
  }catch(e){
    console.error('loadStudents:',e);
    setToast('학생 목록 표시 중 오류가 발생했습니다.');
  }finally{
    setStudentsBusy(false);
  }
 }

 async function loadStudentDetail(studentId:string){
  if(!studentId)return;

  setStudentDetailBusy(true);

  try{
    const r=await fetch(
      `/api/admin/students/${encodeURIComponent(studentId)}/detail`,
      {cache:'no-store'}
    );
    const j=await r.json();

    if(!r.ok||!j.ok){
      setStudentDetail(null);
      setToast(j.message||'학생 상세 정보를 불러오지 못했습니다.');
      return;
    }

    setStudentDetail(j);
  }catch(e){
    console.error('loadStudentDetail:',e);
    setStudentDetail(null);
    setToast('학생 상세 정보 표시 중 오류가 발생했습니다.');
  }finally{
    setStudentDetailBusy(false);
  }
 }

 function openNewStudent(){
  setStudentDetail(null);
  setStudentDetailBusy(false);
  setStudentForm({
    id:'',
    studentName:'',
    school:'',
    registeredGrade:'',
    registeredSchoolYear:new Date().getFullYear(),
    birthDate:'',
    classId:''
  });
  setStudentModal(true);
 }

 function openStudentEdit(student:AdminStudent){
  setStudentForm({
    id:student.id,
    studentName:student.student_name,
    school:student.school,
    registeredGrade:student.registered_grade,
    registeredSchoolYear:student.registered_school_year||new Date().getFullYear(),
    birthDate:student.birth_date,
    classId:student.class_id
  });
  setStudentDetail(null);
  setStudentModal(true);
  loadStudentDetail(student.id);
 }

 async function saveStudent(){
  if(!String(studentForm.studentName).trim()){
    setToast('학생 이름을 입력해주세요.');
    return;
  }

  const editing=Boolean(studentForm.id);
  const r=await fetch(
    '/api/admin/students',
    {
      method:editing?'PUT':'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(studentForm)
    }
  );
  const j=await r.json();

  if(!r.ok||!j.ok){
    setToast(j.message||'학생 저장에 실패했습니다.');
    return;
  }

  setToast(editing?'학생 정보 수정 완료':'학생 등록 완료');
  await loadStudents();

  if(editing){
    await loadStudentDetail(studentForm.id);
  }else{
    setStudentModal(false);
  }
 }

 async function deleteStudent(){
  if(!studentForm.id)return;

  if(!window.confirm(`${studentForm.studentName} 학생을 정말 삭제할까요?`))return;

  const r=await fetch(
    '/api/admin/students',
    {
      method:'DELETE',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({id:studentForm.id})
    }
  );
  const j=await r.json();

  if(!r.ok||!j.ok){
    setToast(j.message||'학생 삭제에 실패했습니다.');
    return;
  }

  setStudentModal(false);
  setToast('학생 삭제 완료');
  await loadStudents();
 }

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

 async function loadMeta(){try{const r=await fetch('/api/admin/meta',{cache:'no-store'});if(!r.ok)return;const j=await r.json();const teachers=Array.isArray(j.teachers)?j.teachers:[];const classes=Array.isArray(j.classes)?j.classes:[];setMeta({teachers,classes,schedules:Array.isArray(j.schedules)?j.schedules:[]});setAdminWeekTeacher(current=>current||teachers[0]?.id);setClassWeekClassId(current=>current||classes[0]?.id)}catch(e){console.error('loadMeta client:',e)}}
 async function loadToday(){setBusy(true);try{const r=await fetch('/api/today',{cache:'no-store'});const j=await r.json();if(!r.ok)return null;setDate(j.date);setLessons((j.lessons||[]).filter((l:any)=>l.operationStatus!=='휴강'));setEvents(j.events||[]);return j}finally{setBusy(false)}}
 async function loadWeek(base?:string){setBusy(true);try{const target=base||weekBase||date;if(!target){setToast('기준 날짜를 불러오는 중입니다. 잠시 후 다시 눌러주세요.');return}const r=await fetch(`/api/week?date=${encodeURIComponent(target)}`,{cache:'no-store'});const j=await r.json();if(!r.ok||!j.ok){setToast(j.message||'주간 시간표를 불러오지 못했습니다.');return}setWeekBase(target);setWeekStart(j.weekStart);setWeekEnd(j.weekEnd);setWeekDays(Array.isArray(j.days)?j.days.map((d:any)=>({...d,lessons:(d.lessons||[]).filter((l:any)=>l.operationStatus!=='휴강')})):[])}catch(e){console.error('loadWeek client:',e);setToast('주간 화면 표시 중 오류가 발생했습니다.')}finally{setBusy(false)}}
 async function loadMonth(month?:string){
  const target=month||monthBase||monthKeyFromDate(date);

  if(!target){
    setToast('월간 기준 날짜를 불러오는 중입니다.');
    return;
  }

  setMonthBusy(true);

  try{
    const r=await fetch(
      `/api/admin/month?month=${encodeURIComponent(target)}`,
      {cache:'no-store'}
    );
    const j=await r.json();

    if(!r.ok||!j.ok){
      setToast(j.message||'월간 일정을 불러오지 못했습니다.');
      return;
    }

    setMonthBase(target);
    setMonthEvents(Array.isArray(j.events)?j.events:[]);
  }catch(e){
    console.error('loadMonth:',e);
    setToast('월간 일정 화면 표시 중 오류가 발생했습니다.');
  }finally{
    setMonthBusy(false);
  }
 }

 async function switchView(v:"daily"|"work"|"weekly"|"monthly"|"students"|"classes"|"teachers"|"classWeekly"){
  setView(v);

  if(v==='daily'){
    await loadToday();
    return;
  }

  if(v==='work'){
    await loadWork();
    return;
  }

  if(v==='weekly'){
    await loadWeek(weekBase||date);
    return;
  }

  if(v==='monthly'){
    await loadMonth(monthBase||monthKeyFromDate(date));
    return;
  }

  if(v==='students'){
    await loadStudents();
    return;
  }

  if(v==='classes'){
    await loadClasses();
    return;
  }

  if(v==='teachers'){
    await loadTeachers();
    return;
  }

  await loadClassWeek(weekBase||date);
 }
 async function loadClassWeek(base?:string,classId?:string){
  const targetClass=classId||classWeekClassId;
  const targetDate=base||weekBase||date;
  if(!targetClass){setToast('반을 선택해주세요.');return}
  setClassWeekBusy(true);
  try{
    const r=await fetch(`/api/admin/class-week?classId=${encodeURIComponent(targetClass)}&date=${encodeURIComponent(targetDate)}`,{cache:'no-store'});
    const j=await r.json();
    if(!r.ok||!j.ok){setToast(j.message||'반별 주간 정보를 불러오지 못했습니다.');return}
    setClassWeekData({...j,days:Array.isArray(j.days)?j.days.map((d:any)=>({...d,lessons:(d.lessons||[]).filter((l:any)=>l.operationStatus!=='휴강')})):j.days});
    setWeekStart(j.weekStart);
    setWeekEnd(j.weekEnd);
  }catch(e){
    console.error('loadClassWeek:',e);
    setToast('반별 주간 화면 표시 중 오류가 발생했습니다.');
  }finally{
    setClassWeekBusy(false);
  }
 }


 function bandTeacherName(name:string){
  const raw=String(name||'').trim();

  const aliases:Record<string,string>={
    '소피아T':'Sophia',
    '소피아':'Sophia',
    '에릭T':'Eric',
    '에릭':'Eric',
    '리나T':'Lina',
    '리나':'Lina',
    '한T':'Han',
    '한':'Han',
    '이니T':'Ini',
    '이니':'Ini',
    '마이클T':'Michael',
    '마이클':'Michael',
    '안나T':'Anna',
    '안나':'Anna',
    '메이T':'May',
    '메이':'May',
    'Adriana T':'Adriana',
    'AdrianaT':'Adriana',
    'Adriana':'Adriana',
    '현지T':'Hyunji',
    '현지':'Hyunji',
    '조이T':'Joy',
    '조이':'Joy'
  };

  return aliases[raw]||raw.replace(/\s*T$/i,'').trim()||'Teacher';
 }

 function bandDraftForDate(lessonDate:string){
  if(!classWeekData){
    return {
      date:lessonDate,
      title:'',
      content:''
    };
  }

  const className=
    String(classWeekData.classInfo?.class_name||'반').trim();

  const allRecords=
    Array.isArray(classWeekData.records)
      ?classWeekData.records
      :[];

  const dateRecords=
    allRecords.filter(
      (r:any)=>r.lesson_date===lessonDate
    );

  const homeworkRecords=
    dateRecords.filter(
      (r:any)=>String(r.homework||'').trim()
    );

  const teacherSource=
    homeworkRecords.length
      ?homeworkRecords
      :dateRecords;

  const teacherNames:string[]=[];

  teacherSource.forEach((r:any)=>{
    const name=bandTeacherName(r.teacher_name);

    if(name&&!teacherNames.includes(name)){
      teacherNames.push(name);
    }
  });

  // 저장 기록이 없는 날에는 해당 날짜의 시간표 선생님을 사용
  if(!teacherNames.length){
    const day=
      (classWeekData.days||[])
        .find((d:any)=>d.date===lessonDate);

    (day?.lessons||[]).forEach((l:any)=>{
      const name=
        bandTeacherName(
          l.teachers?.teacher_name||''
        );

      if(name&&!teacherNames.includes(name)){
        teacherNames.push(name);
      }
    });
  }

  const bracket=
    teacherNames.length
      ?`[${teacherNames.join(',')}]`
      :'';

  const title=
    `${className}${bracket}숙제`;

  const progressLines=
    dateRecords
      .filter((r:any)=>String(r.progress||'').trim())
      .map((r:any)=>{
        const teacher=bandTeacherName(r.teacher_name);
        const progress=String(r.progress||'').trim();

        return `${teacher} 진도: ${progress}`;
      });

  const homeworkLines=
    homeworkRecords.map((r:any)=>{
      const teacher=bandTeacherName(r.teacher_name);
      const homework=String(r.homework||'').trim();

      return `${teacher} 숙제: ${homework}`;
    });

  const contentParts:string[]=[];

  if(progressLines.length){
    contentParts.push(progressLines.join('\n'));
  }

  if(homeworkLines.length){
    contentParts.push(homeworkLines.join('\n'));
  }

  return {
    date:lessonDate,
    title,
    content:contentParts.join('\n\n')
  };
 }

 function defaultBandDate(){
  if(!classWeekData)return date;

  const records=
    Array.isArray(classWeekData.records)
      ?classWeekData.records
      :[];

  const homeworkDates=[
    ...new Set(
      records
        .filter((r:any)=>String(r.homework||'').trim())
        .map((r:any)=>r.lesson_date)
    )
  ] as string[];

  if(homeworkDates.includes(date)){
    return date;
  }

  const pastOrToday=
    homeworkDates
      .filter(d=>d<=date)
      .sort()
      .at(-1);

  if(pastOrToday)return pastOrToday;

  if(homeworkDates.length){
    return [...homeworkDates].sort()[0];
  }

  const weekDates=
    (classWeekData.days||[])
      .map((d:any)=>d.date);

  if(weekDates.includes(date)){
    return date;
  }

  return classWeekData.weekStart||date;
 }

 function openBandHelper(){
  if(!classWeekData){
    setToast('반을 먼저 선택해주세요.');
    return;
  }

  const targetDate=defaultBandDate();
  setBandForm(bandDraftForDate(targetDate));
  setBandModal(true);
 }

 function changeBandDate(nextDate:string){
  setBandForm(bandDraftForDate(nextDate));
 }

 async function copyBandSchedule(){
  const title=String(bandForm.title||'').trim();
  const content=String(bandForm.content||'').trim();

  if(!title){
    setToast('BAND 일정 제목을 입력해주세요.');
    return;
  }

  const text=
    content
      ?`${title}\n\n${content}`
      :title;

  try{
    await navigator.clipboard.writeText(text);
    setToast('BAND 일정 제목/진도/숙제 복사 완료');
  }catch{
    setToast('클립보드 복사에 실패했습니다.');
  }
 }

 function openBandApp(){
  const motherBandEventUrl=
    'https://www.band.us/band/81127359/event';

  window.open(
    motherBandEventUrl,
    '_blank',
    'noopener,noreferrer'
  );
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
                r.progress
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
                r.homework
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
                r.progress
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
                r.homework
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
 function openChange(l:Lesson){setChangeForm({scheduleId:l.id,date:l.lessonDate,status:l.operationStatus==='휴강'?'휴강':'정상',startTime:l.start_time?.slice(0,5),endTime:l.end_time?.slice(0,5),subject:l.subject,room:room(l.room),teacherId:l.teacher_id,memo:l.operationMemo});setAdminModal('change')}
 function openAdminLesson(l:Lesson){
  const isMobile=
   typeof window!=='undefined' &&
   window.matchMedia('(max-width: 650px)').matches;

  if(user?.role==='admin'&&isMobile&&!l.isCustomMakeup){
   openChange(l);
   return;
  }

  openLesson(l);
 }

 function pickReplacementClass(classId:string){
  const cls=meta.classes.find(c=>c.id===classId);
  const schedule=meta.schedules.find((s:any)=>s.class_id===classId);

  setChangeForm((f:any)=>({
   ...f,
   replacementClassId:classId,
   title:cls?.class_name||'',
   teacherId:schedule?.teacher_id||f.teacherId||'',
   subject:schedule?.subject||f.subject||'대체수업'
  }));
 }

 function openReplacementFromCancelled(cancelled:any){
  setChangeForm({
   replacementMode:true,
   replacementClassId:'',
   title:'',
   date:cancelled.date,
   startTime:cancelled.startTime,
   endTime:cancelled.endTime,
   subject:'대체수업',
   room:cancelled.room||'101호',
   teacherId:'',
   memo:'휴강 공강 시간 대체수업'
  });
  setAdminModal('makeup');
 }

 function openMakeup(){setChangeForm({title:'',date:date,startTime:'',endTime:'',subject:'보강',room:'101호',teacherId:user?.role==='teacher'?(user.teacherCode):'',memo:''});setAdminModal('makeup')}
 function openAddLesson(targetDate?:string){
  const chosenDate=targetDate||date||weekStart;

  setChangeForm({
   addLessonMode:true,
   replacementMode:false,
   replacementClassId:'',
   title:'',
   date:chosenDate,
   startTime:'14:00',
   endTime:'14:40',
   subject:'',
   room:'101호',
   teacherId:'',
   memo:''
  });

  setAdminModal('makeup');
 }

 function availableAddLessonClasses(){
  if(user?.role==='admin'){
   return meta.classes||[];
  }

  return accessibleClasses||[];
 }

 function pickAddLessonClass(classId:string){
  const classes=availableAddLessonClasses();
  const cls=classes.find((c:any)=>c.id===classId);

  let teacherId='';
  let subject='';

  if(user?.role==='admin'){
   const candidates=(meta.schedules||[])
    .filter((s:any)=>s.class_id===classId)
    .sort((a:any,b:any)=>String(a.start_time||'').localeCompare(String(b.start_time||'')));

   const first=candidates[0];
   teacherId=first?.teacher_id||'';
   subject=first?.subject||'';
  }

  setChangeForm((f:any)=>({
   ...f,
   replacementClassId:classId,
   title:cls?.class_name||'',
   teacherId:user?.role==='admin'?(teacherId||f.teacherId||''):'',
   subject:subject||f.subject||''
  }));
 }

 async function saveCustomMakeup(){
  const payload={...changeForm};

  if(payload.addLessonMode||payload.replacementMode){
   const classes=availableAddLessonClasses();
   const selectedClass=classes.find((c:any)=>c.id===payload.replacementClassId);

   if(!selectedClass){
    setToast('추가할 반을 선택해주세요.');
    return;
   }

   payload.title=selectedClass.class_name;
  }

  if(!payload.title?.trim()){
   setToast(changeForm.addLessonMode?'추가할 반을 선택해주세요.':'보강명/학생명을 입력해주세요.');
   return;
  }

  if(!payload.date||!payload.startTime||!payload.endTime){
   setToast('날짜와 시작/종료 시간을 입력해주세요.');
   return;
  }

  if(payload.endTime<=payload.startTime){
   setToast('종료 시간은 시작 시간보다 늦어야 합니다.');
   return;
  }

  if(user?.role==='admin'&&!payload.teacherId){
   setToast('담당 선생님을 선택해주세요.');
   return;
  }

  delete payload.addLessonMode;
  delete payload.replacementMode;
  delete payload.replacementClassId;

  // teacher 계정은 서버가 현재 로그인 선생님 id를 직접 사용한다.
  if(user?.role==='teacher'){
   delete payload.teacherId;
  }

  const r=await fetch('/api/makeup',{
   method:'POST',
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify(payload)
  });

  const j=await r.json();

  if(!r.ok){
   setToast(
    j.message||
    (changeForm.addLessonMode
      ?'수업 추가 실패'
      :changeForm.replacementMode
        ?'대체수업 등록 실패'
        :'보강 등록 실패')
   );
   return;
  }

  setToast(
   changeForm.addLessonMode
    ?'당일 수업을 추가했습니다.'
    :changeForm.replacementMode
      ?'빈 시간에 대체수업을 추가했습니다.'
      :'보강 등록 완료'
  );

  setAdminModal(null);

  // 주간에서 추가했으면 주간을 즉시 다시 불러오고,
  // 오늘 날짜 추가면 오늘 화면도 정상 갱신된다.
  if(view==='daily'){
   await loadToday();
  }else if(view==='weekly'){
   await loadWeek(weekBase||changeForm.date);
  }else{
   await loadWeek(weekBase||changeForm.date);
  }
 }
 async function saveChange(){
  const saved={...changeForm};
  const r=await fetch('/api/admin/schedule-change',{
   method:'POST',
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify(saved)
  });
  const j=await r.json();

  if(!r.ok){
   setToast(j.message);
   return;
  }

  if(view==='daily')await loadToday();
  else await loadWeek(weekBase);

  if(saved.status==='휴강'){
   setToast('휴강 처리 완료 · 시간표에서 숨겼습니다.');
   setAdminModal(null);

   window.setTimeout(()=>{
    const addAnother=window.confirm(
     '휴강 처리했습니다.\n\n빈 시간에 다른 수업을 넣을까요?\n취소를 누르면 그냥 공강으로 유지됩니다.'
    );

    if(addAnother){
     openReplacementFromCancelled(saved);
    }
   },120);

   return;
  }

  setToast('운영 변경 저장 완료');
  setAdminModal(null);
 }
 async function resetChange(){await fetch('/api/admin/schedule-change',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({scheduleId:changeForm.scheduleId,date:changeForm.date})});setAdminModal(null);setToast('기본 시간표로 복원했습니다.');view==='daily'?await loadToday():await loadWeek(weekBase)}
 async function saveEvent(){
  const editing=Boolean(eventForm.id);
  const r=await fetch(
    '/api/admin/event',
    {
      method:editing?'PUT':'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(eventForm)
    }
  );
  const j=await r.json();

  if(!r.ok){
    setToast(j.message||'일정 저장 실패');
    return;
  }

  setAdminModal(null);
  setToast(editing?'학원 일정 수정 완료':'학원 일정 저장 완료');

  if(view==='daily')await loadToday();
  else if(view==='weekly')await loadWeek(weekBase);
  else if(view==='monthly')await loadMonth(monthBase);
 }

 async function deleteEvent(){
  if(!eventForm.id)return;

  if(!window.confirm('이 일정을 삭제할까요?'))return;

  const r=await fetch(
    '/api/admin/event',
    {
      method:'DELETE',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({id:eventForm.id})
    }
  );
  const j=await r.json();

  if(!r.ok){
    setToast(j.message||'일정 삭제 실패');
    return;
  }

  setAdminModal(null);
  setToast('학원 일정 삭제 완료');

  if(view==='daily')await loadToday();
  else if(view==='weekly')await loadWeek(weekBase);
  else if(view==='monthly')await loadMonth(monthBase);
 }

 function openEventForDate(day:string){
  setEventForm({
    eventType:'기타',
    title:'',
    startDate:day,
    endDate:day,
    teacherId:'',
    memo:''
  });
  setAdminModal('event');
 }

 function editEvent(event:EventRow){
  setEventForm({
    id:event.id,
    eventType:event.event_type,
    title:event.title,
    startDate:event.start_date,
    endDate:event.end_date,
    teacherId:event.teacher_id,
    memo:event.memo
  });
  setAdminModal('event');
 }
 function pickMakeupSchedule(id:string){const s=meta.schedules.find((x:any)=>x.id===id);setChangeForm((f:any)=>({...f,scheduleId:id,startTime:s?.start_time?.slice(0,5),endTime:s?.end_time?.slice(0,5),subject:s?.subject,room:s?.room||'101호',teacherId:s?.teacher_id}))}
 const statusClass=(l:Lesson)=>l.operationStatus==='휴강'?'cancelled':l.operationStatus==='보강'?'makeup':l.operationStatus==='학원방학'?'vacation':'';
 if(loading)return <main className="app-shell centered"><div className="loading-card">Pamus Grit을 불러오는 중입니다.</div></main>;
 if(!user)return <main className="app-shell centered"><section className="login-card"><div className="brand-mark">P</div><div className="brand-label">PAMUS GRIT ENGLISH</div><h1>선생님 로그인</h1><p className="login-copy">4자리 로그인번호를 입력해주세요.</p><form onSubmit={login}><input className="pin-input" type="password" inputMode="numeric" maxLength={4} autoFocus value={pin} onChange={e=>{setPin(e.target.value.replace(/\D/g,'').slice(0,4));setError('')}} placeholder="••••"/>{error&&<div className="error-box">{error}</div>}<button className="login-button" disabled={loginLoading}>{loginLoading?'확인 중...':'로그인'}</button></form></section></main>;
 return <>
 <main className="app-shell"><div className="dashboard">
  <header className="topbar"><div><div className="brand-label">PAMUS GRIT ENGLISH</div><h1 className="dashboard-title">{user.role==='admin'
  ?(view==='daily'
    ?'오늘 전체 수업'
    :view==='work'
      ?tr('오늘 업무 현황','Today Tasks')
      :view==='weekly'
        ?'전체 주간 수업'
        :view==='monthly'
          ?'월간 학원 일정'
          :view==='students'
            ?'학생관리'
            :view==='classes'
              ?'반관리'
              :view==='teachers'
                ?'선생님관리'
                :'반별 주간 관리')
  :(view==='daily'
    ?`${user.displayName} 오늘 수업`
    :view==='work'
      ?`${user.displayName} 오늘 업무`
      :view==='weekly'
        ?`${user.displayName} 주간 수업`
        :`${user.displayName} 반별 기록`)}</h1><div className="date-text">{view==='daily'?fmt(date):view==='monthly'?monthTitle(monthBase||monthKeyFromDate(date)):view==='students'?`${adminStudents.length}명 등록`:view==='classes'?`${adminClasses.length}개 반`:view==='teachers'?`${adminTeachers.length}명 등록`:`${short(weekStart)} ~ ${short(weekEnd)}`}</div></div><div className="top-actions"><button className="refresh-button" onClick={()=>view==='daily'?loadToday():view==='work'?loadWork():view==='weekly'?loadWeek(weekBase):view==='monthly'?loadMonth(monthBase):view==='students'?loadStudents():view==='classes'?loadClasses():view==='teachers'?loadTeachers():loadClassWeek(weekBase)}>↻ 새로고침</button>{user.role==='teacher'&&
 <div className="teacher-lang-toggle" role="group" aria-label="Language">
  <button
   type="button"
   className={uiLang==='ko'?'active':''}
   onClick={()=>changeUiLang('ko')}
  >
   한국어
  </button>
  <button
   type="button"
   className={uiLang==='en'?'active':''}
   onClick={()=>changeUiLang('en')}
  >
   English
  </button>
 </div>}
<button className="logout-button" onClick={logout}>로그아웃</button></div></header>
  <div className="view-tabs"><button className={`view-tab ${view==='daily'?'active':''}`} onClick={()=>switchView('daily')}>{tr('오늘','Today')}</button><button className={`view-tab ${view==='work'?'active':''}`} onClick={()=>switchView('work')}>{tr('업무','Tasks')}</button><button className={`view-tab ${view==='weekly'?'active':''}`} onClick={()=>switchView('weekly')}>{tr('주간','Weekly')}</button>{user.role==='admin'&&<button className={`view-tab ${view==='monthly'?'active':''}`} onClick={()=>switchView('monthly')}>월간</button>}{user.role==='admin'&&<button className={`view-tab ${view==='students'?'active':''}`} onClick={()=>switchView('students')}>학생관리</button>}{user.role==='admin'&&<button className={`view-tab ${view==='classes'?'active':''}`} onClick={()=>switchView('classes')}>반관리</button>}{user.role==='admin'&&<button className={`view-tab ${view==='teachers'?'active':''}`} onClick={()=>switchView('teachers')}>선생님관리</button>}<button className={`view-tab ${view==='classWeekly'?'active':''}`} onClick={()=>switchView('classWeekly')}>{tr('반별','Classes')}</button></div>
  {view!=='students'&&view!=='classes'&&view!=='teachers'&&<div className="admin-tools"><button onClick={openMakeup}>{tr('+ 보강 추가','+ Add Make-up')}</button>{user.role==='admin'&&<button onClick={()=>openEventForDate(view==='monthly'&&monthBase?`${monthBase}-01`:date)}>+ 학원 일정</button>}</div>}
  {view==='daily'&&events.length>0&&<div className="event-strip">{events.map(e=><div key={e.id} className={`event-chip type-${e.event_type}`}><strong>{e.event_type}</strong><span>{e.title}</span>{e.teachers?.teacher_name&&<small>{e.teachers.teacher_name}</small>}</div>)}</div>}
  {view!=='monthly'&&view!=='students'&&view!=='classes'&&view!=='teachers'&&<section className="summary-strip"><div><span>{view==='daily'?tr('오늘 수업','Today Classes'):view==='work'?tr('오늘 업무','Today Tasks'):view==='weekly'?tr('이번 주 수업','This Week Classes'):tr('선택 반','Selected Class')}</span><strong>{view==='daily'?lessons.length:view==='work'?(workData?.summary?.totalLessons||0):view==='weekly'?weekDays.reduce((a,d)=>a+d.lessons.length,0):(classWeekData?.classInfo?.class_name||'-')}</strong></div><div><span>{view==='classWeekly'?'작성 기록':view==='work'?tr('미완료 수업','Incomplete'):tr('업무 미완료','Incomplete Tasks')}</span><strong className="pending-number">{view==='daily'?pending:view==='work'?(workData?.summary?.pendingLessons||0):view==='weekly'?weekDays.reduce((a,d)=>a+d.lessons.filter(l=>!l.progressDone||!l.homeworkDone||!l.attendanceDone).length,0):(classWeekData?.records?.length||0)}</strong></div><div><span>{tr('계정','Account')}</span><strong>{user.role==='admin'?'관리자':teacherDisplayName(user.displayName)}</strong></div></section>}
  {view==='daily'?(user.role==='admin'?<section className="schedule-panel"><div className="section-head"><div><div className="section-kicker">ADMIN DAILY</div><h2>강의실별 오늘 시간표</h2></div></div><div className="room-board">{groups.map(g=><section className="room-column" key={g.room}><div className="room-head"><strong>{g.room}</strong><span>{g.lessons.length}개</span></div><div className="room-lessons">{g.lessons.length?g.lessons.map(l=><button key={l.schedule_code} className={`lesson-card ${statusClass(l)}`} onClick={()=>openAdminLesson(l)} onContextMenu={e=>{if(!l.isCustomMakeup){e.preventDefault();openChange(l)}}}><div className="lesson-time"><strong>{l.start_time?.slice(0,5)}</strong><span>~ {l.end_time?.slice(0,5)}</span></div><div className="lesson-name">{classDisplayName(l.classes?.class_name)}</div><div className="lesson-subject">{l.subject}</div><div className="teacher-chip">{teacherDisplayName(l.teachers?.teacher_name)}</div><div className="op-badge">{statusDisplayName(l.operationStatus)}</div></button>):<div className="room-empty">{tr('수업 없음','No Class')}</div>}</div></section>)}</div><div className="admin-hint">관리자: PC 클릭 = 수업 작성 · 우클릭 = 당일 변경/휴강 · 모바일 탭 = 당일 변경/휴강</div></section>
  :<section className="schedule-panel"><div className="section-head"><div><div className="section-kicker">MY DAILY</div><h2>{tr('오늘 내 수업','My Classes Today')}</h2></div></div><div className="teacher-daily-list">{lessons.length?lessons.map(l=><button key={l.schedule_code} className={`teacher-daily-card ${statusClass(l)}`} onClick={()=>openLesson(l)}><div className="teacher-daily-time"><strong>{l.start_time?.slice(0,5)}</strong><span>~ {l.end_time?.slice(0,5)}</span></div><div className="teacher-daily-main"><strong>{classDisplayName(l.classes?.class_name)}</strong><span>{l.subject} · {room(l.room)}</span></div><div className="op-badge">{statusDisplayName(l.operationStatus)}</div></button>):<div className="empty-state">{tr('오늘 예정된 수업이 없습니다.','No classes scheduled today.')}</div>}</div></section>)
  :view==='work'?<section className="schedule-panel work-panel">
   <div className="section-head">
     <div>
       <div className="section-kicker">TODAY WORK</div>
       <h2>{user.role==='admin'?'선생님별 오늘 업무 현황':'오늘 작성해야 할 수업'}</h2>
     </div>
     {!workBusy&&workData&&<span className="board-help">미완료 수업을 누르면 바로 작성</span>}
   </div>

   {workBusy&&<div className="weekly-state-box">{tr('오늘 업무 현황을 불러오는 중입니다.','Loading today tasks...')}</div>}

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
         <span>{tr('미완료','Incomplete')}</span>
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
                   ? <b className="all-done">{tr('완료','Complete')}</b>
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
                   <strong>{classDisplayName(item.classes?.class_name)||tr('반 미지정','Unassigned Class')}</strong>
                   <span>{item.subject} · {room(item.room)}</span>
                 </div>

                 <div className="work-pending-tags">
                   {!item.progressDone&&<span>{tr('진도','Progress')}</span>}
                   {!item.homeworkDone&&<span>{tr('숙제','Homework')}</span>}
                   {!item.attendanceDone&&<span>{tr('출결','Attendance')}</span>}
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
                   <strong>{classDisplayName(item.classes?.class_name)||tr('반 미지정','Unassigned Class')}</strong>
                   <span>{item.subject} · {room(item.room)}</span>
                 </div>

                 <div className="work-pending-tags">
                   {!item.progressDone&&<span>{tr('진도','Progress')}</span>}
                   {!item.homeworkDone&&<span>{tr('숙제','Homework')}</span>}
                   {!item.attendanceDone&&<span>{tr('출결','Attendance')}</span>}
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
       <button onClick={()=>loadWeek(date)}>{tr('이번주','This Week')}</button>
       <button onClick={()=>loadWeek(add(weekStart||weekBase,7))}>다음주 ›</button>
     <button className="add-day-class-button" onClick={()=>openAddLesson(weekStart||date)}>+ {tr('수업 추가','Add Class')}</button></div>
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
                 onClick={()=>openAdminLesson(l)}
                 onContextMenu={e=>{if(!l.isCustomMakeup){e.preventDefault();openChange(l)}}}
               >
                 <div className="week-card-top">
                   <strong>{l.start_time?.slice(0,5)}</strong>
                   <span>{room(l.room)}</span>
                 </div>
                 <div className="lesson-name">{classDisplayName(l.classes?.class_name)}</div>
                 <div className="lesson-subject">{l.subject}</div>
                 {!adminWeekTeacher&&<div className="teacher-chip">{teacherDisplayName(l.teachers?.teacher_name)}</div>}
                 {l.operationStatus!=='정상'&&<div className="op-badge">{statusDisplayName(l.operationStatus)}</div>}
               </button>):<div className="week-empty">{tr('수업 없음','No Class')}</div>}
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
                       <strong>{classDisplayName(l.classes?.class_name)}</strong>
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
  </section>:view==='monthly'?<section className="schedule-panel monthly-panel">
   <div className="monthly-toolbar">
     <div>
       <div className="section-kicker">ACADEMY CALENDAR</div>
       <h2>{monthTitle(monthBase||monthKeyFromDate(date))}</h2>
       <div className="admin-week-caption">날짜 클릭 = 일정 추가 · 일정 클릭 = 수정/삭제</div>
     </div>

     <div className="week-nav">
       <button onClick={()=>loadMonth(addMonths(monthBase||monthKeyFromDate(date),-1))}>‹ 이전달</button>
       <button onClick={()=>loadMonth(monthKeyFromDate(date))}>이번달</button>
       <button onClick={()=>loadMonth(addMonths(monthBase||monthKeyFromDate(date),1))}>다음달 ›</button>
     </div>
   </div>

   <div className="month-legend">
     <span className="legend-vacation">학원방학</span>
     <span className="legend-exam">시험집중</span>
     <span className="legend-dayoff">Day-off</span>
     <span className="legend-etc">기타</span>
   </div>

   {monthBusy&&<div className="weekly-state-box">월간 일정을 불러오는 중입니다.</div>}

   {!monthBusy&&<div className="month-calendar">
     {['일','월','화','수','목','금','토'].map(day=><div className="month-weekday" key={day}>{day}</div>)}

     {calendarCells(monthBase||monthKeyFromDate(date)).map(day=>{
       const inMonth=day.slice(0,7)===(monthBase||monthKeyFromDate(date));
       const dayEvents=monthEvents.filter(event=>event.start_date<=day&&event.end_date>=day);
       const dayNumber=Number(day.slice(-2));
       const isToday=day===date;

       return <div
         key={day}
         className={`month-day ${inMonth?'':'outside'} ${isToday?'today':''}`}
         onClick={()=>openEventForDate(day)}
       >
         <div className="month-day-number">
           <span>{dayNumber}</span>
           {isToday&&<small>{tr('오늘','Today')}</small>}
         </div>

         <div className="month-event-list">
           {dayEvents.map(event=><button
             type="button"
             key={`${day}_${event.id}`}
             className={`month-event type-${event.event_type}`}
             onClick={e=>{
               e.stopPropagation();
               editEvent(event);
             }}
           >
             <strong>{event.title}</strong>
             {event.teachers?.teacher_name&&<span>{event.teachers.teacher_name}</span>}
           </button>)}
         </div>

         <button
           type="button"
           className="month-add"
           onClick={e=>{
             e.stopPropagation();
             openEventForDate(day);
           }}
         >
           + 일정
         </button>
       </div>;
     })}
   </div>}
  </section>:view==='students'?<section className="schedule-panel student-management-panel">
   <div className="student-management-head">
     <div>
       <div className="section-kicker">STUDENT MANAGEMENT</div>
       <h2>학생관리</h2>
       <div className="admin-week-caption">재원생 검색 · 정보 수정 · 반 변경</div>
     </div>

     <button type="button" className="student-add-button" onClick={openNewStudent}>+ 학생 추가</button>
   </div>

   <div className="student-search-row">
     <input
       value={studentSearch}
       onChange={e=>setStudentSearch(e.target.value)}
       placeholder="학생 이름 · 학교 · 학년 · 반 검색"
     />
     <span>{filteredAdminStudents.length}명</span>
   </div>

   {studentsBusy&&<div className="weekly-state-box">학생 목록을 불러오는 중입니다.</div>}

   {!studentsBusy&&<div className="student-admin-table-wrap">
     <div className="student-admin-table-head">
       <span>이름</span>
       <span>학교</span>
       <span>학년</span>
       <span>소속반</span>
       <span>등록연도</span>
     </div>

     {filteredAdminStudents.length===0
       ?<div className="student-admin-empty">검색 결과가 없습니다.</div>
       :filteredAdminStudents.map(student=><button
          type="button"
          className="student-admin-row"
          key={student.id}
          onClick={()=>openStudentEdit(student)}
        >
          <strong>{student.student_name}</strong>
          <span>{student.school||'-'}</span>
          <span>{student.registered_grade||'-'}</span>
          <span className="student-class-chip">{student.classes?.class_name||'미배정'}</span>
          <span>{student.registered_school_year||'-'}</span>
        </button>)}
   </div>}
  </section>:view==='classes'?<section className="schedule-panel class-management-panel">
   <div className="class-management-head">
     <div>
       <div className="section-kicker">CLASS MANAGEMENT</div>
       <h2>반관리</h2>
       <div className="admin-week-caption">반 정보 · 주담당 선생님 · 학생 배정</div>
     </div>

     <button type="button" className="student-add-button" onClick={openNewClass}>+ 반 추가</button>
   </div>

   <div className="student-search-row">
     <input
       value={classSearch}
       onChange={e=>setClassSearch(e.target.value)}
       placeholder="반 이름 · 반 코드 · 주담당 선생님 검색"
     />
     <span>{filteredAdminClasses.length}개</span>
   </div>

   {classesBusy&&<div className="weekly-state-box">반 목록을 불러오는 중입니다.</div>}

   {!classesBusy&&<div className="class-admin-grid">
     {filteredAdminClasses.length===0
       ?<div className="student-admin-empty">검색 결과가 없습니다.</div>
       :filteredAdminClasses.map(item=><button
          type="button"
          className="class-admin-card"
          key={item.id}
          onClick={()=>openClassEdit(item)}
        >
          <div className="class-admin-card-top">
            <strong>{item.class_name}</strong>
            <span>{item.student_count}명</span>
          </div>

          <div className="class-admin-code">{item.class_code}</div>

          <div className="class-admin-teacher">
            <span>주담당</span>
            <strong>{item.teachers?.teacher_name||'미지정'}</strong>
          </div>
        </button>)}
   </div>}
  </section>:view==='teachers'?<section className="schedule-panel teacher-management-panel">
   <div className="class-management-head">
     <div>
       <div className="section-kicker">TEACHER MANAGEMENT</div>
       <h2>선생님관리</h2>
       <div className="admin-week-caption">선생님 정보 · 로그인 PIN · 활성 상태</div>
     </div>

     <button type="button" className="student-add-button" onClick={openNewTeacher}>+ 선생님 추가</button>
   </div>

   <div className="student-search-row">
     <input
       value={teacherSearch}
       onChange={e=>setTeacherSearch(e.target.value)}
       placeholder="선생님 이름 · 코드 검색"
     />
     <span>{filteredAdminTeachers.length}명</span>
   </div>

   {teachersBusy&&<div className="weekly-state-box">선생님 목록을 불러오는 중입니다.</div>}

   {!teachersBusy&&<div className="teacher-admin-grid">
     {filteredAdminTeachers.length===0
       ?<div className="student-admin-empty">검색 결과가 없습니다.</div>
       :filteredAdminTeachers.map(teacher=><button
          type="button"
          className={`teacher-admin-card ${teacher.is_active?'':'inactive'}`}
          key={teacher.id}
          onClick={()=>openTeacherEdit(teacher)}
        >
          <div className="teacher-admin-card-top">
            <div>
              <strong>{teacher.teacher_name}</strong>
              <span>{teacher.teacher_code}</span>
            </div>

            <em className={teacher.is_active?'active':'inactive'}>
              {teacher.is_active?'활성':'비활성'}
            </em>
          </div>

          <div className="teacher-admin-stats">
            <div>
              <span>주간 수업</span>
              <strong>{teacher.schedule_count}</strong>
            </div>
            <div>
              <span>주담당 반</span>
              <strong>{teacher.primary_class_count}</strong>
            </div>
            <div>
              <span>로그인</span>
              <strong>{teacher.has_login?(teacher.login_active?'ON':'OFF'):'미생성'}</strong>
            </div>
          </div>
        </button>)}
   </div>}
  </section>:<section className="schedule-panel class-week-panel printable-schedule">
   <div className="weekly-toolbar">
     <div>
       <div className="section-kicker">CLASS WEEKLY</div>
       <h2>{tr('반별 주간 · 진도/숙제 요약','Class Weekly · Progress/Homework')}</h2>
       <div className="admin-week-caption">{user.role==='admin'?'반 하나를 선택해서 월~금 수업과 작성 내용을 한 번에 확인합니다.':tr('내가 담당하는 반의 월~금 수업과 선생님들의 작성 내용을 함께 확인합니다.','View Mon–Fri classes and lesson records for the classes you teach.')}</div>
     </div>

     <div className="week-nav">
       <button onClick={()=>loadClassWeek(add(weekStart||weekBase,-7))}>‹ 지난주</button>
       <button onClick={()=>loadClassWeek(date)}>{tr('이번주','This Week')}</button>
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
       {accessibleClasses.map(c=><option key={c.id} value={c.id}>{classDisplayName(c.class_name)}</option>)}
     </select>

     <div className="summary-copy-buttons no-print">
       <button onClick={()=>copySummary('progress')}>{tr('진도 복사','Copy Progress')}</button>
       <button onClick={()=>copySummary('homework')}>{tr('숙제 복사','Copy Homework')}</button>
       <button onClick={()=>copySummary('all')}>{tr('전체 복사','Copy All')}</button>
       <button className="band-helper-button" onClick={openBandHelper}>{tr('BAND 일정','BAND Schedule')}</button>
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

   {classWeekBusy&&<div className="weekly-state-box">{tr('반별 주간 정보를 불러오는 중입니다.','Loading class weekly information...')}</div>}

   {!classWeekBusy&&!classWeekData&&<div className="weekly-state-box">반을 선택해주세요.</div>}

   {!classWeekBusy&&classWeekData&&<>
     <div className="class-week-title">
       <strong>{classDisplayName(classWeekData.classInfo?.class_name)}</strong>
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
                   <strong className="desktop-time">{l.start_time?.slice(0,5)} - {l.end_time?.slice(0,5)}</strong>
<strong className="mobile-time">{l.start_time?.slice(0,5)}</strong>
                   <span>{room(l.room)}</span>
                 </div>

                 <div className="lesson-name class-week-subject">{l.subject}</div>
                 <div className="teacher-chip class-week-teacher">{teacherDisplayName(l.teachers?.teacher_name)||tr('미지정','Unassigned')}</div>

                 {l.operationStatus!=='정상'&&<div className="op-badge">{statusDisplayName(l.operationStatus)}</div>}
               </div>)
             : <div className="week-empty">{tr('수업 없음','No Class')}</div>}
         </div>
       </section>)}
     </div>

     <section className="class-summary-section">
       <div className="section-kicker">LESSON SUMMARY</div>
       <h3>{tr('진도 · 숙제 통합 요약','Progress · Homework Summary')}</h3>

       {(classWeekData.records||[]).length===0
         ? <div className="weekly-state-box">이 주에 작성된 진도/숙제가 없습니다.</div>
         : <div className="class-summary-list">
             {([...new Set((classWeekData.records||[]).map((r:any)=>r.lesson_date))] as string[]).map((lessonDate)=><div className="summary-date-group" key={lessonDate}>
               <div className="summary-date-head">{fmt(lessonDate)}</div>

               {(classWeekData.records||[])
                 .filter((r:any)=>r.lesson_date===lessonDate)
                 .map((r:any,index:number)=><article className="summary-record-card" key={`${r.schedule_id}_${index}`}>
                   <div className="summary-record-head">
                     <strong>{teacherDisplayName(r.teacher_name)}</strong>
                     <span>{r.subject||'수업'}</span>
                   </div>

                   <div className="summary-content-row">
                     <b>{tr('진도','Progress')}</b>
                     <p>{r.progress||'작성 없음'}</p>
                   </div>

                   <div className="summary-content-row">
                     <b>{tr('숙제','Homework')}</b>
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
 {bandModal&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setBandModal(false)}}>
 <section className="lesson-modal band-helper-modal">
   <header className="modal-head">
     <div>
       <div className="modal-kicker">BAND HOMEWORK</div>
       <h2>BAND 일정 등록 도우미</h2>
       <div className="modal-sub">진도와 숙제를 복사한 뒤 모밴드 일정에 붙여넣으면 됩니다.</div>
     </div>
     <button className="modal-close" onClick={()=>setBandModal(false)}>×</button>
   </header>

   <div className="modal-body">
     <div className="band-helper-grid">
       <label className="admin-field">
         <span>숙제 날짜</span>
         <select
           value={bandForm.date}
           onChange={e=>changeBandDate(e.target.value)}
         >
           {(classWeekData?.days||[]).map((d:any)=><option key={d.date} value={d.date}>
             {fmt(d.date)}
           </option>)}
         </select>
       </label>

       <label className="admin-field band-title-field">
         <span>일정 제목</span>
         <input
           value={bandForm.title}
           onChange={e=>setBandForm(f=>({...f,title:e.target.value}))}
           placeholder="컬럼비아A[May,Han]숙제"
         />
       </label>

       <label className="admin-field band-content-field">
         <span>진도 · 숙제 내용</span>
         <textarea
           value={bandForm.content}
           onChange={e=>setBandForm(f=>({...f,content:e.target.value}))}
           placeholder="그날 작성된 진도와 숙제가 자동으로 들어옵니다."
         />
       </label>
     </div>

     <div className="band-preview">
       <span>미리보기</span>
       <strong>{bandForm.title||'일정 제목'}</strong>
       <p>{bandForm.content||'이 날짜에 작성된 진도/숙제가 없습니다. 직접 입력할 수 있습니다.'}</p>
     </div>

     <div className="band-helper-note">
       BAND 공개 기능상 외부 앱에서 ‘일정’을 바로 생성할 수는 없어서,
       여기서 복사한 뒤 모밴드 일정 페이지에서 일정 추가 후 붙여넣는 방식입니다.
     </div>

     <div className="modal-actions band-helper-actions">
       <button className="cancel-button" onClick={()=>setBandModal(false)}>{tr('닫기','Close')}</button>

       <div className="band-helper-right">
         <button className="copy-band-button" onClick={copyBandSchedule}>제목 + 진도/숙제 복사</button>
         <button className="open-band-button" onClick={openBandApp}>BAND 열기</button>
       </div>
     </div>
   </div>
 </section>
</div>}

{teacherModal&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setTeacherModal(false)}}>
 <section className="lesson-modal teacher-edit-modal">
   <header className="modal-head">
     <div>
       <div className="modal-kicker">TEACHER</div>
       <h2>{teacherForm.id?'선생님 정보 수정':'선생님 추가'}</h2>
       <div className="modal-sub">{teacherForm.id?teacherForm.teacherName:'새 선생님과 로그인 PIN을 등록합니다.'}</div>
     </div>
     <button className="modal-close" onClick={()=>setTeacherModal(false)}>×</button>
   </header>

   <div className="modal-body">
     <div className="student-edit-grid">
       <label className="admin-field">
         <span>선생님 이름 *</span>
         <input
           value={teacherForm.teacherName||''}
           onChange={e=>setTeacherForm((f:any)=>({...f,teacherName:e.target.value}))}
           placeholder="예: 리나T"
         />
       </label>

       <label className="admin-field">
         <span>선생님 코드</span>
         <input
           value={teacherForm.teacherCode||''}
           disabled={Boolean(teacherForm.id)}
           onChange={e=>setTeacherForm((f:any)=>({...f,teacherCode:e.target.value}))}
           placeholder="미입력 시 T012처럼 자동 생성"
         />
       </label>

       {teacherForm.id&&<label className="admin-field teacher-active-field">
         <span>활성 상태</span>
         <select
           value={teacherForm.isActive?'active':'inactive'}
           onChange={e=>setTeacherForm((f:any)=>({...f,isActive:e.target.value==='active'}))}
         >
           <option value="active">활성</option>
           <option value="inactive">비활성</option>
         </select>
       </label>}

       <label className="admin-field teacher-pin-field">
         <span>{teacherForm.id?'새 로그인 PIN':'로그인 PIN *'}</span>
         <input
           type="password"
           inputMode="numeric"
           maxLength={8}
           value={teacherPin}
           onChange={e=>setTeacherPin(e.target.value.replace(/\D/g,''))}
           placeholder={teacherForm.id?'변경할 때만 입력':'숫자 4~8자리'}
         />
       </label>
     </div>

     {teacherForm.id&&<div className="teacher-pin-action">
       <div>
         <strong>PIN 재설정</strong>
         <span>위에 새 PIN을 입력한 뒤 재설정을 누르세요.</span>
       </div>
       <button type="button" onClick={resetTeacherPin}>PIN 재설정</button>
     </div>}

     <div className="modal-actions student-edit-actions">
       {teacherForm.id&&<button className="reset-button" onClick={deleteTeacher}>선생님 삭제</button>}

       <div className="student-edit-right">
         <button className="cancel-button" onClick={()=>setTeacherModal(false)}>{tr('닫기','Close')}</button>
         <button className="save-button" onClick={saveTeacher}>{teacherForm.id?'정보 저장':'선생님 등록'}</button>
       </div>
     </div>
   </div>
 </section>
</div>}

{classModal&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setClassModal(false)}}>
 <section className="lesson-modal class-edit-modal">
   <header className="modal-head">
     <div>
       <div className="modal-kicker">CLASS</div>
       <h2>{classForm.id?'반 정보 수정':'반 추가'}</h2>
       <div className="modal-sub">{classForm.id?classForm.className:'새 반을 등록합니다.'}</div>
     </div>
     <button className="modal-close" onClick={()=>setClassModal(false)}>×</button>
   </header>

   <div className="modal-body">
     <div className="student-edit-grid">
       <label className="admin-field">
         <span>반 이름 *</span>
         <input
           value={classForm.className||''}
           onChange={e=>setClassForm((f:any)=>({...f,className:e.target.value}))}
         />
       </label>

       <label className="admin-field">
         <span>반 코드</span>
         <input
           value={classForm.classCode||''}
           disabled={Boolean(classForm.id)}
           placeholder="미입력 시 자동 생성"
           onChange={e=>setClassForm((f:any)=>({...f,classCode:e.target.value}))}
         />
       </label>

       <label className="admin-field class-primary-teacher-field">
         <span>주담당 선생님</span>
         <select
           value={classForm.primaryTeacherId||''}
           onChange={e=>setClassForm((f:any)=>({...f,primaryTeacherId:e.target.value}))}
         >
           <option value="">미지정</option>
           {meta.teachers.map(t=><option key={t.id} value={t.id}>{teacherDisplayName(t.teacher_name)}</option>)}
         </select>
       </label>
     </div>

     {classForm.id&&<section className="class-base-schedule-management">
       <div className="class-schedule-head">
         <div>
           <h3>기본 시간표 <small>기간별 적용</small></h3>
           <p>개학처럼 시간표가 바뀔 때 적용 시작일을 정해서 새 시간표를 저장하세요. 이전 기간은 그대로 남습니다.</p>
         </div>
       </div>

       <div className="class-schedule-date-row">
         <label>
           <span>적용 시작일</span>
           <input
             type="date"
             min={date}
             value={classScheduleDate}
             onChange={e=>{
               const next=e.target.value;
               setClassScheduleDate(next);
               loadClassBaseSchedule(classForm.id,next);
             }}
           />
         </label>

         <button type="button" onClick={addClassScheduleRow}>+ 수업 추가</button>
       </div>

       {classScheduleBusy
         ?<div className="class-schedule-empty">시간표를 불러오는 중입니다.</div>
         :<div className="class-schedule-list">
           {classScheduleRows.length===0
             ?<div className="class-schedule-empty">
                이 날짜에 적용되는 기본 수업이 없습니다. 수업 추가를 눌러 새 시간표를 만들어주세요.
              </div>
             :classScheduleRows
               .map((row:any,index:number)=>({row,index}))
               .map(({row,index}:any)=><div
                 className="class-schedule-row"
                 key={row._client_id||`row_${index}`}
               >
                 <select
                   aria-label="요일"
                   value={row.day_of_week}
                   onChange={e=>updateClassScheduleRow(index,'day_of_week',Number(e.target.value))}
                 >
                   <option value={1}>월</option>
                   <option value={2}>화</option>
                   <option value={3}>수</option>
                   <option value={4}>목</option>
                   <option value={5}>금</option>
                 </select>

                 <input
                   type="time"
                   aria-label="시작 시간"
                   value={row.start_time}
                   onChange={e=>updateClassScheduleRow(index,'start_time',e.target.value)}
                 />

                 <span className="class-schedule-wave">~</span>

                 <input
                   type="time"
                   aria-label="종료 시간"
                   value={row.end_time}
                   onChange={e=>updateClassScheduleRow(index,'end_time',e.target.value)}
                 />

                 <input
                   className="class-schedule-subject"
                   placeholder="과목"
                   value={row.subject}
                   onChange={e=>updateClassScheduleRow(index,'subject',e.target.value)}
                 />

                 <input
                   className="class-schedule-room"
                   placeholder="강의실"
                   value={row.room}
                   onChange={e=>updateClassScheduleRow(index,'room',e.target.value)}
                 />

                 <select
                   className="class-schedule-teacher"
                   value={row.teacher_id}
                   onChange={e=>updateClassScheduleRow(index,'teacher_id',e.target.value)}
                 >
                   <option value="">선생님 미지정</option>
                   {meta.teachers.map(t=><option key={t.id} value={t.id}>{teacherDisplayName(t.teacher_name)}</option>)}
                 </select>

                 <button
                   type="button"
                   className="class-schedule-remove"
                   onClick={()=>removeClassScheduleRow(index)}
                 >
                   삭제
                 </button>
               </div>)}
         </div>}

       <div className="class-schedule-save-row">
         <span>
           저장하면 <strong>{classScheduleDate}</strong> 이전 시간표는 유지되고,
           해당 날짜부터 새 시간표가 적용됩니다.
         </span>
         <button
           type="button"
           disabled={classScheduleSaving}
           onClick={saveClassBaseSchedule}
         >
           {classScheduleSaving?'저장 중...':'이 날짜부터 시간표 적용'}
         </button>
       </div>
     </section>}

     {classForm.id&&<section className="class-student-management">
       <div className="class-student-head">
         <div>
           <h3>반 학생 <small>{selectedClassStudents.length}명</small></h3>
           <p>학생을 추가하거나 이 반에서 제외할 수 있습니다.</p>
         </div>
       </div>

       <input
         className="class-student-search"
         value={classStudentSearch}
         onChange={e=>setClassStudentSearch(e.target.value)}
         placeholder="학생 이름 · 학교 · 학년 검색"
       />

       <div className="class-student-columns">
         <div className="class-student-column">
           <div className="class-student-column-title">현재 학생</div>

           <div className="class-student-list">
             {selectedClassStudents.length
               ?selectedClassStudents.map(student=><div className="class-student-item" key={student.id}>
                  <div>
                    <strong>{student.student_name}</strong>
                    <span>{[student.school,student.registered_grade].filter(Boolean).join(' · ')||'-'}</span>
                  </div>
                  <button type="button" onClick={()=>setStudentClass(student.id,'')}>제외</button>
                </div>)
               :<div className="class-student-empty">배정된 학생이 없습니다.</div>}
           </div>
         </div>

         <div className="class-student-column">
           <div className="class-student-column-title">학생 추가</div>

           <div className="class-student-list">
             {unassignedOrOtherStudents.length
               ?unassignedOrOtherStudents.map(student=><div className="class-student-item" key={student.id}>
                  <div>
                    <strong>{student.student_name}</strong>
                    <span>{[student.school,student.registered_grade].filter(Boolean).join(' · ')||'-'}</span>
                  </div>
                  <button type="button" onClick={()=>setStudentClass(student.id,classForm.id)}>추가</button>
                </div>)
               :<div className="class-student-empty">추가할 학생이 없습니다.</div>}
           </div>
         </div>
       </div>
     </section>}

     <div className="modal-actions student-edit-actions">
       {classForm.id&&<button className="reset-button" onClick={deleteClass}>반 삭제</button>}

       <div className="student-edit-right">
         <button className="cancel-button" onClick={()=>setClassModal(false)}>{tr('닫기','Close')}</button>
         <button className="save-button" onClick={saveClass}>{classForm.id?'수정 저장':'반 등록'}</button>
       </div>
     </div>
   </div>
 </section>
</div>}

{studentModal&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget){setStudentModal(false);setStudentDetail(null)}}}>
 <section className="lesson-modal student-edit-modal">
   <header className="modal-head">
     <div>
       <div className="modal-kicker">STUDENT</div>
       <h2>{studentForm.id?'학생 정보 수정':'학생 추가'}</h2>
       <div className="modal-sub">{studentForm.id?studentForm.studentName:'새 학생을 등록합니다.'}</div>
     </div>
     <button className="modal-close" onClick={()=>{setStudentModal(false);setStudentDetail(null)}}>×</button>
   </header>

   <div className="modal-body">
     <div className="student-edit-grid">
       <label className="admin-field">
         <span>학생 이름 *</span>
         <input
           value={studentForm.studentName}
           onChange={e=>setStudentForm((f:any)=>({...f,studentName:e.target.value}))}
         />
       </label>

       <label className="admin-field">
         <span>학교</span>
         <input
           value={studentForm.school}
           onChange={e=>setStudentForm((f:any)=>({...f,school:e.target.value}))}
         />
       </label>

       <label className="admin-field">
         <span>학년</span>
         <input
           value={studentForm.registeredGrade}
           onChange={e=>setStudentForm((f:any)=>({...f,registeredGrade:e.target.value}))}
           placeholder="예: 초3 / 중2"
         />
       </label>

       <label className="admin-field">
         <span>등록연도</span>
         <input
           type="number"
           value={studentForm.registeredSchoolYear||new Date().getFullYear()}
           onChange={e=>setStudentForm((f:any)=>({...f,registeredSchoolYear:e.target.value}))}
         />
       </label>

       <label className="admin-field">
         <span>생년월일</span>
         <input
           type="date"
           value={studentForm.birthDate}
           onChange={e=>setStudentForm((f:any)=>({...f,birthDate:e.target.value}))}
         />
       </label>

       <label className="admin-field">
         <span>소속반</span>
         <select
           value={studentForm.classId}
           onChange={e=>setStudentForm((f:any)=>({...f,classId:e.target.value}))}
         >
           <option value="">미배정</option>
           {meta.classes.map(c=><option key={c.id} value={c.id}>{classDisplayName(c.class_name)}</option>)}
         </select>
       </label>
     </div>

     {studentForm.id&&<section className="student-detail-section">
       {studentDetailBusy&&<div className="student-detail-loading">학생 이력을 불러오는 중입니다.</div>}

       {!studentDetailBusy&&studentDetail&&<>
         <div className="student-profile-strip">
           <div>
             <span>현재 반</span>
             <strong>{studentDetail.student?.class_name||'미배정'}</strong>
           </div>
           <div>
             <span>주담당</span>
             <strong>{studentDetail.student?.primary_teacher_name||'미지정'}</strong>
           </div>
           <div>
             <span>학교 · 학년</span>
             <strong>{[studentDetail.student?.school,studentDetail.student?.registered_grade].filter(Boolean).join(' · ')||'-'}</strong>
           </div>
         </div>

         <div className="student-history-stats">
           <div><span>출석</span><strong>{studentDetail.counts?.present||0}</strong></div>
           <div><span>지각</span><strong>{studentDetail.counts?.late||0}</strong></div>
           <div><span>결석</span><strong>{studentDetail.counts?.absent||0}</strong></div>
           <div><span>보강</span><strong>{studentDetail.counts?.makeup||0}</strong></div>
         </div>

         <div className="student-detail-columns">
           <section className="student-history-card">
             <div className="student-history-title">
               <h3>최근 출결</h3>
               <span>최근 30건</span>
             </div>

             <div className="student-history-list">
               {studentDetail.attendance?.length
                 ?studentDetail.attendance.map((row:any,index:number)=><div className="student-history-row" key={`${row.schedule_id}_${row.lesson_date}_${index}`}>
                    <div className="student-history-date">{short(row.lesson_date)}</div>
                    <div className="student-history-main">
                      <strong>{row.class_name||studentDetail.student?.class_name||'수업'}</strong>
                      <span>{[row.subject,row.teacher_name].filter(Boolean).join(' · ')||'-'}</span>
                      {(row.attendance_memo||row.individual_memo)&&<small>{row.attendance_memo||row.individual_memo}</small>}
                    </div>
                    <em className={`history-status status-${row.attendance_status}`}>{row.attendance_status}</em>
                  </div>)
                 :<div className="student-detail-empty">아직 저장된 출결 기록이 없습니다.</div>}
             </div>
           </section>

           <section className="student-history-card">
             <div className="student-history-title">
               <h3>보강 이력</h3>
               <span>{studentDetail.makeups?.length||0}건</span>
             </div>

             <div className="student-history-list">
               {studentDetail.makeups?.length
                 ?studentDetail.makeups.map((row:any)=><div className="student-history-row" key={row.id}>
                    <div className="student-history-date">{short(row.date)}</div>
                    <div className="student-history-main">
                      <strong>{row.title}</strong>
                      <span>{[row.subject,row.teacher_name,row.room].filter(Boolean).join(' · ')||'-'}</span>
                      {row.memo&&<small>{row.memo}</small>}
                    </div>
                  </div>)
                 :<div className="student-detail-empty">등록된 보강 이력이 없습니다.</div>}
             </div>
           </section>
         </div>

         <section className="student-history-card student-progress-history">
           <div className="student-history-title">
             <h3>현재 반 최근 진도 · 숙제</h3>
             <span>최근 {studentDetail.lessonRecords?.length||0}건</span>
           </div>

           <div className="student-progress-list">
             {studentDetail.lessonRecords?.length
               ?studentDetail.lessonRecords.map((row:any,index:number)=><article className="student-progress-row" key={`${row.lesson_date}_${index}`}>
                  <div className="student-progress-head">
                    <strong>{short(row.lesson_date)}</strong>
                    <span>{row.teacher_name||'-'}</span>
                  </div>
                  <div className="student-progress-body">
                    <div><span>{tr('진도','Progress')}</span><strong>{row.progress||'-'}</strong></div>
                    <div><span>{tr('숙제','Homework')}</span><strong>{row.homework||'-'}</strong></div>
                    {row.lesson_memo&&<div className="student-progress-memo"><span>메모</span><strong>{row.lesson_memo}</strong></div>}
                  </div>
                </article>)
               :<div className="student-detail-empty">현재 반에 저장된 진도/숙제가 없습니다.</div>}
           </div>
         </section>
       </>}
     </section>}

     <div className="modal-actions student-edit-actions">
       {studentForm.id&&<button className="reset-button" onClick={deleteStudent}>학생 삭제</button>}
       <div className="student-edit-right">
         <button className="cancel-button" onClick={()=>{setStudentModal(false);setStudentDetail(null)}}>{tr('닫기','Close')}</button>
         <button className="save-button" onClick={saveStudent}>{studentForm.id?'수정 저장':'학생 등록'}</button>
       </div>
     </div>
   </div>
 </section>
</div>}

 {selected&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null)}}><section className="lesson-modal"><header className="modal-head"><div><div className="modal-kicker">LESSON MANAGEMENT</div><h2>{classDisplayName(selected.classes?.class_name)}</h2><div className="modal-sub">{fmt(selected.lessonDate)} · {selected.start_time?.slice(0,5)} ~ {selected.end_time?.slice(0,5)} · {selected.subject} · {room(selected.room)}</div></div><button className="modal-close" onClick={()=>setSelected(null)}>×</button></header>{detailBusy||!detail?<div className="modal-loading">{tr('불러오는 중...','Loading...')}</div>:<div className="modal-body"><section className="record-grid"><label className="record-field"><span>{tr('수업 진도','Progress')}</span><textarea value={detail.record.progress} onChange={e=>updateRecord('progress',e.target.value)}/></label><label className="record-field"><span>{tr('숙제','Homework')}</span><textarea value={detail.record.homework} onChange={e=>updateRecord('homework',e.target.value)}/></label></section><label className="record-field memo-field"><span>{tr('특이사항','Notes')}</span><textarea value={detail.record.lesson_memo} onChange={e=>updateRecord('lesson_memo',e.target.value)}/></label><section className="attendance-section"><div className="attendance-head"><h3>{tr('학생 출결','Attendance')} <small>{detail.students.length}명</small></h3><button className="all-present-button" onClick={allPresent}>{tr('전체 출석','Mark All Present')}</button></div><div className="student-list">{detail.students.map((s,i)=><article className="student-row" key={s.id}><div className="student-info"><strong>{s.student_name}</strong><span>{[s.school,s.registered_grade].filter(Boolean).join(' · ')}</span></div><div className="attendance-buttons">{STATUSES.map(st=><button key={st} className={`attendance-button ${s.attendance_status===st?`active ${st}`:''}`} onClick={()=>updateStudent(i,{attendance_status:st})}>{statusDisplayName(st)}</button>)}</div><input className="attendance-memo" value={s.attendance_memo} onChange={e=>updateStudent(i,{attendance_memo:e.target.value})} placeholder={tr('출결 메모','Attendance note')}/></article>)}</div></section><div className="modal-actions"><button className="cancel-button" onClick={()=>setSelected(null)}>{tr('닫기','Close')}</button><button className="save-button" disabled={saving} onClick={saveLesson}>{saving?tr('저장 중...','Saving...'):tr('저장','Save')}</button></div></div>}</section></div>}
 {adminModal&&<div className="modal-backdrop"><section className="admin-modal"><header className="modal-head"><div><div className="modal-kicker">ADMIN OPERATION</div><h2>{adminModal==='event'?(eventForm.id?'학원 일정 수정':'학원 일정 등록'):adminModal==='makeup'?(changeForm.addLessonMode?tr('당일 수업 추가','Add Class'):changeForm.replacementMode?'빈 시간에 다른 수업 추가':tr('보강 수업 추가','Add Make-up Class')):'당일 수업 변경'}</h2></div><button className="modal-close" onClick={()=>setAdminModal(null)}>×</button></header><div className="admin-form">{adminModal==='event'?<><label>일정 종류<select value={eventForm.eventType||'기타'} onChange={e=>setEventForm({...eventForm,eventType:e.target.value})}><option>학원방학</option><option>시험집중</option><option>Day-off</option><option>기타</option></select></label><label>제목<input value={eventForm.title} onChange={e=>setEventForm({...eventForm,title:e.target.value})}/></label><div className="two"><label>{tr('시작','Start')}일<input type="date" value={eventForm.startDate} onChange={e=>setEventForm({...eventForm,startDate:e.target.value})}/></label><label>{tr('종료','End')}일<input type="date" value={eventForm.endDate} onChange={e=>setEventForm({...eventForm,endDate:e.target.value})}/></label></div><label>선생님 (Day-off용)<select value={eventForm.teacherId} onChange={e=>setEventForm({...eventForm,teacherId:e.target.value})}><option value="">전체/없음</option>{meta.teachers.map(t=><option value={t.id} key={t.id}>{teacherDisplayName(t.teacher_name)}</option>)}</select></label><label>{tr('메모','Memo')}<textarea value={eventForm.memo} onChange={e=>setEventForm({...eventForm,memo:e.target.value})}/></label>{eventForm.id?<div className="admin-actions event-edit-actions"><button className="reset-button" onClick={deleteEvent}>일정 삭제</button><button className="save-button" onClick={saveEvent}>수정 저장</button></div>:<button className="save-button wide" onClick={saveEvent}>일정 저장</button>}</>:<>{adminModal==='makeup'?<>{changeForm.replacementMode&&<div className="replacement-info"><strong>공강 시간 대체수업</strong><span>다른 반을 넣어도 되고, 취소하면 그냥 공강으로 유지됩니다.</span></div>}
{changeForm.addLessonMode&&<div className="replacement-info"><strong>{tr('당일 수업 추가','Add Class')}</strong><span>{tr('정규 시간표는 건드리지 않고 선택한 날짜에만 수업을 추가합니다.','Adds a class only for the selected date without changing the regular timetable.')}</span></div>}
{(changeForm.replacementMode||changeForm.addLessonMode)&&<label>{tr('반 선택','Class')}<select value={changeForm.replacementClassId||''} onChange={e=>changeForm.addLessonMode?pickAddLessonClass(e.target.value):pickReplacementClass(e.target.value)}><option value="">{tr('반 선택','Select Class')}</option>{availableAddLessonClasses().map((c:any)=><option key={c.id} value={c.id}>{classDisplayName(c.class_name)}</option>)}</select></label>}
{!changeForm.addLessonMode&&<label>{changeForm.replacementMode?'표시할 수업명':tr('보강명 / 학생명','Make-up / Student')}<input value={changeForm.title} onChange={e=>setChangeForm({...changeForm,title:e.target.value})} placeholder={tr('예: 김민준 개별보강','e.g. Kim Minjun make-up')}/></label>}<div className="two"><label>{tr('날짜','Date')}<input type="date" value={changeForm.date} onChange={e=>setChangeForm({...changeForm,date:e.target.value})}/></label><label>{tr('강의실','Room')}<select value={changeForm.room} onChange={e=>setChangeForm({...changeForm,room:e.target.value})}>{ROOMS.map(r=><option key={r}>{r}</option>)}</select></label></div>{changeForm.status==='휴강'&&<div className="cancel-hide-note">휴강으로 저장하면 이 날짜 시간표에서는 수업이 숨겨집니다.</div>}<div className="two"><label>{tr('시작','Start')}<input type="time" value={changeForm.startTime} onChange={e=>setChangeForm({...changeForm,startTime:e.target.value})}/></label><label>{tr('종료','End')}<input type="time" value={changeForm.endTime} onChange={e=>setChangeForm({...changeForm,endTime:e.target.value})}/></label></div><label>{tr('과목','Subject')}<input value={changeForm.subject} onChange={e=>setChangeForm({...changeForm,subject:e.target.value})} placeholder={changeForm.addLessonMode?tr('예: 문법','e.g. Grammar'):tr('예: 문법 보강','e.g. Grammar make-up')}/></label>{user.role==='admin'&&<label>{tr('담당 선생님','Teacher')}<select value={changeForm.teacherId} onChange={e=>setChangeForm({...changeForm,teacherId:e.target.value})}><option value="">{tr('선생님 선택','Select Teacher')}</option>{meta.teachers.map(t=><option value={t.id} key={t.id}>{teacherDisplayName(t.teacher_name)}</option>)}</select></label>}<label>{tr('메모','Memo')}<textarea value={changeForm.memo} onChange={e=>setChangeForm({...changeForm,memo:e.target.value})}/></label><button className="save-button wide" onClick={saveCustomMakeup}>{changeForm.addLessonMode?tr('수업 추가','Add Class'):changeForm.replacementMode?'대체수업 추가':tr('보강 등록','Add Make-up')}</button></>:<><div className="two"><label>{tr('날짜','Date')}<input type="date" value={changeForm.date} onChange={e=>setChangeForm({...changeForm,date:e.target.value})}/></label><label>상태<select value={changeForm.status||'정상'} onChange={e=>setChangeForm({...changeForm,status:e.target.value})}><option>정상</option><option>휴강</option><option>보강</option></select></label></div><div className="two"><label>{tr('시작','Start')}<input type="time" value={changeForm.startTime} onChange={e=>setChangeForm({...changeForm,startTime:e.target.value})}/></label><label>{tr('종료','End')}<input type="time" value={changeForm.endTime} onChange={e=>setChangeForm({...changeForm,endTime:e.target.value})}/></label></div><label>{tr('과목','Subject')}<input value={changeForm.subject} onChange={e=>setChangeForm({...changeForm,subject:e.target.value})}/></label><label>{tr('강의실','Room')}<select value={changeForm.room} onChange={e=>setChangeForm({...changeForm,room:e.target.value})}>{ROOMS.map(r=><option key={r}>{r}</option>)}</select></label><label>선생님<select value={changeForm.teacherId} onChange={e=>setChangeForm({...changeForm,teacherId:e.target.value})}>{meta.teachers.map(t=><option value={t.id} key={t.id}>{teacherDisplayName(t.teacher_name)}</option>)}</select></label><label>{tr('메모','Memo')}<textarea value={changeForm.memo} onChange={e=>setChangeForm({...changeForm,memo:e.target.value})}/></label><div className="admin-actions"><button className="reset-button" onClick={resetChange}>기본 시간표 복원</button><button className="save-button" onClick={saveChange}>변경 저장</button></div></>}</>}</div></section></div>}
 {toast&&<div className="toast">{toast}</div>}
 </>;
}
