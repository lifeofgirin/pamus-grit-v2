"use client";

import { FormEvent, useEffect, useState } from "react";

type User = {
  role: "teacher" | "admin";
  teacherCode: string | null;
  displayName: string;
};

type Lesson = {
  schedule_code: string;
  start_time: string;
  end_time: string;
  subject: string;
  room: string | null;
  classes: {
    class_code: string;
    class_name: string;
  } | null;
  teachers: {
    teacher_code: string;
    teacher_name: string;
  } | null;
};

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [date, setDate] = useState("");
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);

  useEffect(() => {
    restoreSession();
  }, []);

  async function restoreSession() {
    try {
      const response = await fetch("/api/me", {
        cache: "no-store",
      });

      if (!response.ok) {
        setLoading(false);
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

  async function login(event: FormEvent) {
    event.preventDefault();
    setError("");

    if (!/^\d{4}$/.test(pin)) {
      setError("4자리 로그인번호를 입력해주세요.");
      return;
    }

    setLoginLoading(true);

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ pin }),
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        setError(result.message || "로그인에 실패했습니다.");
        return;
      }

      setUser(result.user);
      setPin("");
      await loadToday();
    } catch {
      setError("서버 연결에 실패했습니다.");
    } finally {
      setLoginLoading(false);
    }
  }

  async function loadToday() {
    setScheduleLoading(true);

    try {
      const response = await fetch("/api/today", {
        cache: "no-store",
      });

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
  }

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
          <div className="brand-mark">P</div>

          <div className="brand-label">
            PAMUS GRIT ENGLISH
          </div>

          <h1>선생님 로그인</h1>

          <p className="login-copy">
            4자리 로그인번호를 입력해주세요.
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
              <div className="error-box">{error}</div>
            ) : null}

            <button
              className="login-button"
              type="submit"
              disabled={loginLoading}
            >
              {loginLoading ? "확인 중..." : "로그인"}
            </button>
          </form>

          <div className="login-foot">
            Pamus Grit Academy Management v2
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <div className="dashboard">
        <header className="topbar">
          <div>
            <div className="brand-label">
              PAMUS GRIT ENGLISH
            </div>

            <h1 className="dashboard-title">
              {user.role === "admin"
                ? "전체 오늘 시간표"
                : `${user.displayName} 오늘 시간표`}
            </h1>

            <div className="date-text">
              {date || "오늘"}
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
            <strong>{lessons.length}</strong>
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

        <section className="lesson-panel">
          <div className="section-head">
            <div>
              <div className="section-kicker">TODAY</div>
              <h2>수업 일정</h2>
            </div>

            {scheduleLoading ? (
              <span className="loading-text">
                불러오는 중...
              </span>
            ) : null}
          </div>

          {lessons.length === 0 && !scheduleLoading ? (
            <div className="empty-state">
              오늘 예정된 수업이 없습니다.
            </div>
          ) : (
            <div className="lesson-list">
              {lessons.map((lesson) => (
                <article
                  className="lesson-card"
                  key={lesson.schedule_code}
                >
                  <div className="lesson-time">
                    <strong>
                      {lesson.start_time?.slice(0, 5)}
                    </strong>
                    <span>
                      {lesson.end_time?.slice(0, 5)}
                    </span>
                  </div>

                  <div className="lesson-main">
                    <div className="lesson-name">
                      {lesson.classes?.class_name ||
                        "반 미지정"}
                    </div>

                    <div className="lesson-meta">
                      <span>{lesson.subject}</span>
                      <span>{lesson.room || "강의실 미지정"}</span>

                      {user.role === "admin" ? (
                        <span>
                          {lesson.teachers?.teacher_name ||
                            "선생님 미지정"}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="schedule-code">
                    {lesson.schedule_code}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <div className="next-note">
          다음 단계에서 수업을 클릭하면 출결 · 진도 · 숙제를
          바로 작성할 수 있게 연결합니다.
        </div>
      </div>
    </main>
  );
}
