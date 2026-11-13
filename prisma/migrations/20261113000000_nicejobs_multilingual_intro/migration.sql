CREATE TABLE "NiceJobsPortalIntroduction" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "languageCode" TEXT NOT NULL,
  "languageName" TEXT NOT NULL,
  "title" TEXT NOT NULL DEFAULT 'Introduction to NICEJOBS',
  "draftAudioFileId" TEXT,
  "draftAudioThumbnailFileId" TEXT,
  "draftAudioDurationSeconds" INTEGER,
  "draftVideoFileId" TEXT,
  "draftVideoThumbnailFileId" TEXT,
  "draftVideoDurationSeconds" INTEGER,
  "publishedMediaFileId" TEXT,
  "publishedMediaType" TEXT,
  "publishedThumbnailFileId" TEXT,
  "publishedDurationSeconds" INTEGER,
  "publishedAt" TIMESTAMP(3),
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NiceJobsPortalIntroduction_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "NiceJobsPortalIntroduction_companyId_languageCode_key" ON "NiceJobsPortalIntroduction"("companyId", "languageCode");
CREATE UNIQUE INDEX "NiceJobsPortalIntroduction_companyId_languageName_key" ON "NiceJobsPortalIntroduction"("companyId", "languageName");
CREATE INDEX "NiceJobsPortalIntroduction_companyId_publishedAt_languageCode_idx" ON "NiceJobsPortalIntroduction"("companyId", "publishedAt", "languageCode");
CREATE TABLE "NiceJobsIntroPlaybackSession" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "languageCode" TEXT NOT NULL,
  "mediaFileId" TEXT NOT NULL,
  "durationSeconds" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PLAYING',
  "creditedSeconds" INTEGER NOT NULL DEFAULT 0,
  "lastPositionSeconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "lastHeartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NiceJobsIntroPlaybackSession_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "NiceJobsIntroPlaybackSession_tokenHash_key" ON "NiceJobsIntroPlaybackSession"("tokenHash");
CREATE INDEX "NiceJobsIntroPlaybackSession_status_expiresAt_idx" ON "NiceJobsIntroPlaybackSession"("status", "expiresAt");
INSERT INTO "NiceJobsPortalIntroduction" ("id", "companyId", "languageCode", "languageName", "title", "updatedAt")
SELECT gen_random_uuid()::text, id, 'en', 'English', 'Introduction to NICEJOBS', CURRENT_TIMESTAMP FROM "Organization" WHERE slug = 'aira-skill-city'
ON CONFLICT ("companyId", "languageCode") DO NOTHING;
INSERT INTO "NiceJobsPortalIntroduction" ("id", "companyId", "languageCode", "languageName", "title", "updatedAt")
SELECT gen_random_uuid()::text, id, 'ml', 'Malayalam', 'Introduction to NICEJOBS', CURRENT_TIMESTAMP FROM "Organization" WHERE slug = 'aira-skill-city'
ON CONFLICT ("companyId", "languageCode") DO NOTHING;
INSERT INTO "NiceJobsPortalIntroduction" ("id", "companyId", "languageCode", "languageName", "title", "updatedAt")
SELECT gen_random_uuid()::text, id, 'ta', 'Tamil', 'Introduction to NICEJOBS', CURRENT_TIMESTAMP FROM "Organization" WHERE slug = 'aira-skill-city'
ON CONFLICT ("companyId", "languageCode") DO NOTHING;
INSERT INTO "NiceJobsPortalIntroduction" ("id", "companyId", "languageCode", "languageName", "title", "updatedAt")
SELECT gen_random_uuid()::text, id, 'kn', 'Kannada', 'Introduction to NICEJOBS', CURRENT_TIMESTAMP FROM "Organization" WHERE slug = 'aira-skill-city'
ON CONFLICT ("companyId", "languageCode") DO NOTHING;
INSERT INTO "NiceJobsPortalIntroduction" ("id", "companyId", "languageCode", "languageName", "title", "updatedAt")
SELECT gen_random_uuid()::text, id, 'hi', 'Hindi', 'Introduction to NICEJOBS', CURRENT_TIMESTAMP FROM "Organization" WHERE slug = 'aira-skill-city'
ON CONFLICT ("companyId", "languageCode") DO NOTHING;
UPDATE "NiceJobsPortalIntroduction" i SET "publishedMediaFileId" = s."introVideoFileId", "publishedMediaType" = 'VIDEO', "publishedDurationSeconds" = 60, "publishedAt" = CURRENT_TIMESTAMP, "title" = s."introVideoTitle", "updatedAt" = CURRENT_TIMESTAMP
FROM "NiceJobsPortalSetting" s WHERE s."companyId" = i."companyId" AND s."id" = 'nice-jobs' AND i."languageCode" = 'en' AND s."introVideoFileId" IS NOT NULL;
