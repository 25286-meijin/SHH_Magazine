import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const rootUrl = new URL("../", import.meta.url);

test("legacy issue assets use Storage without repository copies", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("data/legacy-asset-migration.json", rootUrl), "utf8"),
  );

  assert.equal(manifest.bucket, "magazine-public");
  assert.equal(manifest.repositoryCopiesRetained, false);
  assert.deepEqual(
    manifest.issues.map((issue) => issue.issueId),
    ["2026-06", "2026-07", "2026-08", "2026-09"],
  );

  for (const issue of manifest.issues) {
    assert.equal(issue.pageCount, 17);
    assert.equal(issue.pdf.storagePath, `issues/${issue.issueId}/${issue.issueId}.pdf`);
    assert.equal(issue.cover.storagePath, `covers/${issue.issueId}/${issue.issueId}.jpg`);

    assert.equal("repositoryPath" in issue.pdf, false);
    assert.equal("repositoryPath" in issue.cover, false);
    await assert.rejects(access(new URL(`public/demo/issues/${issue.issueId}.pdf`, rootUrl)));
    await assert.rejects(access(new URL(`public/demo/covers/${issue.issueId}.jpg`, rootUrl)));
  }
});
