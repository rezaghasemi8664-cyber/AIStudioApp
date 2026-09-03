import React from 'react';

const features = [
  {
    title: 'تحلیل حرفه‌ای سهم',
    description: 'بررسی داده‌های بازار و ارائه تصویری یکپارچه برای تصمیم‌گیری آگاهانه‌تر درباره نمادها.',
    icon: '◈',
  },
  {
    title: 'تحلیل بنیادی',
    description: 'بررسی شاخص‌های کلیدی و اطلاعات بنیادی برای شناخت بهتر وضعیت شرکت‌ها.',
    icon: '▣',
  },
  {
    title: 'مقایسه نمادها',
    description: 'مقایسه چند سهم در یک نگاه و مشاهده نتایج تحلیلی در قالبی ساختاریافته.',
    icon: '⇄',
  },
  {
    title: 'تحلیل بازار',
    description: 'نمایش تصویری وضعیت بازار و داده‌های مهم برای داشتن دیدی سریع‌تر نسبت به روند بازار.',
    icon: '◫',
  },
  {
    title: 'نوسان‌گیری',
    description: 'شناسایی و بررسی فرصت‌های کوتاه‌مدت بازار با استفاده از داده‌های به‌روز.',
    icon: '↗',
  },
  {
    title: 'سبد سهام',
    description: 'مدیریت و بررسی وضعیت سبد سهام در یک محیط یکپارچه و کاربردی.',
    icon: '▤',
  },
];

const steps = [
  ['۰۱', 'ثبت‌نام سریع', 'با شماره موبایل خود حساب کاربری ایجاد کنید.'],
  ['۰۲', 'دریافت رمز عبور', 'رمز ورود حساب از طریق پیامک برای شما ارسال می‌شود.'],
  ['۰۳', 'ورود به سامانه', 'با شماره موبایل و رمز عبور وارد محیط تحلیل شوید.'],
];

const PublicLandingPage: React.FC = () => {
  const goToLogin = () => {
    window.location.href = '/';
  };

  return (
    <div dir="rtl" className="roniya-public-page">
      <style>{`
        .roniya-public-page {
          --navy: #071426;
          --navy-2: #0b1d34;
          --cyan: #22d3ee;
          --cyan-2: #06b6d4;
          --text: #e8f1fb;
          --muted: #9eb0c5;
          --line: rgba(148, 163, 184, .16);
          min-height: 100vh;
          color: var(--text);
          background:
            radial-gradient(circle at 12% 12%, rgba(34,211,238,.12), transparent 28%),
            radial-gradient(circle at 88% 18%, rgba(59,130,246,.11), transparent 26%),
            linear-gradient(145deg, #050d19 0%, var(--navy) 48%, #09182b 100%);
          font-family: var(--font-sans-fa, Tahoma, Arial, sans-serif);
          overflow-x: hidden;
        }
        .roniya-public-page * { box-sizing: border-box; }
        .roniya-public-page a { color: inherit; text-decoration: none; }
        .public-wrap { width: min(1180px, calc(100% - 40px)); margin: 0 auto; }
        .public-nav { position: relative; z-index: 5; display: flex; align-items: center; justify-content: space-between; padding: 22px 0; }
        .public-brand { display: flex; align-items: center; gap: 12px; font-weight: 900; font-size: 18px; }
        .public-brand img { width: 48px; height: 48px; object-fit: contain; filter: drop-shadow(0 8px 18px rgba(34,211,238,.18)); }
        .public-nav-actions { display: flex; gap: 10px; align-items: center; }
        .public-btn { border: 1px solid var(--line); border-radius: 12px; padding: 11px 18px; cursor: pointer; font: inherit; font-weight: 800; transition: .2s ease; }
        .public-btn:hover { transform: translateY(-2px); }
        .public-btn-ghost { background: rgba(255,255,255,.035); color: var(--text); }
        .public-btn-primary { border-color: rgba(34,211,238,.35); background: linear-gradient(135deg, var(--cyan), var(--cyan-2)); color: #04202a; box-shadow: 0 10px 30px rgba(6,182,212,.18); }
        .public-hero { position: relative; padding: 72px 0 88px; text-align: center; }
        .public-badge { display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px; border: 1px solid rgba(34,211,238,.22); border-radius: 999px; background: rgba(34,211,238,.07); color: #8be9f6; font-size: 13px; font-weight: 800; }
        .public-badge span { width: 7px; height: 7px; border-radius: 50%; background: var(--cyan); box-shadow: 0 0 14px var(--cyan); }
        .public-hero h1 { max-width: 850px; margin: 22px auto 18px; font-size: clamp(34px, 6vw, 64px); line-height: 1.15; letter-spacing: -.8px; font-weight: 950; }
        .public-gradient-text { background: linear-gradient(90deg, #fff, #a5f3fc 48%, #67e8f9); -webkit-background-clip: text; background-clip: text; color: transparent; }
        .public-hero p { max-width: 760px; margin: 0 auto; color: var(--muted); font-size: clamp(16px, 2vw, 19px); line-height: 2; }
        .public-hero-actions { display: flex; justify-content: center; gap: 12px; flex-wrap: wrap; margin-top: 30px; }
        .public-hero-actions .public-btn { min-width: 155px; }
        .public-trust { display: flex; justify-content: center; gap: 28px; flex-wrap: wrap; margin-top: 30px; color: #8da1b7; font-size: 13px; }
        .public-trust strong { color: #dce8f4; }
        .public-section { padding: 70px 0; }
        .public-section-head { text-align: center; max-width: 720px; margin: 0 auto 38px; }
        .public-section-kicker { color: #67e8f9; font-size: 13px; font-weight: 900; letter-spacing: .5px; }
        .public-section h2 { margin: 10px 0; font-size: clamp(27px, 4vw, 40px); }
        .public-section-head p { margin: 0; color: var(--muted); line-height: 1.9; }
        .public-feature-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
        .public-card { padding: 24px; border: 1px solid var(--line); border-radius: 20px; background: linear-gradient(145deg, rgba(255,255,255,.055), rgba(255,255,255,.018)); box-shadow: 0 20px 55px rgba(0,0,0,.13); }
        .public-card-icon { width: 46px; height: 46px; display: grid; place-items: center; border-radius: 14px; background: rgba(34,211,238,.1); border: 1px solid rgba(34,211,238,.18); color: #67e8f9; font-size: 22px; font-weight: 900; }
        .public-card h3 { margin: 18px 0 8px; font-size: 18px; }
        .public-card p { margin: 0; color: var(--muted); line-height: 1.9; font-size: 14px; }
        .public-process { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
        .public-step { position: relative; padding: 28px; border-top: 1px solid rgba(34,211,238,.28); background: rgba(255,255,255,.025); border-radius: 18px; }
        .public-step-number { color: #67e8f9; font-size: 13px; font-weight: 950; }
        .public-step h3 { margin: 12px 0 8px; }
        .public-step p { margin: 0; color: var(--muted); line-height: 1.9; font-size: 14px; }
        .public-cta { margin: 28px 0 70px; padding: 42px; border: 1px solid rgba(34,211,238,.2); border-radius: 28px; background: radial-gradient(circle at 80% 0%, rgba(34,211,238,.14), transparent 35%), linear-gradient(135deg, rgba(255,255,255,.055), rgba(255,255,255,.02)); text-align: center; }
        .public-cta h2 { margin: 0 0 12px; font-size: clamp(25px, 4vw, 36px); }
        .public-cta p { margin: 0 auto 22px; max-width: 650px; color: var(--muted); line-height: 1.9; }
        .public-footer { border-top: 1px solid var(--line); padding: 25px 0 32px; color: #7f93aa; font-size: 13px; }
        .public-footer-inner { display: flex; justify-content: space-between; gap: 20px; flex-wrap: wrap; }
        @media (max-width: 820px) {
          .public-feature-grid, .public-process { grid-template-columns: 1fr 1fr; }
          .public-hero { padding-top: 48px; }
        }
        @media (max-width: 560px) {
          .public-wrap { width: min(100% - 24px, 1180px); }
          .public-nav { align-items: flex-start; }
          .public-brand { font-size: 15px; }
          .public-brand img { width: 40px; height: 40px; }
          .public-nav-actions .public-btn-ghost { display: none; }
          .public-feature-grid, .public-process { grid-template-columns: 1fr; }
          .public-hero { padding: 42px 0 55px; }
          .public-cta { padding: 28px 18px; }
        }
      `}</style>

      <header className="public-wrap public-nav">
        <div className="public-brand">
          <img src="/1.png" alt="لوگوی تحلیلگر هوشمند بورس رونیا" />
          <span>تحلیلگر هوشمند بورس رونیا</span>
        </div>
        <div className="public-nav-actions">
          <button className="public-btn public-btn-ghost" onClick={goToLogin}>ورود به سامانه</button>
          <button className="public-btn public-btn-primary" onClick={goToLogin}>ثبت‌نام</button>
        </div>
      </header>

      <main>
        <section className="public-hero">
          <div className="public-wrap">
            <div className="public-badge"><span /> سامانه تحلیل و بررسی بازار سرمایه</div>
            <h1><span className="public-gradient-text">تحلیل هوشمند بازار</span><br />برای تصمیم‌گیری دقیق‌تر</h1>
            <p>
              تحلیلگر هوشمند بورس رونیا یک سامانه تخصصی برای بررسی سهام و بازار سرمایه ایران است؛
              محیطی یکپارچه برای تحلیل سهم، تحلیل بنیادی، مقایسه نمادها، بررسی بازار، نوسان‌گیری و مدیریت سبد سهام.
            </p>
            <div className="public-hero-actions">
              <button className="public-btn public-btn-primary" onClick={goToLogin}>شروع استفاده از سامانه</button>
              <button className="public-btn public-btn-ghost" onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}>مشاهده امکانات</button>
            </div>
            <div className="public-trust">
              <span><strong>تحلیل سهم</strong> · اطلاعات بازار</span>
              <span><strong>تحلیل بنیادی</strong> · شاخص‌های کلیدی</span>
              <span><strong>مقایسه</strong> · بررسی چند نماد</span>
            </div>
          </div>
        </section>

        <section id="features" className="public-section">
          <div className="public-wrap">
            <div className="public-section-head">
              <div className="public-section-kicker">امکانات سامانه</div>
              <h2>همه ابزارهای مهم، در یک محیط یکپارچه</h2>
              <p>رونیا اطلاعات و ابزارهای تحلیلی موردنیاز شما را در یک داشبورد حرفه‌ای و فارسی کنار هم قرار می‌دهد.</p>
            </div>
            <div className="public-feature-grid">
              {features.map((feature) => (
                <article className="public-card" key={feature.title}>
                  <div className="public-card-icon">{feature.icon}</div>
                  <h3>{feature.title}</h3>
                  <p>{feature.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="public-section">
          <div className="public-wrap">
            <div className="public-section-head">
              <div className="public-section-kicker">شروع کار</div>
              <h2>شروع استفاده ساده است</h2>
              <p>بدون پیچیدگی، حساب خود را ایجاد کنید و وارد محیط تحلیل رونیا شوید.</p>
            </div>
            <div className="public-process">
              {steps.map(([number, title, description]) => (
                <article className="public-step" key={number}>
                  <div className="public-step-number">{number}</div>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="public-wrap public-cta">
          <h2>آماده ورود به دنیای تحلیل حرفه‌ای هستید؟</h2>
          <p>همین حالا وارد سامانه شوید یا با شماره موبایل خود ثبت‌نام کنید و امکانات رونیا را تجربه کنید.</p>
          <button className="public-btn public-btn-primary" onClick={goToLogin}>ورود / ثبت‌نام</button>
        </section>
      </main>

      <footer className="public-footer">
        <div className="public-wrap public-footer-inner">
          <span>© {new Date().getFullYear()} تحلیلگر هوشمند بورس رونیا</span>
          <span>سامانه تحلیل و بررسی بازار سرمایه ایران</span>
        </div>
      </footer>
    </div>
  );
};

export default PublicLandingPage;
