-- Pamus Grit v18.3.6
-- 당일 추가수업/보강 수업도 일반 수업처럼 진도·숙제·출결 작성 가능하게 연결

alter table public.makeup_lessons
  add column if not exists class_id uuid null
  references public.classes(id)
  on delete set null;

create index if not exists idx_makeup_lessons_class_date
  on public.makeup_lessons(class_id, makeup_date);

create table if not exists public.makeup_lesson_records (
  id uuid primary key default gen_random_uuid(),
  makeup_lesson_id uuid not null
    references public.makeup_lessons(id)
    on delete cascade,
  class_id uuid null
    references public.classes(id)
    on delete set null,
  lesson_date date not null,
  teacher_id uuid null
    references public.teachers(id)
    on delete set null,
  progress text not null default '',
  homework text not null default '',
  lesson_memo text not null default '',
  updated_at timestamptz not null default now(),
  unique (makeup_lesson_id, lesson_date)
);

create index if not exists idx_makeup_lesson_records_class_date
  on public.makeup_lesson_records(class_id, lesson_date);

create table if not exists public.makeup_attendance (
  id uuid primary key default gen_random_uuid(),
  makeup_lesson_id uuid not null
    references public.makeup_lessons(id)
    on delete cascade,
  class_id uuid null
    references public.classes(id)
    on delete set null,
  student_id uuid not null
    references public.students(id)
    on delete cascade,
  lesson_date date not null,
  attendance_status text not null,
  attendance_memo text null,
  individual_memo text null,
  updated_at timestamptz not null default now(),
  unique (makeup_lesson_id, student_id, lesson_date)
);

create index if not exists idx_makeup_attendance_lesson_date
  on public.makeup_attendance(makeup_lesson_id, lesson_date);
