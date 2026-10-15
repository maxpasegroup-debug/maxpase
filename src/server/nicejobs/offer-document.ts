import { PrismaClient } from "@prisma/client";
import { prisma } from "@/server/db";
import { AccessError } from "@/server/authorization/engine";
import { operationalEvent } from "@/server/domain/operational-events";
import { createApplicationService } from "./applications";
import { z } from "zod";
import { randomUUID } from "node:crypto";

export const escapeOfferText = (value: unknown) => String(value ?? "Not configured").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
function emailSubject(value: string) {
  const chunks: string[] = []; let chunk = "";
  for (const character of value) {
    if (Buffer.byteLength(chunk + character) > 42) { chunks.push(chunk); chunk = ""; }
    chunk += character;
  }
  if (chunk) chunks.push(chunk);
  return chunks.map(part => `=?UTF-8?B?${Buffer.from(part).toString("base64")}?=`).join("\r\n ");
}
export function createOfferDocumentService(client: PrismaClient = prisma) {
  const core = createApplicationService(client).internal;
  async function download(userId: string, reference: string, format: "html" | "eml" = "html") {
    z.string().uuid().parse(reference);
    z.enum(["html", "eml"]).parse(format);
    return client.$transaction(async db => {
      const boundary = await core.boundary(db, userId, true);
      const offer = await db.niceJobsOffer.findUnique({ where: { reference } });
      if (!offer?.issuedAt) throw new AccessError("Offer unavailable");
      const application = await db.niceJobsApplication.findUniqueOrThrow({ where: { id: offer.applicationId }, select: { reference: true } });
      const owned = await core.load(db, boundary, application.reference, true);
      const snapshot = JSON.parse(offer.snapshot);
      const fields = { Reference: reference, "Offer version": offer.number, Candidate: snapshot.candidateName ?? owned.candidate.displayName, "Legal employer": snapshot.legalEmployer?.legalName ?? snapshot.company, "Job title": snapshot.jobTitle, Division: snapshot.division, Engagement: snapshot.engagement, Compensation: snapshot.compensation, Incentives: snapshot.incentives, Expectations: snapshot.expectations, Terms: snapshot.terms, Issued: offer.issuedAt.toISOString(), Status: offer.status, Accepted: offer.acceptedAt?.toISOString() ?? "Not accepted", "Valid until": offer.expiresAt?.toISOString() ?? "No configured expiry", "Orientation completed": snapshot.preOffer?.orientationCompletedAt, "Policies acknowledged": snapshot.preOffer?.policiesAcceptedAt, "Training job version": snapshot.programme ? snapshot.jobVersion : undefined, "Training days": snapshot.programme?.durationDays, "Training calendar": snapshot.programme?.dayMode, "Training timezone": snapshot.programme?.timezone };
      const policies: { title: string; version: string; text: string }[] = snapshot.preOffer?.policies ?? [];
      const html = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Offer ' + escapeOfferText(reference) + '</title><style>body{font:16px/1.5 system-ui;max-width:850px;margin:40px auto;padding:24px;color:#171717}dt{font-weight:700;margin-top:16px}dd{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}section p{white-space:pre-wrap;overflow-wrap:anywhere}</style><h1>' + escapeOfferText(snapshot.title) + '</h1><dl>' + Object.entries(fields).filter(([, value]) => value !== undefined).map(([key, value]) => '<dt>' + escapeOfferText(key) + '</dt><dd>' + escapeOfferText(value) + '</dd>').join('') + '</dl>' + policies.map(policy => '<section><h2>' + escapeOfferText(policy.title) + ' / Version ' + escapeOfferText(policy.version) + '</h2><p>' + escapeOfferText(policy.text) + '</p></section>').join('') + '</html>';
      const filename = `offer-${reference}.html`, boundaryId = "offer-" + randomUUID();
      const encoded = Buffer.from(html).toString("base64").match(/.{1,76}/g)!.join("\r\n");
      const emailDraft = ["X-Unsent: 1", "To: ", `Subject: ${emailSubject(String(snapshot.title))}`, "MIME-Version: 1.0", `Content-Type: multipart/mixed; boundary="${boundaryId}"`, "", `--${boundaryId}`, "Content-Type: text/plain; charset=utf-8", "", `My offer reference: ${reference}. My offer document is attached.`, `--${boundaryId}`, `Content-Type: text/html; charset=utf-8; name="${filename}"`, `Content-Disposition: attachment; filename="${filename}"`, "Content-Transfer-Encoding: base64", "", encoded, `--${boundaryId}--`, ""].join("\r\n");
      await operationalEvent(db, { actorUserId: userId, actorPersonId: boundary.personId, organizationId: owned.divisionId, action: "nicejobs.offer.downloaded", entityType: "NiceJobsOffer", entityId: offer.id, result: "SUCCESS", metadata: { offerReference: reference, number: offer.number, format } });
      return { html, content: format === "eml" ? emailDraft : html, contentType: format === "eml" ? "message/rfc822" : "text/html; charset=utf-8", filename: format === "eml" ? `offer-${reference}.eml` : filename };
    });
  }
  return { download };
}
export const offerDocumentService = createOfferDocumentService();
