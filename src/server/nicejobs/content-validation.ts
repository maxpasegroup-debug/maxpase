import { fileTypeFromBuffer } from "file-type";
import { extname } from "node:path";
import { NiceJobsError } from "./input";

export const MAX_CONTENT_BYTES = 64 * 1024 * 1024;
const types: Record<string, { extensions: string[]; mediaType: string; limit: number }> = {
  "image/png": { extensions: [".png"], mediaType: "IMAGE", limit: 10 * 1024 * 1024 },
  "image/jpeg": { extensions: [".jpg", ".jpeg"], mediaType: "IMAGE", limit: 10 * 1024 * 1024 },
  "image/webp": { extensions: [".webp"], mediaType: "IMAGE", limit: 10 * 1024 * 1024 },
  "application/pdf": { extensions: [".pdf"], mediaType: "PDF", limit: 20 * 1024 * 1024 },
  "video/mp4": { extensions: [".mp4"], mediaType: "VIDEO", limit: MAX_CONTENT_BYTES },
  "video/webm": { extensions: [".webm"], mediaType: "VIDEO", limit: MAX_CONTENT_BYTES },
  "audio/mpeg": { extensions: [".mp3"], mediaType: "AUDIO", limit: 32 * 1024 * 1024 },
  "audio/wav": { extensions: [".wav"], mediaType: "AUDIO", limit: 32 * 1024 * 1024 },
  "audio/x-m4a": { extensions: [".m4a"], mediaType: "AUDIO", limit: 32 * 1024 * 1024 }
};
export async function validateContentFile(filename: string, declaredMime: string, bytes: Uint8Array) {
  if (!filename || filename.length > 180 || /[\\/:<>"|?*]/.test(filename) || Array.from(filename).some(c=>c.codePointAt(0)!<32 || c.codePointAt(0)===127 || c.codePointAt(0)!>=0x202a && c.codePointAt(0)!<=0x202e || c.codePointAt(0)!>=0x2066 && c.codePointAt(0)!<=0x2069) || filename.startsWith(".") || filename.endsWith(".") || filename.endsWith(" ")) throw new NiceJobsError("Use a plain filename without paths or special characters");
  if (!bytes.byteLength || bytes.byteLength > MAX_CONTENT_BYTES) throw new NiceJobsError("Choose a nonempty file up to 64 MB");
  const extension = extname(filename).toLowerCase();
  if (!Object.values(types).some(rule => rule.extensions.includes(extension))) throw new NiceJobsError("This extension is not supported");
  // Reject archive/executable/XML payloads before the detector can inspect their inner formats.
  const head = Buffer.from(bytes.subarray(0,16));
  const expectedPrefix = [".png"].includes(extension) ? head.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : [".jpg",".jpeg"].includes(extension) ? head[0] === 255 && head[1] === 216 : [".webp",".wav"].includes(extension) ? head.subarray(0,4).toString() === "RIFF" : extension === ".pdf" ? head.subarray(0,5).toString() === "%PDF-" : [".mp4",".m4a"].includes(extension) ? head.subarray(4,8).toString() === "ftyp" : extension === ".webm" ? head.subarray(0,4).equals(Buffer.from([26,69,223,163])) : head.subarray(0,3).toString() === "ID3" || head[0] === 255;
  if (!expectedPrefix) throw new NiceJobsError("File bytes do not match the selected format");
  let detected;
  try { detected = await fileTypeFromBuffer(bytes); } catch { throw new NiceJobsError("This file cannot be identified safely"); }
  const rule = detected && types[detected.mime];
  if (!detected || !rule || !rule.extensions.includes(extname(filename).toLowerCase())) throw new NiceJobsError("File contents and extension must match a supported image, PDF, audio or video format");
  const declared = declaredMime.split(";")[0].trim().toLowerCase();
  if (declared && declared !== "application/octet-stream" && declared !== detected.mime && !(detected.mime === "audio/wav" && declared === "audio/x-wav") && !(detected.mime === "audio/x-m4a" && declared === "audio/mp4")) throw new NiceJobsError("The declared file type does not match its contents");
  if (bytes.byteLength > rule.limit) throw new NiceJobsError(`This file type is limited to ${rule.limit / 1024 / 1024} MB`);
  if (rule.mediaType === "PDF") {
    const text = Buffer.from(bytes).toString("latin1");
    if (!text.trimEnd().endsWith("%%EOF") || /\/(?:JavaScript|JS|OpenAction|AA|Launch|EmbeddedFile|Encrypt)\b/.test(text)) throw new NiceJobsError("Use a complete PDF without scripts, automatic actions, encryption or embedded files");
  }
  return { filename, mime: detected.mime, mediaType: rule.mediaType, bytes: bytes.byteLength };
}
