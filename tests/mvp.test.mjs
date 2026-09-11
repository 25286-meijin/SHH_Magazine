import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const loadJson = async (name) => JSON.parse(await readFile(new URL(`../data/${name}`, import.meta.url)));

test("latest published issue is metadata-driven and all published months are present", async () => {
  const issues = await loadJson("issues.demo.json");
  const published = issues.filter((issue) => issue.status === "published").sort((a, b) => b.publish_date.localeCompare(a.publish_date));
  assert.equal(published[0].issue_id, "2026-09");
  assert.deepEqual(new Set(issues.map((issue) => issue.issue_id)), new Set(["2026-06", "2026-07", "2026-08", "2026-09"]));
});

test("QR registry provides all required route types and unique IDs", async () => {
  const routes = await loadJson("qr-routes.demo.json");
  assert.deepEqual(new Set(routes.map((route) => route.qr_type)), new Set(["placement", "creative_placement", "print_content"]));
  assert.equal(new Set(routes.map((route) => route.qr_id)).size, routes.length);
  const creativeRoutes = routes.filter((route) => route.qr_type === "creative_placement");
  assert.equal(new Set(creativeRoutes.map((route) => route.creative_id)).size, 1);
  assert.equal(new Set(creativeRoutes.map((route) => route.placement_id)).size, creativeRoutes.length);
});

test("registration destinations use the official HTTPS host", async () => {
  const routes = await loadJson("qr-routes.demo.json");
  for (const route of routes.filter((item) => item.destination_type === "registration")) {
    const url = new URL(route.destination);
    assert.equal(url.protocol, "https:");
    assert.ok(url.hostname === "shh.tmu.edu.tw" || url.hostname.endsWith(".shh.tmu.edu.tw"));
  }
});

test("admin authentication fails closed when Supabase is absent", async () => {
  const middleware = await readFile(new URL("../middleware.ts", import.meta.url), "utf8");
  assert.match(middleware, /if \(!config\)[\s\S]*status: 503/);
  assert.match(middleware, /app_metadata\.role === "admin"/);
  assert.match(middleware, /"\/api\/admin\/:path\*"/);
  assert.doesNotMatch(middleware, /localStorage|searchParams.*password/);
});

test("public navigation does not expose admin or analytics UI", async () => {
  const files = ["../components/PublicHeader.tsx", "../components/PublicFooter.tsx"];
  const source = (
    await Promise.all(
      files.map((file) => readFile(new URL(file, import.meta.url), "utf8")),
    )
  ).join("\n");
  assert.doesNotMatch(source, /\/admin|Tracking Debug|QR Entries/);
});

test("QR attribution is preserved from issue landing to reader", async () => {
  const issuePage = await readFile(
    new URL("../app/issues/[issueId]/page.tsx", import.meta.url),
    "utf8",
  );
  const readerPage = await readFile(
    new URL("../app/read/[issueId]/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(issuePage, /safeEntryId\(searchParams\.entry_id\)/);
  assert.match(issuePage, /entry_id=\$\{entryId\}/);
  assert.match(readerPage, /entryId=\{safeEntryId\(searchParams\.entry_id\)\}/);
});

test("engagement pauses while hidden or idle and flushes on pagehide", async () => {
  const hook = await readFile(
    new URL("../hooks/useEngagementTracking.ts", import.meta.url),
    "utf8",
  );
  assert.match(hook, /!document\.hidden/);
  assert.match(hook, /30_000/);
  assert.match(hook, /15_000/);
  assert.match(hook, /visibilitychange/);
  assert.match(hook, /pagehide/);
});

test("TypeScript resolves the @ alias from the project root", async () => {
  const tsconfig = JSON.parse(
    await readFile(new URL("../tsconfig.json", import.meta.url), "utf8"),
  );
  assert.equal(tsconfig.compilerOptions.baseUrl, ".");
  assert.deepEqual(tsconfig.compilerOptions.paths, { "@/*": ["./*"] });
});

test("all demo issues include a readable PDF and generated cover", async () => {
  for (const issueId of ["2026-06", "2026-07", "2026-08", "2026-09"]) {
    const pdfUrl = new URL(`../public/demo/issues/${issueId}.pdf`, import.meta.url);
    const coverUrl = new URL(`../public/demo/covers/${issueId}.jpg`, import.meta.url);
    const [pdf, cover, pdfStat, coverStat] = await Promise.all([
      readFile(pdfUrl),
      readFile(coverUrl),
      stat(pdfUrl),
      stat(coverUrl),
    ]);

    assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
    assert.deepEqual([...cover.subarray(0, 3)], [0xff, 0xd8, 0xff]);
    assert.ok(pdfStat.size > 100_000);
    assert.ok(coverStat.size > 50_000);
  }
});

test("issue cards use large dates, secondary themes, and visible cover shadows", async () => {
  const issues = await loadJson("issues.demo.json");
  const expectedHeadlines = {
    "2026-06": "影像的監控者 影像醫學部",
    "2026-07": "雙和18 幸福醫家－院慶特輯",
    "2026-08": "明承經典 燦動非凡",
    "2026-09": "手術新紀元：達文西機械手臂",
  };
  assert.deepEqual(
    Object.fromEntries(issues.map((issue) => [issue.issue_id, issue.homepage_headline])),
    expectedHeadlines,
  );

  const [home, archive, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/issues/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(home, /<strong>\{issue\.year\} 年 \{String\(issue\.month\)/);
  assert.match(home, /<span>\{issue\.homepage_headline\}/);
  assert.match(archive, /<strong>\{i\.year\} 年 \{String\(i\.month\)/);
  assert.match(archive, /<span>\{i\.homepage_headline\}<\/span>/);
  assert.match(css, /\.cover-small\{box-shadow:(?!none)/);
});

test("the primary cover is prioritized without eagerly loading archive covers", async () => {
  const cover = await readFile(
    new URL("../components/Cover.tsx", import.meta.url),
    "utf8",
  );
  assert.match(cover, /priority=\{!small\}/);
});

test("verified practical-information pages are configured for every issue", async () => {
  const issues = await loadJson("issues.demo.json");
  for (const issue of issues) {
    assert.equal(issue.outpatient_page, 10);
    assert.equal(issue.shuttle_page, 17);
  }

  const home = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(home, /實際頁碼將由編輯 metadata 提供/);
});

test("the September practical-information pages fit within the supplied PDF", async () => {
  const issues = await loadJson("issues.demo.json");
  const issue = issues.find((item) => item.issue_id === "2026-09");
  assert.ok(issue);
  assert.equal(issue.outpatient_page, 10);
  assert.equal(issue.shuttle_page, 17);

  const pdf = await readFile(
    new URL("../public/demo/issues/2026-09.pdf", import.meta.url),
  );
  const document = await getDocument({
    data: new Uint8Array(pdf),
    disableWorker: true,
  }).promise;

  try {
    assert.equal(document.numPages, 17);
    assert.ok(issue.outpatient_page <= document.numPages);
    assert.ok(issue.shuttle_page <= document.numPages);
  } finally {
    await document.destroy();
  }
});

test("the issue archive provides a visible return-home button", async () => {
  const archive = await readFile(
    new URL("../app/issues/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(archive, /className="button secondary" href="\/"/);
  assert.match(archive, /返回首頁/);
});

test("desktop reader zoom scales beyond its default maximum width", async () => {
  const [reader, css] = await Promise.all([
    readFile(new URL("../components/PdfReader.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(reader, /className="pdf-scroll"/);
  assert.match(reader, /maxWidth: `\$\{scale \* 760\}px`/);
  assert.match(reader, /overflowX: "auto"/);
  assert.match(css, /\.pdf-pages\{max-width:760px/);
});

test("mobile reader pages use each PDF page's real aspect ratio", async () => {
  const reader = await readFile(
    new URL("../components/PdfReader.tsx", import.meta.url),
    "utf8",
  );

  assert.match(reader, /const \[pageRatio, setPageRatio\] = useState<number>\(\);/);
  assert.match(reader, /setPageRatio\(viewport\.width \/ viewport\.height\)/);
  assert.match(reader, /aspectRatio: pageRatio/);
  assert.match(reader, /minHeight: pageRatio \? 0 : undefined/);
});
