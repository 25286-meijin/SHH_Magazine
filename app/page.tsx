import Link from "next/link";
import { Cover } from "@/components/Cover";
import { PublicHeader } from "@/components/PublicHeader";
import { getPublishedIssues } from "@/lib/content";

export const dynamic = "force-dynamic";

const smartHealthPillars = [
  {
    label: "SMART",
    title: "智慧醫療，科技賦能",
    footer: "Smart",
    items: ["AI 輔助診斷與臨床決策", "數位醫療、遠距照護", "智慧病房、智慧物流"],
  },
  {
    label: "HEALTH",
    title: "從治病走向全人健康",
    footer: "Health",
    items: ["健康促進、精準健康", "健康老化、慢病管理", "心理健康、營養體重"],
  },
  {
    label: "HOSPITAL",
    title: "智慧、溫暖、高效的雙和",
    footer: "Hospital",
    items: ["病人為中心、無縫照護", "幸福職場", "永續經營（ESG）"],
  },
];

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
              {archive.map((issue) => (
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
      <div className="wrap">
        <div className="smart-health-heading">
          <div>
            <p className="eyebrow">SMART HEALTH HOSPITAL</p>
            <h2 id="smart-health-title">從雙和醫院，到智慧健康醫院</h2>
          </div>
          <div className="smart-health-name">
            <strong>Smart Health Hospital</strong>
            <span>From Smart Hospital to Smart Health</span>
            <p>智慧醫療・健康全人・人本照護</p>
          </div>
        </div>

        <p className="smart-health-quote">
          <strong>科技不是主角，健康才是結果；</strong>
          <span>醫院不是終點，社區才是延伸。</span>
        </p>

        <div className="smart-health-grid">
          {smartHealthPillars.map((pillar) => (
            <article className="smart-health-card" key={pillar.label}>
              <PillarIcon pillar={pillar.label} />
              <span className="smart-health-letter" aria-hidden="true">{pillar.label[0]}</span>
              <header>
                <h3>{pillar.label}</h3>
                <p>{pillar.title}</p>
              </header>
              <ul>
                {pillar.items.map((item) => <li key={item}>{item}</li>)}
              </ul>
              <div className="smart-health-card-footer">{pillar.footer}</div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function PillarIcon({ pillar }: { pillar: string }) {
  if (pillar === "SMART") {
    return (
      <span className="smart-health-icon" aria-hidden="true">
        <svg viewBox="0 0 48 48">
          <rect x="14" y="12" width="20" height="24" rx="3" />
          <rect x="20" y="18" width="8" height="12" rx="1" />
          <path d="M9 17h5M9 24h5M9 31h5M34 17h5M34 24h5M34 31h5" />
        </svg>
      </span>
    );
  }

  if (pillar === "HEALTH") {
    return (
      <span className="smart-health-icon" aria-hidden="true">
        <svg viewBox="0 0 48 48">
          <path d="M8 24h8l4-8 7 17 5-9h8" />
          <path d="M11 13c4-4 10-3 13 2 3-5 9-6 13-2 5 5 3 12-1 16L24 40 12 29c-4-4-6-11-1-16Z" />
        </svg>
      </span>
    );
  }

  return (
    <span className="smart-health-icon" aria-hidden="true">
      <svg viewBox="0 0 48 48">
        <path d="M11 39V16h26v23M18 39v-7h12v7M19 22h3M26 22h3M19 27h3M26 27h3" />
        <path d="M21 16V9h6v7M20 12h8M24 8v8" />
      </svg>
    </span>
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
