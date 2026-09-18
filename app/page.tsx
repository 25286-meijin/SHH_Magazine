import Image from "next/image";
import Link from "next/link";
import { Cover } from "@/components/Cover";
import { PublicHeader } from "@/components/PublicHeader";
import { getPublishedIssues } from "@/lib/content";

export const dynamic = "force-dynamic";

export default async function Home() {
  const archive = await getPublishedIssues();
  const latest = archive[0];
  if (!latest) throw new Error("No published issue is configured");

  return (
    <>
      <PublicHeader />
      <main>
        <div className="wrap hero">
          <div>
            <p className="eyebrow">
              LATEST ISSUE · {latest.year}.{String(latest.month).padStart(2, "0")}
            </p>
            <h1>{latest.homepage_headline}</h1>
            <p className="summary">{latest.homepage_summary}</p>
            <div className="actions">
              <Link className="button primary" href={`/read/${latest.issue_id}`}>
                開始閱讀
              </Link>
              <Link className="button secondary" href="/issues">
                歷期醫訊
              </Link>
            </div>
          </div>
          <Cover issue={latest} />
        </div>

        <section>
          <div className="wrap">
            <div className="section-head">
              <div>
                <p className="eyebrow">THIS ISSUE</p>
                <h2>本期實用資訊</h2>
              </div>
              <p>快速前往最新一期的門診時刻表與接駁車資訊。</p>
            </div>
            <div className="feature-grid">
              <InfoCard
                title="本期醫訊"
                text="從第一頁開始閱讀最新一期雙和醫訊。"
                href={`/read/${latest.issue_id}`}
                label="開始閱讀"
              />
              <InfoCard
                title="門診時刻表"
                text="隨當期醫訊更新的門診資訊。"
                href="/latest/outpatient"
                label="查看門診"
                disabled={!latest.outpatient_page}
              />
              <InfoCard
                title="接駁車資訊"
                text="查看當期刊物中的交通資訊。"
                href="/latest/shuttle"
                label="查看接駁"
                disabled={!latest.shuttle_page}
              />
            </div>
          </div>
        </section>

        <section className="archive">
          <div className="wrap">
            <div className="section-head">
              <div>
                <p className="eyebrow">ARCHIVE</p>
                <h2>歷期醫訊</h2>
              </div>
              <Link href="/issues">查看全部 →</Link>
            </div>
            <div className="issue-grid">
              {archive.slice(0, 6).map((issue) => (
                <Link className="issue-card" href={`/issues/${issue.issue_id}`} key={issue.issue_id}>
                  <Cover issue={issue} small />
                  <strong>
                    {issue.year} 年 {String(issue.month).padStart(2, "0")} 月
                  </strong>
                  <span>
                    {issue.homepage_headline}
                    {issue === latest ? " · 最新一期" : ""}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <SmartHealthSection />
      </main>
    </>
  );
}

function SmartHealthSection() {
  return (
    <section className="smart-health" aria-labelledby="smart-health-title">
      <div className="smart-health-banner">
        <div className="smart-health-visual">
          <Image
            src="/images/smart-health-hospital.jpg"
            alt="雙和醫院院區外觀"
            fill
            sizes="(max-width: 760px) 100vw, 28vw"
          />
        </div>

        <div className="smart-health-content">
          <div className="smart-health-copy">
            <div className="smart-health-title">
              <p className="eyebrow">SHH・SMART HEALTH HOSPITAL</p>
              <h2 id="smart-health-title">從雙和醫院，到智慧健康醫院</h2>
            </div>
            <blockquote className="smart-health-philosophy">
              「科技不是主角，健康才是結果；
              <br />
              醫院不是終點，社區才是延伸。」
            </blockquote>
          </div>
          <div className="smart-health-values" aria-label="Smart Health Hospital 品牌理念">
            <span><strong>SMART 看病更方便</strong><small>讓科技真正幫上忙</small></span>
            <i aria-hidden="true" />
            <span><strong>HEALTH 老得更健康</strong><small>把健康管理往前移</small></span>
            <i aria-hidden="true" />
            <span><strong>HOSPITAL 照護更有溫度</strong><small>讓醫療更順暢・更有溫度</small></span>
          </div>
        </div>
      </div>
    </section>
  );
}

function InfoCard({
  title,
  text,
  href,
  label,
  disabled,
}: {
  title: string;
  text: string;
  href: string;
  label: string;
  disabled?: boolean;
}) {
  return (
    <article className="feature-card">
      <div>
        <p className="eyebrow">QUICK ACCESS</p>
        <h3>{title}</h3>
        <p>{text}</p>
      </div>
      {disabled ? <span className="unavailable">資料待補</span> : <Link href={href}>{label} →</Link>}
    </article>
  );
}
