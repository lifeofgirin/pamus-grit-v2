export default function Home() {
  const connected =
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

  return (
    <main className="page-shell">
      <section className="hero-card">
        <div className="brand-chip">PAMUS GRIT ENGLISH</div>
        <h1>파머스그릿어학원<br />관리 시스템 <span>v2</span></h1>
        <p className="hero-copy">
          Google Sheets 기반 시스템을 서버형 학원 관리 앱으로 이전하고 있습니다.
        </p>

        <div className="status-card">
          <div>
            <div className="status-label">SERVER STATUS</div>
            <div className="status-title">
              {connected ? "Supabase 연결 준비 완료" : "환경변수 설정 필요"}
            </div>
          </div>
          <div className={connected ? "dot ok" : "dot"} />
        </div>

        <div className="feature-grid">
          <article><strong>01</strong><span>선생님 로그인</span><small>다음 단계</small></article>
          <article><strong>02</strong><span>오늘 시간표</span><small>DB 연결</small></article>
          <article><strong>03</strong><span>출결 · 진도 · 숙제</span><small>순차 이전</small></article>
        </div>

        <div className="footer-note">
          {connected
            ? "✅ 환경변수가 감지되었습니다. 다음 단계로 진행할 수 있습니다."
            : "Vercel에 Supabase URL과 Publishable Key를 등록하면 상태가 변경됩니다."}
        </div>
      </section>
    </main>
  );
}
