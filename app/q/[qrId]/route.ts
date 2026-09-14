import { NextRequest, NextResponse } from "next/server";
import {
  getIssue,
  getLatestIssue,
  getQrRoute,
  isAllowedRegistrationUrl,
} from "@/lib/content";
import { trackServerEvent } from "@/lib/tracking";
import { getStoredQrRoute, recordQrEntry } from "@/lib/qr";

export async function GET(
  request: NextRequest,
  { params }: { params: { qrId: string } },
) {
  const storedRoute = await getStoredQrRoute(params.qrId).catch(() => null);
  if (storedRoute) {
    const publishedIssue = await getIssue(storedRoute.topic.issue_id);
    if (!publishedIssue) {
      return NextResponse.redirect(new URL("/?notice=issue-unavailable", request.url), 302);
    }
    const entryId = crypto.randomUUID();
    const qrEntryAtUtc = new Date().toISOString();
    await recordQrEntry(storedRoute, entryId, qrEntryAtUtc).catch(() => undefined);
    const target = new URL(storedRoute.destination_path, request.url);
    if (storedRoute.topic.page_number) {
      target.searchParams.set("page", String(storedRoute.topic.page_number));
    }
    target.searchParams.set("entry_id", entryId);
    return NextResponse.redirect(target, 302);
  }

  // Keep previously printed static QR codes working during the database rollout.
  const route = getQrRoute(params.qrId);
  const qrEntryAtUtc = new Date().toISOString();

  if (!route) {
    void trackServerEvent({
      event: "qr_unknown",
      qr_id: params.qrId,
      qr_entry_at_utc: qrEntryAtUtc,
    }).catch(() => undefined);
    return NextResponse.redirect(new URL("/?notice=unknown-qr", request.url), 302);
  }

  const entryId = crypto.randomUUID();
  let destination = route.destination;
  if (route.issue_id === "latest" && destination === "/") {
    destination = `/issues/${(await getLatestIssue()).issue_id}`;
  }

  if (
    route.destination_type === "registration" &&
    !isAllowedRegistrationUrl(destination)
  ) {
    void trackServerEvent({
      event: "failed_outbound_allowlist",
      entry_id: entryId,
      qr_id: route.qr_id,
      qr_entry_at_utc: qrEntryAtUtc,
    }).catch(() => undefined);
    return NextResponse.redirect(
      new URL("/?notice=invalid-destination", request.url),
      302,
    );
  }

  const context = {
    entry_id: entryId,
    qr_id: route.qr_id,
    creative_id: route.creative_id,
    placement_id: route.placement_id,
    issue_id: route.issue_id,
  };
  void trackServerEvent({
    event: "qr_entry",
    ...context,
    qr_entry_at_utc: qrEntryAtUtc,
    qr_type: route.qr_type,
    channel: route.qr_type === "print_content" ? "print" : "digital_signage",
    destination_type: route.destination_type,
  }).catch(() => undefined);

  if (route.destination_type === "registration") {
    void trackServerEvent({
      event: "outbound_registration",
      ...context,
      occurred_at_utc: qrEntryAtUtc,
    }).catch(() => undefined);
  }

  const target = new URL(destination, request.url);
  if (target.origin === request.nextUrl.origin) {
    target.searchParams.set("entry_id", entryId);
  }
  return NextResponse.redirect(target, 302);
}
