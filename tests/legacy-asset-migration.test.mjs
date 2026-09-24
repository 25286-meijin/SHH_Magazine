import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const rootUrl = new URL("../", import.meta.url);

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex").toUpperCase();

test("legacy issue assets retain verified repository copies during preview migration", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("data/legacy-asset-migration.json", rootUrl), "utf8"),
  );

  assert.equal(manifest.bucket, "magazine-public");
  assert.equal(manifest.repositoryCopiesRetained, true);
  assert.deepEqual(
    manifest.issues.map((issue) => issue.issueId),
    ["2026-06", "2026-07", "2026-08", "2026-09"],
  );

  for (const issue of manifest.issues) {
    assert.equal(issue.pageCount, 17);
    assert.equal(issue.pdf.storagePath, `issues/${issue.issueId}/${issue.issueId}.pdf`);
    assert.equal(issue.cover.storagePath, `covers/${issue.issueId}/${issue.issueId}.jpg`);

    for (const asset of [issue.pdf, issue.cover]) {
      const contents = await readFile(new URL(asset.repositoryPath, rootUrl));
      assert.equal(contents.byteLength, asset.size);
      assert.equal(sha256(contents), asset.sha256);
    }
  }
});
