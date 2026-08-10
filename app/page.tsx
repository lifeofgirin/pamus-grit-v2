"use client";

import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";

type User = {
  role: "teacher" | "admin";
  teacherCode: string | null;
  displayName: string;
};

type RelatedClass = {
  class_code: string;
  class_name: string;
};

type RelatedTeacher = {
  teacher_code: string;
  teacher_name: string;
};

type Lesson = {
  id: string;
  schedule_code: string;
  class_id: string;
  start_time: string;
  end_time: string;
  subject: string;
  room: string | null;
  teacher_id: string | null;
  classes: RelatedClass | null;
  teachers: RelatedTeacher | null;
  lessonDate: string;
  progressDone: boolean;
  homeworkDone: boolean;
  attendanceDone: boolean;
  studentCount: number;
  attendanceCount: number;
};

type LessonStudent = {
  id: string;
  student_name: string;
  school: string | null;
  registered_grade: string | null;
  attendance_status: string;
  attendance_memo: string;
  individual_memo: string;
};

type LessonDetail = {
  date: string;
  schedule: Lesson;
  record: {
    progress: string;
    homework: string;
    lesson_memo: string;
  };
  students: LessonStudent[];
};

const ROOM_ORDER = [
  "101호",
  "102호",
  "103호",
  "204호",
  "205호",
  "206호",
  "207호",
  "208호",
];

const ATTENDANCE_STATUSES = [
  "출석",
  "지각",
  "결석",
  "보강",
];

function cleanRoom(room: string | null) {
  return String(room || "미지정").trim() || "미지정";
}

function formatDate(date: string) {
  if (!date) return "오늘";

  const parsed = new Date(`${date}T00:00:00+09:00`);

  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "long",
    timeZone: "Asia/Seoul",
  }).format(parsed);
}

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [loginLoading, setLoginLoading] =
    useState(false);

  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  const [user, setUser] =
    useState<User | null>(null);

  const [date, setDate] = useState("");
  const [lessons, setLessons] =
    useState<Lesson[]>([]);

  const [scheduleLoading, setScheduleLoading] =
    useState(false);

  const [detailLoading, setDetailLoading] =
    useState(false);

  const [saving, setSaving] = useState(false);

  const [selectedLesson, setSelectedLesson] =
    useState<Lesson | null>(null);

  const [detail, setDetail] =
    useState<LessonDetail | null>(null);

  const [toast, setToast] = useState("");

  useEffect(() => {
    restoreSession();
  }, []);

  useEffect(() => {
    if (!toast) return;

    const timer = window.setTimeout(() => {
      setToast("");
    }, 2200);

    return () => window.clearTimeout(timer);
  }, [toast]);

  const roomGroups = useMemo(() => {
    const lessonRooms = lessons.map((lesson) =>
      cleanRoom(lesson.room)
    );

    const extras = [...new Set(lessonRooms)]
      .filter(
        (room) =>
          !ROOM_ORDER.includes(room)
      )
      .sort();

    const rooms = [
      ...ROOM_ORDER,
      ...extras,
    ];

    return rooms.map((room) => ({
      room,
      lessons: lessons.filter(
        (lesson) =>
          cleanRoom(lesson.room) === room
      ),
    }));
  }, [lessons]);

  async function restoreSession() {
    try {
      const response = await fetch("/api/me", {
        cache: "no-store",
      });

      if (!response.ok) {
        return;
      }

      const result = await response.json();

      setUser(result.user);
      await loadToday();
    } catch {
      // 로그인 화면 유지
    } finally {
      setLoading(false);
    }
  }

  async function login(
    event: FormEvent
  ) {
    event.preventDefault();
    setError("");

    if (!/^\d{4}$/.test(pin)) {
      setError(
        "4자리 로그인번호를 입력해주세요."
      );
      return;
    }

    setLoginLoading(true);

    try {
      const response = await fetch(
        "/api/login",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({ pin }),
        }
      );

      const result = await response.json();

      if (!response.ok || !result.ok) {
        setError(
          result.message ||
            "로그인에 실패했습니다."
        );
        return;
      }

      setUser(result.user);
      setPin("");
      await loadToday();
    } catch {
      setError(
        "서버 연결에 실패했습니다."
      );
    } finally {
      setLoginLoading(false);
    }
  }

  async function loadToday() {
    setScheduleLoading(true);

    try {
      const response = await fetch(
        "/api/today",
        {
          cache: "no-store",
        }
      );

      const result = await response.json();

      if (!response.ok || !result.ok) {
        return;
      }

      setDate(result.date);
      setLessons(result.lessons || []);
    } finally {
      setScheduleLoading(false);
    }
  }

  async function logout() {
    await fetch("/api/logout", {
      method: "POST",
    });

    setUser(null);
    setLessons([]);
    setDate("");
    setPin("");
    setError("");
    closeLesson();
  }

  async function openLesson(
    lesson: Lesson
  ) {
    setSelectedLesson(lesson);
    setDetail(null);
    setDetailLoading(true);

    try {
      const response = await fetch(
        `/api/lesson/${encodeURIComponent(
          lesson.schedule_code
        )}?date=${encodeURIComponent(
          lesson.lessonDate || date
        )}`,
        {
          cache: "no-store",
        }
      );

      const result = await response.json();

      if (!response.ok || !result.ok) {
        setToast(
          result.message ||
            "수업을 불러오지 못했습니다."
        );
        closeLesson();
        return;
      }

      setDetail(result);
    } catch {
      setToast(
        "수업을 불러오지 못했습니다."
      );
      closeLesson();
    } finally {
      setDetailLoading(false);
    }
  }

  function closeLesson() {
    setSelectedLesson(null);
    setDetail(null);
    setDetailLoading(false);
    setSaving(false);
  }

  function updateRecord(
    field:
      | "progress"
      | "homework"
      | "lesson_memo",
    value: string
  ) {
    setDetail((current) => {
      if (!current) return current;

      return {
        ...current,
        record: {
          ...current.record,
          [field]: value,
        },
      };
    });
  }

  function updateStudent(
    index: number,
    patch: Partial<LessonStudent>
  ) {
    setDetail((current) => {
      if (!current) return current;

      const students = [
        ...current.students,
      ];

      students[index] = {
        ...students[index],
        ...patch,
      };

      return {
        ...current,
        students,
      };
    });
  }

  function markAllPresent() {
    setDetail((current) => {
      if (!current) return current;

      return {
        ...current,
        students:
          current.students.map(
            (student) => ({
              ...student,
              attendance_status:
                "출석",
            })
          ),
      };
    });
  }

  async function saveLesson() {
    if (
      !selectedLesson ||
      !detail
    ) {
      return;
    }

    setSaving(true);

    try {
      const response = await fetch(
        `/api/lesson/${encodeURIComponent(
          selectedLesson.schedule_code
        )}`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            lessonDate: detail.date,
            progress:
              detail.record.progress,
            homework:
              detail.record.homework,
            lessonMemo:
              detail.record.lesson_memo,
            students: detail.students,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok || !result.ok) {
        setToast(
          result.message ||
            "저장에 실패했습니다."
        );
        return;
      }

      setToast(
        "수업 내용이 저장되었습니다."
      );

      await loadToday();
      closeLesson();
    } catch {
      setToast(
        "저장 중 서버 오류가 발생했습니다."
      );
    } finally {
      setSaving(false);
    }
  }

  const pendingCount = lessons.filter(
    (lesson) =>
      !lesson.progressDone ||
      !lesson.homeworkDone ||
      !lesson.attendanceDone
  ).length;

  if (loading) {
    return (
      <main className="app-shell centered">
        <div className="loading-card">
          Pamus Grit을 불러오는 중입니다.
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="app-shell centered">
        <section className="login-card">
          <div className="brand-mark">
            P
          </div>

          <div className="brand-label">
            PAMUS GRIT ENGLISH
          </div>

          <h1>선생님 로그인</h1>

          <p className="login-copy">
            4자리 로그인번호를
            입력해주세요.
          </p>

          <form onSubmit={login}>
            <input
              className="pin-input"
              type="password"
              inputMode="numeric"
              maxLength={4}
              autoFocus
              value={pin}
              onChange={(event) => {
                setPin(
                  event.target.value
                    .replace(/\D/g, "")
                    .slice(0, 4)
                );
                setError("");
              }}
              placeholder="••••"
              aria-label="4자리 로그인번호"
            />

            {error ? (
              <div className="error-box">
                {error}
              </div>
            ) : null}

            <button
              className="login-button"
              type="submit"
              disabled={loginLoading}
            >
              {loginLoading
                ? "확인 중..."
                : "로그인"}
            </button>
          </form>

          <div className="login-foot">
            Pamus Grit Academy
            Management v2
          </div>
        </section>
      </main>
    );
  }

  return (
    <>
      <main className="app-shell">
        <div className="dashboard">
          <header className="topbar">
            <div>
              <div className="brand-label">
                PAMUS GRIT ENGLISH
              </div>

              <h1 className="dashboard-title">
                {user.role === "admin"
                  ? "오늘 전체 수업"
                  : `${user.displayName} 오늘 수업`}
              </h1>

              <div className="date-text">
                {formatDate(date)}
              </div>
            </div>

            <div className="top-actions">
              <button
                className="refresh-button"
                type="button"
                onClick={loadToday}
              >
                ↻ 새로고침
              </button>

              <button
                className="logout-button"
                type="button"
                onClick={logout}
              >
                로그아웃
              </button>
            </div>
          </header>

          <section className="summary-strip">
            <div>
              <span>오늘 수업</span>
              <strong>
                {lessons.length}
              </strong>
            </div>

            <div>
              <span>업무 미완료</span>
              <strong
                className={
                  pendingCount > 0
                    ? "pending-number"
                    : ""
                }
              >
                {pendingCount}
              </strong>
            </div>

            <div>
              <span>계정</span>
              <strong>
                {user.role === "admin"
                  ? "관리자"
                  : user.displayName}
              </strong>
            </div>
          </section>

          <section className="schedule-panel">
            <div className="section-head">
              <div>
                <div className="section-kicker">
                  DAILY SCHEDULE
                </div>

                <h2>
                  강의실별 오늘 시간표
                </h2>
              </div>

              {scheduleLoading ? (
                <span className="loading-text">
                  불러오는 중...
                </span>
              ) : (
                <span className="board-help">
                  수업 카드를 눌러 작성
                </span>
              )}
            </div>

            {lessons.length === 0 &&
            !scheduleLoading ? (
              <div className="empty-state">
                오늘 예정된 수업이
                없습니다.
              </div>
            ) : (
              <div className="room-board">
                {roomGroups.map(
                  (group) => (
                    <section
                      className="room-column"
                      key={group.room}
                    >
                      <div className="room-head">
                        <strong>
                          {group.room}
                        </strong>

                        <span>
                          {
                            group.lessons
                              .length
                          }
                          개
                        </span>
                      </div>

                      <div className="room-lessons">
                        {group.lessons
                          .length === 0 ? (
                          <div className="room-empty">
                            수업 없음
                          </div>
                        ) : (
                          group.lessons.map(
                            (lesson) => (
                              <button
                                type="button"
                                className="lesson-card"
                                key={
                                  lesson.schedule_code
                                }
                                onClick={() =>
                                  openLesson(
                                    lesson
                                  )
                                }
                              >
                                <div className="lesson-time">
                                  <strong>
                                    {lesson.start_time?.slice(
                                      0,
                                      5
                                    )}
                                  </strong>

                                  <span>
                                    ~{" "}
                                    {lesson.end_time?.slice(
                                      0,
                                      5
                                    )}
                                  </span>
                                </div>

                                <div className="lesson-name">
                                  {lesson
                                    .classes
                                    ?.class_name ||
                                    "반 미지정"}
                                </div>

                                <div className="lesson-subject">
                                  {
                                    lesson.subject
                                  }
                                </div>

                                {user.role ===
                                "admin" ? (
                                  <div className="teacher-chip">
                                    {lesson
                                      .teachers
                                      ?.teacher_name ||
                                      "미지정"}
                                  </div>
                                ) : null}

                                <div className="status-row">
                                  <span
                                    className={
                                      lesson.progressDone
                                        ? "status done"
                                        : "status pending"
                                    }
                                  >
                                    진도
                                  </span>

                                  <span
                                    className={
                                      lesson.homeworkDone
                                        ? "status done"
                                        : "status pending"
                                    }
                                  >
                                    숙제
                                  </span>

                                  <span
                                    className={
                                      lesson.attendanceDone
                                        ? "status done"
                                        : "status pending"
                                    }
                                  >
                                    출결
                                  </span>
                                </div>
                              </button>
                            )
                          )
                        )}
                      </div>
                    </section>
                  )
                )}
              </div>
            )}
          </section>
        </div>
      </main>

      {selectedLesson ? (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              closeLesson();
            }
          }}
        >
          <section className="lesson-modal">
            <header className="modal-head">
              <div>
                <div className="modal-kicker">
                  LESSON MANAGEMENT
                </div>

                <h2>
                  {selectedLesson
                    .classes?.class_name ||
                    "수업 관리"}
                </h2>

                <div className="modal-sub">
                  {selectedLesson.start_time?.slice(
                    0,
                    5
                  )}
                  {" ~ "}
                  {selectedLesson.end_time?.slice(
                    0,
                    5
                  )}
                  {" · "}
                  {selectedLesson.subject}
                  {" · "}
                  {cleanRoom(
                    selectedLesson.room
                  )}
                </div>
              </div>

              <button
                className="modal-close"
                type="button"
                onClick={closeLesson}
              >
                ×
              </button>
            </header>

            {detailLoading ||
            !detail ? (
              <div className="modal-loading">
                수업 내용을
                불러오는 중입니다.
              </div>
            ) : (
              <div className="modal-body">
                <section className="record-grid">
                  <label className="record-field">
                    <span>
                      수업 진도
                    </span>

                    <textarea
                      value={
                        detail.record
                          .progress
                      }
                      onChange={(event) =>
                        updateRecord(
                          "progress",
                          event.target.value
                        )
                      }
                      placeholder="오늘 진행한 내용을 입력해주세요."
                    />
                  </label>

                  <label className="record-field">
                    <span>숙제</span>

                    <textarea
                      value={
                        detail.record
                          .homework
                      }
                      onChange={(event) =>
                        updateRecord(
                          "homework",
                          event.target.value
                        )
                      }
                      placeholder="숙제가 없으면 '없음'으로 적어도 됩니다."
                    />
                  </label>
                </section>

                <label className="record-field memo-field">
                  <span>특이사항</span>

                  <textarea
                    value={
                      detail.record
                        .lesson_memo
                    }
                    onChange={(event) =>
                      updateRecord(
                        "lesson_memo",
                        event.target.value
                      )
                    }
                    placeholder="수업 관련 메모"
                  />
                </label>

                <section className="attendance-section">
                  <div className="attendance-head">
                    <div>
                      <div className="modal-kicker">
                        ATTENDANCE
                      </div>

                      <h3>
                        학생 출결
                        <small>
                          {
                            detail.students
                              .length
                          }
                          명
                        </small>
                      </h3>
                    </div>

                    <button
                      type="button"
                      className="all-present-button"
                      onClick={markAllPresent}
                    >
                      전체 출석
                    </button>
                  </div>

                  {detail.students.length ===
                  0 ? (
                    <div className="empty-state">
                      등록된 학생이
                      없습니다.
                    </div>
                  ) : (
                    <div className="student-list">
                      {detail.students.map(
                        (
                          student,
                          index
                        ) => (
                          <article
                            className="student-row"
                            key={student.id}
                          >
                            <div className="student-info">
                              <strong>
                                {
                                  student.student_name
                                }
                              </strong>

                              <span>
                                {[
                                  student.school,
                                  student.registered_grade,
                                ]
                                  .filter(
                                    Boolean
                                  )
                                  .join(
                                    " · "
                                  )}
                              </span>
                            </div>

                            <div className="attendance-buttons">
                              {ATTENDANCE_STATUSES.map(
                                (
                                  status
                                ) => (
                                  <button
                                    type="button"
                                    key={
                                      status
                                    }
                                    className={`attendance-button ${
                                      student.attendance_status ===
                                      status
                                        ? `active ${status}`
                                        : ""
                                    }`}
                                    onClick={() =>
                                      updateStudent(
                                        index,
                                        {
                                          attendance_status:
                                            status,
                                        }
                                      )
                                    }
                                  >
                                    {
                                      status
                                    }
                                  </button>
                                )
                              )}
                            </div>

                            <input
                              className="attendance-memo"
                              type="text"
                              value={
                                student.attendance_memo
                              }
                              onChange={(event) =>
                                updateStudent(
                                  index,
                                  {
                                    attendance_memo:
                                      event
                                        .target
                                        .value,
                                  }
                                )
                              }
                              placeholder="출결 메모"
                            />
                          </article>
                        )
                      )}
                    </div>
                  )}
                </section>

                <div className="modal-actions">
                  <button
                    className="cancel-button"
                    type="button"
                    onClick={closeLesson}
                  >
                    닫기
                  </button>

                  <button
                    className="save-button"
                    type="button"
                    disabled={saving}
                    onClick={saveLesson}
                  >
                    {saving
                      ? "저장 중..."
                      : "저장"}
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      ) : null}

      {toast ? (
        <div className="toast">
          {toast}
        </div>
      ) : null}
    </>
  );
}
