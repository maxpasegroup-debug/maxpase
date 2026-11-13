import { describe, expect, it } from "vitest";
import { creditedPlaybackSeconds, isValidPublishedIntroduction, playbackCompletionAllowed } from "../../src/server/nicejobs/intro-media-rules";

describe("NICEJOBS introduction publication and completion gates", () => {
  it("accepts published audio and video with a valid thumbnail and bounded duration", () => {
    const publishedAt = new Date();
    for (const mediaType of ["AUDIO", "VIDEO"]) expect(isValidPublishedIntroduction({ publishedAt, publishedMediaType: mediaType, publishedDurationSeconds: 45 }, mediaType, "IMAGE")).toBe(true);
  });
  it("keeps an already-published legacy video available during migration without a thumbnail", () => {
    expect(isValidPublishedIntroduction({ publishedAt: new Date(), publishedMediaType: "VIDEO", publishedDurationSeconds: 60 }, "VIDEO", null)).toBe(true);
    expect(isValidPublishedIntroduction({ publishedAt: new Date(), publishedMediaType: "AUDIO", publishedDurationSeconds: 60 }, "AUDIO", null)).toBe(false);
  });
  it("hides unpublished, incomplete, mismatched, and invalid-duration introductions", () => {
    expect(isValidPublishedIntroduction({ publishedAt: null, publishedMediaType: "VIDEO", publishedDurationSeconds: 45 }, "VIDEO", "IMAGE")).toBe(false);
    expect(isValidPublishedIntroduction({ publishedAt: new Date(), publishedMediaType: "AUDIO", publishedDurationSeconds: 45 }, "VIDEO", "IMAGE")).toBe(false);
    expect(isValidPublishedIntroduction({ publishedAt: new Date(), publishedMediaType: "AUDIO", publishedDurationSeconds: 45 }, "AUDIO", null)).toBe(false);
    expect(isValidPublishedIntroduction({ publishedAt: new Date(), publishedMediaType: "AUDIO", publishedDurationSeconds: 1801 }, "AUDIO", "IMAGE")).toBe(false);
  });
  it("credits only plausible forward playback and rejects seeks or long heartbeat gaps", () => {
    expect(creditedPlaybackSeconds(4, 4)).toBe(4);
    expect(creditedPlaybackSeconds(4, 20)).toBe(0);
    expect(creditedPlaybackSeconds(4, -1)).toBe(0);
    expect(creditedPlaybackSeconds(12, 12)).toBe(0);
  });
  it("requires server credited time and end position before issuing completion", () => {
    expect(playbackCompletionAllowed(60, 58, 58)).toBe(true);
    expect(playbackCompletionAllowed(60, 57, 60)).toBe(false);
    expect(playbackCompletionAllowed(60, 60, 57)).toBe(false);
  });
});

