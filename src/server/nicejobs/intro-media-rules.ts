export type IntroPublicationShape = { publishedAt: Date | null; publishedMediaType: string | null; publishedDurationSeconds: number | null };
export function isValidPublishedIntroduction(intro: IntroPublicationShape, mediaType: string | null, thumbnailType: string | null) {
  const thumbnailValid = intro.publishedMediaType === "VIDEO" ? thumbnailType === null || thumbnailType === "IMAGE" : thumbnailType === "IMAGE";
  return Boolean(intro.publishedAt && (intro.publishedMediaType === "AUDIO" || intro.publishedMediaType === "VIDEO") && mediaType === intro.publishedMediaType && thumbnailValid && Number.isInteger(intro.publishedDurationSeconds) && intro.publishedDurationSeconds! >= 3 && intro.publishedDurationSeconds! <= 1800);
}
export function creditedPlaybackSeconds(elapsedSeconds: number, positionAdvance: number) {
  if (!Number.isFinite(elapsedSeconds) || !Number.isFinite(positionAdvance) || elapsedSeconds < 2 || elapsedSeconds > 8 || positionAdvance < elapsedSeconds * 0.45 || positionAdvance > elapsedSeconds * 1.5 + 0.75) return 0;
  return Math.floor(Math.min(elapsedSeconds, positionAdvance));
}
export function playbackCompletionAllowed(durationSeconds: number, creditedSeconds: number, positionSeconds: number) {
  return Number.isInteger(durationSeconds) && durationSeconds >= 3 && creditedSeconds >= durationSeconds - 2 && positionSeconds >= durationSeconds - 2;
}
