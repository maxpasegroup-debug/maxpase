-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."OrganizationType" AS ENUM ('GROUP', 'COMPANY', 'DIVISION', 'BUSINESS_UNIT', 'DEPARTMENT', 'TEAM', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."LifecycleStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "public"."MembershipStatus" AS ENUM ('INVITED', 'ACTIVE', 'INACTIVE', 'SUSPENDED', 'ENDED');

-- CreateEnum
CREATE TYPE "public"."PermissionScope" AS ENUM ('GLOBAL', 'GROUP', 'COMPANY', 'DIVISION', 'DEPARTMENT', 'TEAM', 'PROJECT');

-- CreateEnum
CREATE TYPE "public"."AuditResult" AS ENUM ('SUCCESS', 'FAILURE', 'DENIED');

-- CreateEnum
CREATE TYPE "public"."TaskStatus" AS ENUM ('BACKLOG', 'TODO', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."ProjectStatus" AS ENUM ('PLANNED', 'ACTIVE', 'PAUSED', 'BLOCKED', 'COMPLETED', 'CANCELLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "public"."GoalStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'AT_RISK', 'MISSED', 'ARCHIVED', 'ACHIEVED', 'CANCELLED');

-- CreateTable
CREATE TABLE "public"."NiceJobsIncentivePolicy" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "divisionId" TEXT NOT NULL,
    "jobVersionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NiceJobsIncentivePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NiceJobsIncentiveVersion" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "ownerUserId" TEXT NOT NULL,
    "reviewerUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "currency" TEXT NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "definition" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NiceJobsIncentiveVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NiceJobsIncentiveEarning" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "policyVersionId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL,
    "amountMinor" BIGINT,
    "eligibility" TEXT NOT NULL,
    "calculation" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CALCULATED',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "requestId" TEXT,
    "creatorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NiceJobsIncentiveEarning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NiceJobsWallet" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "creatorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NiceJobsWallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NiceJobsWalletAdjustment" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "policyVersionId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "privateNote" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "requestId" TEXT,
    "creatorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NiceJobsWalletAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NiceJobsWalletReversalProposal" (
    "id" TEXT NOT NULL,
    "adjustmentId" TEXT NOT NULL,
    "ledgerId" TEXT NOT NULL,

    CONSTRAINT "NiceJobsWalletReversalProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NiceJobsWalletLedger" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "earningId" TEXT,
    "adjustmentId" TEXT,
    "statementId" TEXT,
    "reversesId" TEXT,
    "reference" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NiceJobsWalletLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NiceJobsSettlementPeriod" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "policyVersionId" TEXT NOT NULL,
    "from" TIMESTAMP(3) NOT NULL,
    "until" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "requestId" TEXT,
    "creatorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "NiceJobsSettlementPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NiceJobsSettlementStatement" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "snapshot" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REVIEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NiceJobsSettlementStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NiceJobsSettlementLine" (
    "id" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "ledgerId" TEXT NOT NULL,
    "activeLedgerId" TEXT,
    "amountMinor" BIGINT NOT NULL,

    CONSTRAINT "NiceJobsSettlementLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NiceJobsPayoutIntent" (
    "id" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROVIDER_NOT_CONFIGURED',
    "reference" TEXT NOT NULL,
    "providerReference" TEXT,
    "creatorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NiceJobsPayoutIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NiceJobsFinanceException" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "divisionId" TEXT NOT NULL,
    "walletId" TEXT,
    "code" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NiceJobsFinanceException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NiceJobsPerformanceFramework" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "divisionId" TEXT NOT NULL,
    "jobVersionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NiceJobsPerformanceFramework_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NiceJobsPerformanceVersion" (
    "id" TEXT NOT NULL,
    "frameworkId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "ownerUserId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "definition" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NiceJobsPerformanceVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NiceJobsPerformanceSnapshot" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "frameworkVersionId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "supersedesId" TEXT,
    "correctionReason" TEXT,
    "results" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "generatedByUserId" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NiceJobsPerformanceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NiceJobsPerformanceReview" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "reviewerUserId" TEXT NOT NULL,
    "feedback" TEXT NOT NULL,
    "privateNote" TEXT,
    "released" BOOLEAN NOT NULL DEFAULT false,
    "followup" TEXT,
    "supportTaskId" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NiceJobsPerformanceReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NiceJobsPerformanceAttention" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "metricKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "NiceJobsPerformanceAttention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NiceJobsPip" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "workerMessage" TEXT NOT NULL,
    "privateNote" TEXT,
    "objectives" TEXT NOT NULL,
    "supportActions" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "reviewAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "released" BOOLEAN NOT NULL DEFAULT false,
    "requiredAck" BOOLEAN NOT NULL DEFAULT false,
    "acknowledgedAt" TIMESTAMP(3),
    "outcome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NiceJobsPip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NiceJobsPipReview" (
    "id" TEXT NOT NULL,
    "pipId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "progress" TEXT,
    "comment" TEXT NOT NULL,
    "privateNote" TEXT,
    "evidence" TEXT NOT NULL,
    "nextAction" TEXT,
    "released" BOOLEAN NOT NULL DEFAULT false,
    "changeSnapshot" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NiceJobsPipReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NiceJobsKnowledge" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NiceJobsKnowledge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NiceJobsKnowledgeVersion" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "current" BOOLEAN NOT NULL DEFAULT false,
    "organizationId" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'WORKER',
    "jobId" TEXT,
    "jobVersionId" TEXT,
    "assignmentId" TEXT,
    "managerId" TEXT,
    "ownerUserId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "captions" TEXT NOT NULL DEFAULT '',
    "transcript" TEXT NOT NULL DEFAULT '',
    "purpose" TEXT NOT NULL,
    "body" TEXT,
    "resourceType" TEXT,
    "url" TEXT,
    "privateReference" TEXT,
    "communicationType" TEXT,
    "communicationTemplateId" TEXT,
    "relatedVersionId" TEXT,
    "requiredAck" BOOLEAN NOT NULL DEFAULT false,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "effectiveAt" TIMESTAMP(3),
    "reviewAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "scheduledAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NiceJobsKnowledgeVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NiceJobsContentFile" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "uploaderUserId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "digest" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NiceJobsContentFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NiceJobsSopStep" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "instruction" TEXT NOT NULL,
    "checklist" TEXT,
    "warning" TEXT,
    "escalation" TEXT,
    "resourceVersionId" TEXT,
    "taskId" TEXT,

    CONSTRAINT "NiceJobsSopStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NiceJobsKnowledgeReceipt" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "evidenceReference" TEXT,

    CONSTRAINT "NiceJobsKnowledgeReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NiceJobsKnowledgeWorkLink" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "taskId" TEXT,
    "leadId" TEXT,
    "followupId" TEXT,

    CONSTRAINT "NiceJobsKnowledgeWorkLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NiceJobsTemplate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "visibility" TEXT NOT NULL DEFAULT 'INTERNAL',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "publishedVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NiceJobsTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NiceJobsVersion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "engagement" TEXT NOT NULL DEFAULT 'PART_TIME_INCENTIVE',
    "context" TEXT,
    "configuration" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NiceJobsVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NiceJobsVersionArea" (
    "versionId" TEXT NOT NULL,
    "divisionId" TEXT NOT NULL,

    CONSTRAINT "NiceJobsVersionArea_pkey" PRIMARY KEY ("versionId","divisionId")
);

-- CreateTable
CREATE TABLE "public"."NiceJobsWorkerProfile" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NiceJobsWorkerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NiceJobsAssignment" (
    "onboardingId" TEXT,
    "readinessReviewId" TEXT,
    "activatedAt" TIMESTAMP(3),
    "activatedByUserId" TEXT,
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "divisionId" TEXT NOT NULL,
    "managerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PREPARED',
    "lifecycle" TEXT NOT NULL DEFAULT 'APPLICANT',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NiceJobsAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NiceJobsDailyReport" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "reportDate" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "supersedesId" TEXT,
    "taskSnapshot" TEXT NOT NULL,
    "operationalSnapshot" TEXT,
    "blockerSnapshot" TEXT NOT NULL,
    "notes" TEXT,
    "correctionReason" TEXT,
    "submittedByUserId" TEXT NOT NULL,
    "submittedByPersonId" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NiceJobsDailyReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NiceJobsLeadPolicy" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "divisionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "allowedSources" TEXT NOT NULL,
    "followupRequiredStates" TEXT NOT NULL,
    "claimAllowed" BOOLEAN NOT NULL DEFAULT false,
    "unassignAllowed" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NiceJobsLeadPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NiceJobsLeadEligibility" (
    "policyId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,

    CONSTRAINT "NiceJobsLeadEligibility_pkey" PRIMARY KEY ("policyId","versionId")
);

-- CreateTable
CREATE TABLE "public"."NiceJobsLead" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "divisionId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "workflowInstanceId" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "location" TEXT,
    "metadata" TEXT,
    "source" TEXT NOT NULL,
    "externalReference" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "currentWorkerAssignmentId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NiceJobsLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NiceJobsLeadAssignment" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "workerAssignmentId" TEXT NOT NULL,
    "assignedByUserId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unassignedAt" TIMESTAMP(3),
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "NiceJobsLeadAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NiceJobsLeadActivity" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "workerAssignmentId" TEXT,
    "kind" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'WORKER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NiceJobsLeadActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NiceJobsLeadFollowup" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "assignmentHistoryId" TEXT NOT NULL,
    "workerAssignmentId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "outcome" TEXT,
    "nextAction" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NiceJobsLeadFollowup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TaskEvidence" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorPersonId" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NiceJobsApplication" (
    "reviewRequestId" TEXT,
    "reviewNeedsMore" BOOLEAN NOT NULL DEFAULT false,
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "applicationId" TEXT,
    "candidateId" TEXT NOT NULL,
    "creatorUserId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "divisionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "eligibilityStatus" TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
    "screeningStatus" TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
    "answers" TEXT NOT NULL DEFAULT '{}',
    "candidateMessage" TEXT,
    "activeKey" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NiceJobsApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NiceJobsApplicationSequence" (
    "year" INTEGER NOT NULL,
    "value" INTEGER NOT NULL,

    CONSTRAINT "NiceJobsApplicationSequence_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "public"."NiceJobsApplicationHistory" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "eventId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "previousState" TEXT NOT NULL,
    "nextState" TEXT NOT NULL,
    "internalReason" TEXT,
    "candidateMessage" TEXT,
    "evidence" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NiceJobsApplicationHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NiceJobsInterview" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "scheduledAt" TIMESTAMP(3),
    "duration" INTEGER NOT NULL,
    "location" TEXT,
    "instructions" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NiceJobsInterview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NiceJobsInterviewer" (
    "interviewId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,

    CONSTRAINT "NiceJobsInterviewer_pkey" PRIMARY KEY ("interviewId","userId")
);

-- CreateTable
CREATE TABLE "public"."NiceJobsInterviewEvaluation" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "answers" TEXT NOT NULL,
    "scores" TEXT NOT NULL,
    "weightedScore" DOUBLE PRECISION NOT NULL,
    "notes" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NiceJobsInterviewEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NiceJobsOffer" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "snapshot" TEXT NOT NULL,
    "activeKey" TEXT,
    "issuedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "viewedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "declineReason" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NiceJobsOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NiceJobsTrainingPlan" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "configuration" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NiceJobsTrainingPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NiceJobsOnboarding" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "readinessStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "reviewerUserId" TEXT,
    "reviewerPersonId" TEXT,
    "readinessReviewerUserId" TEXT,
    "readinessReviewerPersonId" TEXT,
    "startedAt" TIMESTAMP(3),
    "orientationCompletedAt" TIMESTAMP(3),
    "ojtStartedAt" TIMESTAMP(3),
    "ojtCompletedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NiceJobsOnboarding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NiceJobsTrainingProgress" (
    "id" TEXT NOT NULL,
    "onboardingId" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "dueAt" TIMESTAMP(3),
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "NiceJobsTrainingProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NiceJobsTrainingSubmission" (
    "id" TEXT NOT NULL,
    "progressId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "data" TEXT NOT NULL,
    "result" TEXT NOT NULL DEFAULT 'PENDING',
    "score" DOUBLE PRECISION,
    "actorUserId" TEXT NOT NULL,
    "actorPersonId" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NiceJobsTrainingSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NiceJobsTrainingReview" (
    "id" TEXT NOT NULL,
    "onboardingId" TEXT NOT NULL,
    "submissionId" TEXT,
    "kind" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "privateNotes" TEXT NOT NULL,
    "feedback" TEXT,
    "requirements" TEXT,
    "reviewerUserId" TEXT NOT NULL,
    "reviewerPersonId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NiceJobsTrainingReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SecurityRateBucket" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SecurityRateBucket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Integration" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "creatorUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "configuration" TEXT NOT NULL,
    "credentialReference" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CommunicationPolicy" (
    "projectId" TEXT,
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "configuration" TEXT NOT NULL,
    "controlPointId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunicationPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CommunicationConsent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunicationConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CommunicationTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ownerPersonId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "variables" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunicationTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CommunicationThread" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT,
    "integrationId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "participants" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunicationThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CommunicationMessage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT,
    "threadId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "policyId" TEXT,
    "consentId" TEXT NOT NULL,
    "templateId" TEXT,
    "requestId" TEXT,
    "creatorUserId" TEXT,
    "creatorPersonId" TEXT,
    "siaId" TEXT,
    "channel" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'TEXT',
    "sender" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT,
    "content" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "sensitivity" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" TEXT NOT NULL DEFAULT 'APPROVAL_REQUIRED',
    "externalReference" TEXT,
    "reference" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "approvalBinding" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "nextRetryAt" TIMESTAMP(3),
    "retryable" BOOLEAN NOT NULL DEFAULT false,
    "failureCode" TEXT,
    "simulated" BOOLEAN NOT NULL DEFAULT false,
    "confirmedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunicationMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."IntegrationEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "failureCode" TEXT,
    "operationalEventId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "occurredAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AutomationRule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "ownerPersonId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "trigger" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "lifecycle" TEXT NOT NULL DEFAULT 'LEGACY',
    "description" TEXT,
    "divisionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ScheduledJob" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'AUTOMATION_SCAN',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "intervalMinutes" INTEGER NOT NULL,
    "maxRuns" INTEGER NOT NULL,
    "runs" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "scanCursor" TEXT,
    "scanStartedAt" TIMESTAMP(3),
    "scanRuleVersion" INTEGER,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "failureCode" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AutomationRun" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "resultId" TEXT,
    "failureCode" TEXT,
    "workflowVersionId" TEXT,
    "sourceEventId" TEXT,
    "correlationId" TEXT,
    "actorUserId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "nextRetryAt" TIMESTAMP(3),
    "failureClass" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "evidence" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NiceJobsAutomationVersion" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "definition" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "reviewedByUserId" TEXT,
    "reviewedByPersonId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NiceJobsAutomationVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NiceJobsOperationalException" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "divisionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "sourceEventId" TEXT,
    "ownerUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "nextAction" TEXT NOT NULL,
    "resolutionEvidence" TEXT,
    "acknowledgedByUserId" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "revision" INTEGER NOT NULL DEFAULT 0,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NiceJobsOperationalException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CommunicationRateBucket" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunicationRateBucket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "jobsPhone" TEXT,
    "jobsPinHash" TEXT,
    "jobsPhoneVerifiedAt" TIMESTAMP(3),
    "emailVerifiedAt" TIMESTAMP(3),
    "timezone" TEXT,
    "status" "public"."LifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "personId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EmailAuthChallenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "otpHash" TEXT NOT NULL,
    "credentialHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "providerRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailAuthChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Person" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "legalName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "status" "public"."LifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "profile" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Organization" (
    "id" TEXT NOT NULL,
    "type" "public"."OrganizationType" NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "status" "public"."LifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "parentId" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GroupProfile" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "public"."LifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CompanyProfile" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "groupId" TEXT,
    "legalName" TEXT,
    "displayName" TEXT NOT NULL,
    "shortName" TEXT,
    "companyType" TEXT,
    "country" TEXT,
    "region" TEXT,
    "description" TEXT,
    "identifiers" TEXT,
    "status" "public"."LifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CompanyRelationship" (
    "id" TEXT NOT NULL,
    "fromCompanyId" TEXT NOT NULL,
    "toCompanyId" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "status" "public"."LifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OwnershipRelationship" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ownerPersonId" TEXT,
    "ownerOrgId" TEXT,
    "percentage" DOUBLE PRECISION,
    "ownershipType" TEXT NOT NULL DEFAULT 'UNSPECIFIED',
    "notes" TEXT,
    "status" "public"."LifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OwnershipRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DepartmentProfile" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepartmentProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TeamProfile" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Brand" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "status" "public"."LifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "metadata" TEXT,
    "website" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Product" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "divisionId" TEXT,
    "brandId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'PRODUCT',
    "lifecycle" TEXT NOT NULL DEFAULT 'CONCEPT',
    "status" "public"."LifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Project" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "programId" TEXT,
    "productId" TEXT,
    "brandId" TEXT,
    "ownerPersonId" TEXT,
    "accountablePersonId" TEXT,
    "completionDate" TIMESTAMP(3),
    "health" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "startDate" TIMESTAMP(3),
    "targetDate" TIMESTAMP(3),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "status" "public"."ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ExecutiveRecord" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT,
    "ownerPersonId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "dueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExecutiveRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LabsCustomerGrant" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "customerUserId" TEXT NOT NULL,
    "issuedByUserId" TEXT NOT NULL,
    "verificationEvidence" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "LabsCustomerGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ExecutiveHistory" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "observation" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExecutiveHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Goal" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "programId" TEXT,
    "projectId" TEXT,
    "productId" TEXT,
    "ownerPersonId" TEXT,
    "accountablePersonId" TEXT,
    "parentGoalId" TEXT,
    "startDate" TIMESTAMP(3),
    "completionDate" TIMESTAMP(3),
    "progressMode" TEXT NOT NULL DEFAULT 'MANUAL',
    "description" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "targetDate" TIMESTAMP(3),
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "status" "public"."GoalStatus" NOT NULL DEFAULT 'DRAFT',
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Task" (
    "niceJobsAssignmentId" TEXT,
    "evidenceRequired" BOOLEAN NOT NULL DEFAULT false,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT,
    "goalId" TEXT,
    "milestoneId" TEXT,
    "description" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "ownerPersonId" TEXT,
    "assigneePersonId" TEXT,
    "creatorPersonId" TEXT,
    "startDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "completionDate" TIMESTAMP(3),
    "estimatedHours" DOUBLE PRECISION,
    "title" TEXT NOT NULL,
    "status" "public"."TaskStatus" NOT NULL DEFAULT 'TODO',
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Milestone" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "public"."ProjectStatus" NOT NULL DEFAULT 'PLANNED',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "ownerPersonId" TEXT,
    "targetDate" TIMESTAMP(3),
    "completionDate" TIMESTAMP(3),
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Milestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TaskDependency" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "prerequisiteId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskDependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProgressUpdate" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "actorPersonId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgressUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ExecutionBlocker" (
    "niceJobsLeadId" TEXT,
    "niceJobsAssignmentId" TEXT,
    "reporterUserId" TEXT,
    "reason" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT,
    "taskId" TEXT,
    "goalId" TEXT,
    "description" TEXT NOT NULL,
    "ownerPersonId" TEXT,
    "dependencyTaskId" TEXT,
    "expectedResolution" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExecutionBlocker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Membership" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT,
    "scopeKey" TEXT NOT NULL DEFAULT 'organization',
    "title" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "scope" TEXT NOT NULL DEFAULT 'ORGANIZATION',
    "status" "public"."MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Role" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "system" BOOLEAN NOT NULL DEFAULT false,
    "canonical" BOOLEAN NOT NULL DEFAULT false,
    "category" TEXT,
    "principalType" TEXT NOT NULL DEFAULT 'HUMAN',
    "status" "public"."LifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Permission" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scope" "public"."PermissionScope" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RolePermission" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MembershipRole" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MembershipRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AuditEvent" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorPersonId" TEXT,
    "organizationId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "result" "public"."AuditResult" NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SystemConfiguration" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SiaIdentity" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'SIA',
    "title" TEXT NOT NULL DEFAULT 'MAXPASE GROUP Virtual CEO',
    "status" "public"."LifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "metadata" TEXT,
    "description" TEXT,
    "configuration" TEXT,
    "configurationVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiaIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NexaIdentity" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "public"."LifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NexaIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NexaDirective" (
    "id" TEXT NOT NULL,
    "nexaId" TEXT NOT NULL,
    "bossUserId" TEXT NOT NULL,
    "directorUserId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siaId" TEXT,
    "actionId" TEXT,
    "bossInstruction" TEXT NOT NULL,
    "groupPlan" TEXT NOT NULL,
    "directorBrief" TEXT NOT NULL,
    "siaPreparation" TEXT,
    "decisionReason" TEXT,
    "outcome" TEXT NOT NULL DEFAULT 'AWAITING_DIRECTOR',
    "status" TEXT NOT NULL DEFAULT 'DIRECTOR_REVIEW',
    "version" INTEGER NOT NULL DEFAULT 0,
    "idempotencyKey" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3),
    "preparedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NexaDirective_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ReportingRelationship" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "managerPersonId" TEXT NOT NULL,
    "status" "public"."LifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportingRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Responsibility" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "projectId" TEXT,
    "productId" TEXT,
    "goalId" TEXT,
    "taskId" TEXT,
    "milestoneId" TEXT,
    "programId" TEXT,
    "batchId" TEXT,
    "locationId" TEXT,
    "teamId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'RESPONSIBLE',
    "title" TEXT NOT NULL,
    "status" "public"."LifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Responsibility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Program" (
    "id" TEXT NOT NULL,
    "companyOrganizationId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'PROGRAM',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "durationDays" INTEGER,
    "capacity" INTEGER,
    "priceMinor" INTEGER,
    "currency" TEXT,
    "brandId" TEXT,
    "productId" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Program_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Batch" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "capacity" INTEGER,
    "locationId" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Location" (
    "id" TEXT NOT NULL,
    "companyOrganizationId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'OTHER',
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "address" TEXT,
    "city" TEXT,
    "region" TEXT,
    "country" TEXT,
    "postalCode" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BatchParticipant" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BatchParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SiaRoleAssignment" (
    "id" TEXT NOT NULL,
    "siaId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "includeDescendants" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiaRoleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SiaContext" (
    "id" TEXT NOT NULL,
    "siaId" TEXT NOT NULL,
    "organizationId" TEXT,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'LEGACY',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "projectId" TEXT,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "ownerPersonId" TEXT,
    "confidence" DOUBLE PRECISION,
    "reviewAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiaContext_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SiaRun" (
    "id" TEXT NOT NULL,
    "siaId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "toolKey" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "failureCode" TEXT,
    "latencyMs" INTEGER,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "estimatedCost" DOUBLE PRECISION,
    "rationale" TEXT,
    "auditId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiaRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SiaAction" (
    "id" TEXT NOT NULL,
    "siaId" TEXT NOT NULL,
    "requesterUserId" TEXT NOT NULL,
    "requesterPersonId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT,
    "toolKey" TEXT NOT NULL,
    "parameters" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "risk" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "authorization" TEXT NOT NULL DEFAULT 'PENDING',
    "approvalRequired" BOOLEAN NOT NULL DEFAULT true,
    "requestId" TEXT,
    "resultId" TEXT,
    "verificationStatus" TEXT NOT NULL DEFAULT 'NOT_RUN',
    "failureCode" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "auditId" TEXT,
    "executedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiaAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SiaGoal" (
    "id" TEXT NOT NULL,
    "siaId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "public"."GoalStatus" NOT NULL DEFAULT 'DRAFT',
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiaGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SiaTool" (
    "id" TEXT NOT NULL,
    "siaId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissionKey" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiaTool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SiaApproval" (
    "id" TEXT NOT NULL,
    "siaId" TEXT,
    "requestId" TEXT,
    "stageIndex" INTEGER NOT NULL DEFAULT 0,
    "approverUserId" TEXT,
    "decidedByUserId" TEXT,
    "requiredPermission" TEXT NOT NULL DEFAULT 'approval.decide',
    "comment" TEXT,
    "decidedAt" TIMESTAMP(3),
    "requestedByUserId" TEXT,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiaApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OperationalEvent" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "actorUserId" TEXT,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUCCEEDED',
    "reference" TEXT NOT NULL,
    "correlationId" TEXT,
    "metadata" TEXT,
    "auditId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationalEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkflowDefinition" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT,
    "scopeKey" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkflowState" (
    "id" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "initial" BOOLEAN NOT NULL DEFAULT false,
    "terminal" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "WorkflowState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkflowTransition" (
    "id" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "fromStateId" TEXT NOT NULL,
    "toStateId" TEXT NOT NULL,
    "requiredPermission" TEXT NOT NULL,
    "requireReason" BOOLEAN NOT NULL DEFAULT false,
    "controlPointId" TEXT,

    CONSTRAINT "WorkflowTransition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkflowInstance" (
    "id" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "creatorUserId" TEXT NOT NULL,
    "currentStateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkflowHistory" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "transitionId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "fromState" TEXT NOT NULL,
    "toState" TEXT NOT NULL,
    "reason" TEXT,
    "instanceVersion" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ControlPoint" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "requiredPermission" TEXT NOT NULL,
    "allowSelfApproval" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ControlPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ApprovalRule" (
    "id" TEXT NOT NULL,
    "controlPointId" TEXT NOT NULL,
    "stageIndex" INTEGER NOT NULL,
    "approverUserId" TEXT NOT NULL,
    "requiredPermission" TEXT NOT NULL,

    CONSTRAINT "ApprovalRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OperationalRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'GENERAL',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "requesterUserId" TEXT NOT NULL,
    "controlPointId" TEXT NOT NULL,
    "workflowInstanceId" TEXT,
    "instanceVersion" INTEGER,
    "siaId" TEXT,
    "toolKey" TEXT,
    "payload" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "expiresAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "idempotencyKey" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ControlCheck" (
    "id" TEXT NOT NULL,
    "controlPointId" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "instanceVersion" INTEGER NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ControlCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Notification" (
    "id" TEXT NOT NULL,
    "recipientUserId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "reference" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Reminder" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "recipientUserId" TEXT NOT NULL,
    "remindAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMP(3),
    "failureCode" TEXT,
    "reference" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RecurringWork" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "definitionId" TEXT,
    "template" TEXT,
    "frequency" TEXT NOT NULL,
    "interval" INTEGER NOT NULL DEFAULT 1,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "startAt" TIMESTAMP(3) NOT NULL,
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "occurrences" INTEGER NOT NULL DEFAULT 0,
    "maxOccurrences" INTEGER NOT NULL,
    "until" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "failureCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringWork_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RecurringOccurrence" (
    "id" TEXT NOT NULL,
    "recurringWorkId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "resultResourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecurringOccurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Escalation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "responsibleUserId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolvedAt" TIMESTAMP(3),
    "reference" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Escalation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NiceJobsIncentivePolicy_companyId_divisionId_jobVersionId_i_idx" ON "public"."NiceJobsIncentivePolicy"("companyId", "divisionId", "jobVersionId", "id");

-- CreateIndex
CREATE INDEX "NiceJobsIncentiveVersion_policyId_status_effectiveAt_id_idx" ON "public"."NiceJobsIncentiveVersion"("policyId", "status", "effectiveAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsIncentiveVersion_policyId_number_key" ON "public"."NiceJobsIncentiveVersion"("policyId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsIncentiveEarning_requestId_key" ON "public"."NiceJobsIncentiveEarning"("requestId");

-- CreateIndex
CREATE INDEX "NiceJobsIncentiveEarning_assignmentId_status_currency_id_idx" ON "public"."NiceJobsIncentiveEarning"("assignmentId", "status", "currency", "id");

-- CreateIndex
CREATE INDEX "NiceJobsIncentiveEarning_policyVersionId_status_id_idx" ON "public"."NiceJobsIncentiveEarning"("policyVersionId", "status", "id");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsIncentiveEarning_assignmentId_policyId_periodStart__key" ON "public"."NiceJobsIncentiveEarning"("assignmentId", "policyId", "periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsWallet_assignmentId_currency_key" ON "public"."NiceJobsWallet"("assignmentId", "currency");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsWalletAdjustment_requestId_key" ON "public"."NiceJobsWalletAdjustment"("requestId");

-- CreateIndex
CREATE INDEX "NiceJobsWalletAdjustment_walletId_status_id_idx" ON "public"."NiceJobsWalletAdjustment"("walletId", "status", "id");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsWalletReversalProposal_adjustmentId_key" ON "public"."NiceJobsWalletReversalProposal"("adjustmentId");

-- CreateIndex
CREATE INDEX "NiceJobsWalletReversalProposal_ledgerId_idx" ON "public"."NiceJobsWalletReversalProposal"("ledgerId");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsWalletLedger_earningId_key" ON "public"."NiceJobsWalletLedger"("earningId");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsWalletLedger_adjustmentId_key" ON "public"."NiceJobsWalletLedger"("adjustmentId");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsWalletLedger_statementId_key" ON "public"."NiceJobsWalletLedger"("statementId");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsWalletLedger_reversesId_key" ON "public"."NiceJobsWalletLedger"("reversesId");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsWalletLedger_reference_key" ON "public"."NiceJobsWalletLedger"("reference");

-- CreateIndex
CREATE INDEX "NiceJobsWalletLedger_walletId_type_createdAt_id_idx" ON "public"."NiceJobsWalletLedger"("walletId", "type", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsSettlementPeriod_requestId_key" ON "public"."NiceJobsSettlementPeriod"("requestId");

-- CreateIndex
CREATE INDEX "NiceJobsSettlementPeriod_policyVersionId_status_from_id_idx" ON "public"."NiceJobsSettlementPeriod"("policyVersionId", "status", "from", "id");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsSettlementPeriod_policyId_from_until_key" ON "public"."NiceJobsSettlementPeriod"("policyId", "from", "until");

-- CreateIndex
CREATE INDEX "NiceJobsSettlementStatement_walletId_status_id_idx" ON "public"."NiceJobsSettlementStatement"("walletId", "status", "id");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsSettlementStatement_periodId_walletId_key" ON "public"."NiceJobsSettlementStatement"("periodId", "walletId");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsSettlementLine_activeLedgerId_key" ON "public"."NiceJobsSettlementLine"("activeLedgerId");

-- CreateIndex
CREATE INDEX "NiceJobsSettlementLine_ledgerId_idx" ON "public"."NiceJobsSettlementLine"("ledgerId");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsSettlementLine_statementId_ledgerId_key" ON "public"."NiceJobsSettlementLine"("statementId", "ledgerId");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsPayoutIntent_statementId_key" ON "public"."NiceJobsPayoutIntent"("statementId");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsPayoutIntent_reference_key" ON "public"."NiceJobsPayoutIntent"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsPayoutIntent_providerReference_key" ON "public"."NiceJobsPayoutIntent"("providerReference");

-- CreateIndex
CREATE INDEX "NiceJobsPayoutIntent_status_createdAt_id_idx" ON "public"."NiceJobsPayoutIntent"("status", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsFinanceException_reference_key" ON "public"."NiceJobsFinanceException"("reference");

-- CreateIndex
CREATE INDEX "NiceJobsFinanceException_companyId_divisionId_createdAt_id_idx" ON "public"."NiceJobsFinanceException"("companyId", "divisionId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "NiceJobsPerformanceFramework_companyId_divisionId_jobVersio_idx" ON "public"."NiceJobsPerformanceFramework"("companyId", "divisionId", "jobVersionId", "id");

-- CreateIndex
CREATE INDEX "NiceJobsPerformanceVersion_frameworkId_status_effectiveAt_i_idx" ON "public"."NiceJobsPerformanceVersion"("frameworkId", "status", "effectiveAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsPerformanceVersion_frameworkId_number_key" ON "public"."NiceJobsPerformanceVersion"("frameworkId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsPerformanceSnapshot_supersedesId_key" ON "public"."NiceJobsPerformanceSnapshot"("supersedesId");

-- CreateIndex
CREATE INDEX "NiceJobsPerformanceSnapshot_assignmentId_periodEnd_id_idx" ON "public"."NiceJobsPerformanceSnapshot"("assignmentId", "periodEnd", "id");

-- CreateIndex
CREATE INDEX "NiceJobsPerformanceSnapshot_frameworkVersionId_status_perio_idx" ON "public"."NiceJobsPerformanceSnapshot"("frameworkVersionId", "status", "periodEnd", "id");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsPerformanceSnapshot_assignmentId_frameworkVersionId_key" ON "public"."NiceJobsPerformanceSnapshot"("assignmentId", "frameworkVersionId", "periodStart", "periodEnd", "revision");

-- CreateIndex
CREATE INDEX "NiceJobsPerformanceReview_snapshotId_released_id_idx" ON "public"."NiceJobsPerformanceReview"("snapshotId", "released", "id");

-- CreateIndex
CREATE INDEX "NiceJobsPerformanceAttention_status_snapshotId_id_idx" ON "public"."NiceJobsPerformanceAttention"("status", "snapshotId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsPerformanceAttention_snapshotId_metricKey_key" ON "public"."NiceJobsPerformanceAttention"("snapshotId", "metricKey");

-- CreateIndex
CREATE INDEX "NiceJobsPip_assignmentId_released_status_id_idx" ON "public"."NiceJobsPip"("assignmentId", "released", "status", "id");

-- CreateIndex
CREATE INDEX "NiceJobsPip_managerId_status_reviewAt_id_idx" ON "public"."NiceJobsPip"("managerId", "status", "reviewAt", "id");

-- CreateIndex
CREATE INDEX "NiceJobsPipReview_pipId_released_id_idx" ON "public"."NiceJobsPipReview"("pipId", "released", "id");

-- CreateIndex
CREATE INDEX "NiceJobsKnowledge_companyId_kind_idx" ON "public"."NiceJobsKnowledge"("companyId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsKnowledgeVersion_communicationTemplateId_key" ON "public"."NiceJobsKnowledgeVersion"("communicationTemplateId");

-- CreateIndex
CREATE INDEX "NiceJobsKnowledgeVersion_organizationId_visibility_status_c_idx" ON "public"."NiceJobsKnowledgeVersion"("organizationId", "visibility", "status", "current", "id");

-- CreateIndex
CREATE INDEX "NiceJobsKnowledgeVersion_jobId_jobVersionId_status_current_idx" ON "public"."NiceJobsKnowledgeVersion"("jobId", "jobVersionId", "status", "current");

-- CreateIndex
CREATE INDEX "NiceJobsKnowledgeVersion_assignmentId_managerId_status_curr_idx" ON "public"."NiceJobsKnowledgeVersion"("assignmentId", "managerId", "status", "current");

-- CreateIndex
CREATE INDEX "NiceJobsKnowledgeVersion_resourceType_status_current_id_idx" ON "public"."NiceJobsKnowledgeVersion"("resourceType", "status", "current", "id");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsKnowledgeVersion_contentId_number_key" ON "public"."NiceJobsKnowledgeVersion"("contentId", "number");

-- CreateIndex
CREATE INDEX "NiceJobsContentFile_companyId_organizationId_id_idx" ON "public"."NiceJobsContentFile"("companyId", "organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsContentFile_uploaderUserId_idempotencyKey_key" ON "public"."NiceJobsContentFile"("uploaderUserId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsSopStep_versionId_order_key" ON "public"."NiceJobsSopStep"("versionId", "order");

-- CreateIndex
CREATE INDEX "NiceJobsKnowledgeReceipt_assignmentId_readAt_acknowledgedAt_idx" ON "public"."NiceJobsKnowledgeReceipt"("assignmentId", "readAt", "acknowledgedAt", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsKnowledgeReceipt_versionId_assignmentId_key" ON "public"."NiceJobsKnowledgeReceipt"("versionId", "assignmentId");

-- CreateIndex
CREATE INDEX "NiceJobsKnowledgeWorkLink_taskId_idx" ON "public"."NiceJobsKnowledgeWorkLink"("taskId");

-- CreateIndex
CREATE INDEX "NiceJobsKnowledgeWorkLink_leadId_idx" ON "public"."NiceJobsKnowledgeWorkLink"("leadId");

-- CreateIndex
CREATE INDEX "NiceJobsKnowledgeWorkLink_followupId_idx" ON "public"."NiceJobsKnowledgeWorkLink"("followupId");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsKnowledgeWorkLink_versionId_taskId_key" ON "public"."NiceJobsKnowledgeWorkLink"("versionId", "taskId");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsKnowledgeWorkLink_versionId_leadId_key" ON "public"."NiceJobsKnowledgeWorkLink"("versionId", "leadId");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsKnowledgeWorkLink_versionId_followupId_key" ON "public"."NiceJobsKnowledgeWorkLink"("versionId", "followupId");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsTemplate_publishedVersionId_key" ON "public"."NiceJobsTemplate"("publishedVersionId");

-- CreateIndex
CREATE INDEX "NiceJobsTemplate_companyId_status_id_idx" ON "public"."NiceJobsTemplate"("companyId", "status", "id");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsTemplate_companyId_code_key" ON "public"."NiceJobsTemplate"("companyId", "code");

-- CreateIndex
CREATE INDEX "NiceJobsVersion_templateId_status_id_idx" ON "public"."NiceJobsVersion"("templateId", "status", "id");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsVersion_templateId_number_key" ON "public"."NiceJobsVersion"("templateId", "number");

-- CreateIndex
CREATE INDEX "NiceJobsVersionArea_divisionId_versionId_idx" ON "public"."NiceJobsVersionArea"("divisionId", "versionId");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsWorkerProfile_companyId_personId_key" ON "public"."NiceJobsWorkerProfile"("companyId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsAssignment_onboardingId_key" ON "public"."NiceJobsAssignment"("onboardingId");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsAssignment_readinessReviewId_key" ON "public"."NiceJobsAssignment"("readinessReviewId");

-- CreateIndex
CREATE INDEX "NiceJobsAssignment_divisionId_status_id_idx" ON "public"."NiceJobsAssignment"("divisionId", "status", "id");

-- CreateIndex
CREATE INDEX "NiceJobsAssignment_divisionId_id_idx" ON "public"."NiceJobsAssignment"("divisionId", "id");

-- CreateIndex
CREATE INDEX "NiceJobsAssignment_divisionId_lifecycle_id_idx" ON "public"."NiceJobsAssignment"("divisionId", "lifecycle", "id");

-- CreateIndex
CREATE INDEX "NiceJobsAssignment_profileId_status_id_idx" ON "public"."NiceJobsAssignment"("profileId", "status", "id");

-- CreateIndex
CREATE INDEX "NiceJobsAssignment_versionId_id_idx" ON "public"."NiceJobsAssignment"("versionId", "id");

-- CreateIndex
CREATE INDEX "NiceJobsAssignment_managerId_status_id_idx" ON "public"."NiceJobsAssignment"("managerId", "status", "id");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsAssignment_profileId_versionId_divisionId_key" ON "public"."NiceJobsAssignment"("profileId", "versionId", "divisionId");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsDailyReport_supersedesId_key" ON "public"."NiceJobsDailyReport"("supersedesId");

-- CreateIndex
CREATE INDEX "NiceJobsDailyReport_assignmentId_reportDate_id_idx" ON "public"."NiceJobsDailyReport"("assignmentId", "reportDate", "id");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsDailyReport_assignmentId_reportDate_revision_key" ON "public"."NiceJobsDailyReport"("assignmentId", "reportDate", "revision");

-- CreateIndex
CREATE INDEX "NiceJobsLeadPolicy_companyId_divisionId_status_id_idx" ON "public"."NiceJobsLeadPolicy"("companyId", "divisionId", "status", "id");

-- CreateIndex
CREATE INDEX "NiceJobsLeadEligibility_versionId_policyId_idx" ON "public"."NiceJobsLeadEligibility"("versionId", "policyId");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsLead_workflowInstanceId_key" ON "public"."NiceJobsLead"("workflowInstanceId");

-- CreateIndex
CREATE INDEX "NiceJobsLead_companyId_divisionId_id_idx" ON "public"."NiceJobsLead"("companyId", "divisionId", "id");

-- CreateIndex
CREATE INDEX "NiceJobsLead_companyId_divisionId_phone_idx" ON "public"."NiceJobsLead"("companyId", "divisionId", "phone");

-- CreateIndex
CREATE INDEX "NiceJobsLead_companyId_divisionId_email_idx" ON "public"."NiceJobsLead"("companyId", "divisionId", "email");

-- CreateIndex
CREATE INDEX "NiceJobsLead_currentWorkerAssignmentId_priority_id_idx" ON "public"."NiceJobsLead"("currentWorkerAssignmentId", "priority", "id");

-- CreateIndex
CREATE INDEX "NiceJobsLead_policyId_id_idx" ON "public"."NiceJobsLead"("policyId", "id");

-- CreateIndex
CREATE INDEX "NiceJobsLead_companyId_divisionId_source_createdAt_id_idx" ON "public"."NiceJobsLead"("companyId", "divisionId", "source", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsLead_companyId_divisionId_source_externalReference_key" ON "public"."NiceJobsLead"("companyId", "divisionId", "source", "externalReference");

-- CreateIndex
CREATE INDEX "NiceJobsLeadAssignment_leadId_status_id_idx" ON "public"."NiceJobsLeadAssignment"("leadId", "status", "id");

-- CreateIndex
CREATE INDEX "NiceJobsLeadAssignment_workerAssignmentId_assignedAt_id_idx" ON "public"."NiceJobsLeadAssignment"("workerAssignmentId", "assignedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsLeadActivity_eventId_key" ON "public"."NiceJobsLeadActivity"("eventId");

-- CreateIndex
CREATE INDEX "NiceJobsLeadActivity_leadId_visibility_id_idx" ON "public"."NiceJobsLeadActivity"("leadId", "visibility", "id");

-- CreateIndex
CREATE INDEX "NiceJobsLeadActivity_workerAssignmentId_kind_createdAt_lead_idx" ON "public"."NiceJobsLeadActivity"("workerAssignmentId", "kind", "createdAt", "leadId");

-- CreateIndex
CREATE INDEX "NiceJobsLeadFollowup_workerAssignmentId_status_scheduledAt__idx" ON "public"."NiceJobsLeadFollowup"("workerAssignmentId", "status", "scheduledAt", "id");

-- CreateIndex
CREATE INDEX "NiceJobsLeadFollowup_leadId_status_id_idx" ON "public"."NiceJobsLeadFollowup"("leadId", "status", "id");

-- CreateIndex
CREATE INDEX "TaskEvidence_taskId_actorPersonId_createdAt_idx" ON "public"."TaskEvidence"("taskId", "actorPersonId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsApplication_reviewRequestId_key" ON "public"."NiceJobsApplication"("reviewRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsApplication_reference_key" ON "public"."NiceJobsApplication"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsApplication_applicationId_key" ON "public"."NiceJobsApplication"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsApplication_activeKey_key" ON "public"."NiceJobsApplication"("activeKey");

-- CreateIndex
CREATE INDEX "NiceJobsApplication_companyId_candidateId_id_idx" ON "public"."NiceJobsApplication"("companyId", "candidateId", "id");

-- CreateIndex
CREATE INDEX "NiceJobsApplication_companyId_divisionId_status_id_idx" ON "public"."NiceJobsApplication"("companyId", "divisionId", "status", "id");

-- CreateIndex
CREATE INDEX "NiceJobsApplication_companyId_divisionId_id_idx" ON "public"."NiceJobsApplication"("companyId", "divisionId", "id");

-- CreateIndex
CREATE INDEX "NiceJobsApplication_companyId_versionId_status_id_idx" ON "public"."NiceJobsApplication"("companyId", "versionId", "status", "id");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsApplicationHistory_eventId_key" ON "public"."NiceJobsApplicationHistory"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsApplicationHistory_applicationId_revision_key" ON "public"."NiceJobsApplicationHistory"("applicationId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsInterview_reference_key" ON "public"."NiceJobsInterview"("reference");

-- CreateIndex
CREATE INDEX "NiceJobsInterview_applicationId_status_id_idx" ON "public"."NiceJobsInterview"("applicationId", "status", "id");

-- CreateIndex
CREATE INDEX "NiceJobsInterview_scheduledAt_applicationId_idx" ON "public"."NiceJobsInterview"("scheduledAt", "applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsInterview_applicationId_number_key" ON "public"."NiceJobsInterview"("applicationId", "number");

-- CreateIndex
CREATE INDEX "NiceJobsInterviewer_userId_interviewId_idx" ON "public"."NiceJobsInterviewer"("userId", "interviewId");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsInterviewEvaluation_interviewId_userId_key" ON "public"."NiceJobsInterviewEvaluation"("interviewId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsOffer_reference_key" ON "public"."NiceJobsOffer"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsOffer_activeKey_key" ON "public"."NiceJobsOffer"("activeKey");

-- CreateIndex
CREATE INDEX "NiceJobsOffer_applicationId_status_id_idx" ON "public"."NiceJobsOffer"("applicationId", "status", "id");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsOffer_applicationId_number_key" ON "public"."NiceJobsOffer"("applicationId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsTrainingPlan_versionId_key" ON "public"."NiceJobsTrainingPlan"("versionId");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsOnboarding_reference_key" ON "public"."NiceJobsOnboarding"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsOnboarding_applicationId_key" ON "public"."NiceJobsOnboarding"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsOnboarding_offerId_key" ON "public"."NiceJobsOnboarding"("offerId");

-- CreateIndex
CREATE INDEX "NiceJobsOnboarding_status_id_idx" ON "public"."NiceJobsOnboarding"("status", "id");

-- CreateIndex
CREATE INDEX "NiceJobsOnboarding_planId_status_id_idx" ON "public"."NiceJobsOnboarding"("planId", "status", "id");

-- CreateIndex
CREATE INDEX "NiceJobsOnboarding_readinessStatus_id_idx" ON "public"."NiceJobsOnboarding"("readinessStatus", "id");

-- CreateIndex
CREATE INDEX "NiceJobsOnboarding_reviewerUserId_reviewerPersonId_status_i_idx" ON "public"."NiceJobsOnboarding"("reviewerUserId", "reviewerPersonId", "status", "id");

-- CreateIndex
CREATE INDEX "NiceJobsOnboarding_readinessReviewerUserId_readinessReviewe_idx" ON "public"."NiceJobsOnboarding"("readinessReviewerUserId", "readinessReviewerPersonId", "status", "id");

-- CreateIndex
CREATE INDEX "NiceJobsTrainingProgress_onboardingId_phase_status_id_idx" ON "public"."NiceJobsTrainingProgress"("onboardingId", "phase", "status", "id");

-- CreateIndex
CREATE INDEX "NiceJobsTrainingProgress_onboardingId_id_idx" ON "public"."NiceJobsTrainingProgress"("onboardingId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsTrainingProgress_onboardingId_phase_key_key" ON "public"."NiceJobsTrainingProgress"("onboardingId", "phase", "key");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsTrainingSubmission_progressId_attempt_key" ON "public"."NiceJobsTrainingSubmission"("progressId", "attempt");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsTrainingReview_submissionId_key" ON "public"."NiceJobsTrainingReview"("submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsTrainingReview_eventId_key" ON "public"."NiceJobsTrainingReview"("eventId");

-- CreateIndex
CREATE INDEX "NiceJobsTrainingReview_onboardingId_kind_id_idx" ON "public"."NiceJobsTrainingReview"("onboardingId", "kind", "id");

-- CreateIndex
CREATE INDEX "NiceJobsTrainingReview_reviewerUserId_kind_outcome_id_idx" ON "public"."NiceJobsTrainingReview"("reviewerUserId", "kind", "outcome", "id");

-- CreateIndex
CREATE INDEX "SecurityRateBucket_expiresAt_idx" ON "public"."SecurityRateBucket"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "SecurityRateBucket_key_windowStart_key" ON "public"."SecurityRateBucket"("key", "windowStart");

-- CreateIndex
CREATE INDEX "Integration_organizationId_channel_status_idx" ON "public"."Integration"("organizationId", "channel", "status");

-- CreateIndex
CREATE INDEX "CommunicationPolicy_organizationId_status_idx" ON "public"."CommunicationPolicy"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationConsent_organizationId_personId_channel_key" ON "public"."CommunicationConsent"("organizationId", "personId", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationConsent_organizationId_channel_address_key" ON "public"."CommunicationConsent"("organizationId", "channel", "address");

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationTemplate_organizationId_key_version_key" ON "public"."CommunicationTemplate"("organizationId", "key", "version");

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationThread_reference_key" ON "public"."CommunicationThread"("reference");

-- CreateIndex
CREATE INDEX "CommunicationThread_organizationId_projectId_lastActivityAt_idx" ON "public"."CommunicationThread"("organizationId", "projectId", "lastActivityAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationMessage_requestId_key" ON "public"."CommunicationMessage"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationMessage_reference_key" ON "public"."CommunicationMessage"("reference");

-- CreateIndex
CREATE INDEX "CommunicationMessage_organizationId_projectId_status_idx" ON "public"."CommunicationMessage"("organizationId", "projectId", "status");

-- CreateIndex
CREATE INDEX "CommunicationMessage_status_nextRetryAt_idx" ON "public"."CommunicationMessage"("status", "nextRetryAt");

-- CreateIndex
CREATE INDEX "CommunicationMessage_organizationId_status_createdAt_idx" ON "public"."CommunicationMessage"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationMessage_integrationId_externalReference_key" ON "public"."CommunicationMessage"("integrationId", "externalReference");

-- CreateIndex
CREATE INDEX "IntegrationEvent_organizationId_status_receivedAt_idx" ON "public"."IntegrationEvent"("organizationId", "status", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationEvent_integrationId_externalEventId_key" ON "public"."IntegrationEvent"("integrationId", "externalEventId");

-- CreateIndex
CREATE INDEX "AutomationRule_organizationId_enabled_idx" ON "public"."AutomationRule"("organizationId", "enabled");

-- CreateIndex
CREATE INDEX "ScheduledJob_organizationId_enabled_nextRunAt_idx" ON "public"."ScheduledJob"("organizationId", "enabled", "nextRunAt");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationRun_reference_key" ON "public"."AutomationRun"("reference");

-- CreateIndex
CREATE INDEX "AutomationRun_ruleId_status_nextRetryAt_id_idx" ON "public"."AutomationRun"("ruleId", "status", "nextRetryAt", "id");

-- CreateIndex
CREATE INDEX "AutomationRun_sourceEventId_ruleId_idx" ON "public"."AutomationRun"("sourceEventId", "ruleId");

-- CreateIndex
CREATE INDEX "NiceJobsAutomationVersion_ruleId_status_number_idx" ON "public"."NiceJobsAutomationVersion"("ruleId", "status", "number");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsAutomationVersion_ruleId_number_key" ON "public"."NiceJobsAutomationVersion"("ruleId", "number");

-- CreateIndex
CREATE INDEX "NiceJobsOperationalException_companyId_divisionId_status_de_idx" ON "public"."NiceJobsOperationalException"("companyId", "divisionId", "status", "detectedAt", "id");

-- CreateIndex
CREATE INDEX "NiceJobsOperationalException_ownerUserId_status_id_idx" ON "public"."NiceJobsOperationalException"("ownerUserId", "status", "id");

-- CreateIndex
CREATE UNIQUE INDEX "NiceJobsOperationalException_companyId_sourceKey_key" ON "public"."NiceJobsOperationalException"("companyId", "sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationRateBucket_key_key" ON "public"."CommunicationRateBucket"("key");

-- CreateIndex
CREATE INDEX "CommunicationRateBucket_expiresAt_idx" ON "public"."CommunicationRateBucket"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_jobsPhone_key" ON "public"."User"("jobsPhone");

-- CreateIndex
CREATE INDEX "EmailAuthChallenge_userId_purpose_status_idx" ON "public"."EmailAuthChallenge"("userId", "purpose", "status");

-- CreateIndex
CREATE INDEX "EmailAuthChallenge_expiresAt_idx" ON "public"."EmailAuthChallenge"("expiresAt");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "public"."Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "public"."Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Person_email_key" ON "public"."Person"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "public"."Organization"("slug");

-- CreateIndex
CREATE INDEX "Organization_type_idx" ON "public"."Organization"("type");

-- CreateIndex
CREATE INDEX "Organization_parentId_idx" ON "public"."Organization"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupProfile_organizationId_key" ON "public"."GroupProfile"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyProfile_organizationId_key" ON "public"."CompanyProfile"("organizationId");

-- CreateIndex
CREATE INDEX "CompanyProfile_groupId_idx" ON "public"."CompanyProfile"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyRelationship_fromCompanyId_toCompanyId_relationship_key" ON "public"."CompanyRelationship"("fromCompanyId", "toCompanyId", "relationship");

-- CreateIndex
CREATE INDEX "OwnershipRelationship_companyId_idx" ON "public"."OwnershipRelationship"("companyId");

-- CreateIndex
CREATE INDEX "OwnershipRelationship_ownerPersonId_idx" ON "public"."OwnershipRelationship"("ownerPersonId");

-- CreateIndex
CREATE INDEX "OwnershipRelationship_ownerOrgId_idx" ON "public"."OwnershipRelationship"("ownerOrgId");

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentProfile_organizationId_key" ON "public"."DepartmentProfile"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamProfile_organizationId_key" ON "public"."TeamProfile"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Brand_organizationId_slug_key" ON "public"."Brand"("organizationId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Product_organizationId_slug_key" ON "public"."Product"("organizationId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Project_organizationId_slug_key" ON "public"."Project"("organizationId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "ExecutiveRecord_sourceKey_key" ON "public"."ExecutiveRecord"("sourceKey");

-- CreateIndex
CREATE INDEX "ExecutiveRecord_organizationId_kind_status_idx" ON "public"."ExecutiveRecord"("organizationId", "kind", "status");

-- CreateIndex
CREATE INDEX "ExecutiveRecord_projectId_kind_status_idx" ON "public"."ExecutiveRecord"("projectId", "kind", "status");

-- CreateIndex
CREATE INDEX "ExecutiveRecord_dueAt_idx" ON "public"."ExecutiveRecord"("dueAt");

-- CreateIndex
CREATE INDEX "LabsCustomerGrant_customerUserId_organizationId_status_idx" ON "public"."LabsCustomerGrant"("customerUserId", "organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "LabsCustomerGrant_leadId_customerUserId_key" ON "public"."LabsCustomerGrant"("leadId", "customerUserId");

-- CreateIndex
CREATE INDEX "ExecutiveHistory_recordId_createdAt_idx" ON "public"."ExecutiveHistory"("recordId", "createdAt");

-- CreateIndex
CREATE INDEX "Task_organizationId_projectId_idx" ON "public"."Task"("organizationId", "projectId");

-- CreateIndex
CREATE INDEX "Task_assigneePersonId_dueDate_idx" ON "public"."Task"("assigneePersonId", "dueDate");

-- CreateIndex
CREATE INDEX "Task_organizationId_status_dueDate_idx" ON "public"."Task"("organizationId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "Task_niceJobsAssignmentId_assigneePersonId_status_id_idx" ON "public"."Task"("niceJobsAssignmentId", "assigneePersonId", "status", "id");

-- CreateIndex
CREATE INDEX "Milestone_projectId_sequence_idx" ON "public"."Milestone"("projectId", "sequence");

-- CreateIndex
CREATE INDEX "TaskDependency_prerequisiteId_idx" ON "public"."TaskDependency"("prerequisiteId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskDependency_taskId_prerequisiteId_key" ON "public"."TaskDependency"("taskId", "prerequisiteId");

-- CreateIndex
CREATE INDEX "ProgressUpdate_goalId_createdAt_idx" ON "public"."ProgressUpdate"("goalId", "createdAt");

-- CreateIndex
CREATE INDEX "ExecutionBlocker_organizationId_status_idx" ON "public"."ExecutionBlocker"("organizationId", "status");

-- CreateIndex
CREATE INDEX "ExecutionBlocker_niceJobsAssignmentId_status_id_idx" ON "public"."ExecutionBlocker"("niceJobsAssignmentId", "status", "id");

-- CreateIndex
CREATE INDEX "Membership_projectId_idx" ON "public"."Membership"("projectId");

-- CreateIndex
CREATE INDEX "Membership_organizationId_idx" ON "public"."Membership"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_personId_organizationId_scopeKey_key" ON "public"."Membership"("personId", "organizationId", "scopeKey");

-- CreateIndex
CREATE UNIQUE INDEX "Role_organizationId_key_key" ON "public"."Role"("organizationId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_key_key" ON "public"."Permission"("key");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_roleId_permissionId_key" ON "public"."RolePermission"("roleId", "permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipRole_membershipId_roleId_key" ON "public"."MembershipRole"("membershipId", "roleId");

-- CreateIndex
CREATE INDEX "AuditEvent_actorUserId_idx" ON "public"."AuditEvent"("actorUserId");

-- CreateIndex
CREATE INDEX "AuditEvent_organizationId_idx" ON "public"."AuditEvent"("organizationId");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_idx" ON "public"."AuditEvent"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditEvent_createdAt_idx" ON "public"."AuditEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SystemConfiguration_key_key" ON "public"."SystemConfiguration"("key");

-- CreateIndex
CREATE UNIQUE INDEX "NexaDirective_actionId_key" ON "public"."NexaDirective"("actionId");

-- CreateIndex
CREATE INDEX "NexaDirective_directorUserId_organizationId_status_idx" ON "public"."NexaDirective"("directorUserId", "organizationId", "status");

-- CreateIndex
CREATE INDEX "NexaDirective_organizationId_status_createdAt_idx" ON "public"."NexaDirective"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NexaDirective_bossUserId_idempotencyKey_key" ON "public"."NexaDirective"("bossUserId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "ReportingRelationship_organizationId_idx" ON "public"."ReportingRelationship"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportingRelationship_organizationId_personId_managerPerson_key" ON "public"."ReportingRelationship"("organizationId", "personId", "managerPersonId");

-- CreateIndex
CREATE INDEX "Responsibility_organizationId_idx" ON "public"."Responsibility"("organizationId");

-- CreateIndex
CREATE INDEX "Responsibility_personId_idx" ON "public"."Responsibility"("personId");

-- CreateIndex
CREATE INDEX "Program_organizationId_status_idx" ON "public"."Program"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Program_companyOrganizationId_slug_key" ON "public"."Program"("companyOrganizationId", "slug");

-- CreateIndex
CREATE INDEX "Batch_programId_status_startDate_idx" ON "public"."Batch"("programId", "status", "startDate");

-- CreateIndex
CREATE INDEX "Location_companyOrganizationId_organizationId_status_idx" ON "public"."Location"("companyOrganizationId", "organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BatchParticipant_batchId_personId_key" ON "public"."BatchParticipant"("batchId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "SiaRoleAssignment_siaId_organizationId_roleId_key" ON "public"."SiaRoleAssignment"("siaId", "organizationId", "roleId");

-- CreateIndex
CREATE INDEX "SiaContext_siaId_organizationId_category_status_idx" ON "public"."SiaContext"("siaId", "organizationId", "category", "status");

-- CreateIndex
CREATE INDEX "SiaContext_siaId_organizationId_status_updatedAt_idx" ON "public"."SiaContext"("siaId", "organizationId", "status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SiaContext_siaId_organizationId_key_key" ON "public"."SiaContext"("siaId", "organizationId", "key");

-- CreateIndex
CREATE INDEX "SiaRun_siaId_organizationId_createdAt_idx" ON "public"."SiaRun"("siaId", "organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SiaRun_userId_siaId_idempotencyKey_key" ON "public"."SiaRun"("userId", "siaId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "SiaAction_requestId_key" ON "public"."SiaAction"("requestId");

-- CreateIndex
CREATE INDEX "SiaAction_siaId_organizationId_status_idx" ON "public"."SiaAction"("siaId", "organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SiaAction_requesterUserId_siaId_idempotencyKey_key" ON "public"."SiaAction"("requesterUserId", "siaId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "SiaTool_siaId_key_key" ON "public"."SiaTool"("siaId", "key");

-- CreateIndex
CREATE INDEX "SiaApproval_approverUserId_status_idx" ON "public"."SiaApproval"("approverUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SiaApproval_requestId_stageIndex_approverUserId_key" ON "public"."SiaApproval"("requestId", "stageIndex", "approverUserId");

-- CreateIndex
CREATE UNIQUE INDEX "OperationalEvent_reference_key" ON "public"."OperationalEvent"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "OperationalEvent_auditId_key" ON "public"."OperationalEvent"("auditId");

-- CreateIndex
CREATE INDEX "OperationalEvent_organizationId_projectId_createdAt_idx" ON "public"."OperationalEvent"("organizationId", "projectId", "createdAt");

-- CreateIndex
CREATE INDEX "OperationalEvent_organizationId_status_createdAt_idx" ON "public"."OperationalEvent"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowDefinition_organizationId_scopeKey_key_version_key" ON "public"."WorkflowDefinition"("organizationId", "scopeKey", "key", "version");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowState_definitionId_key_key" ON "public"."WorkflowState"("definitionId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowTransition_definitionId_key_key" ON "public"."WorkflowTransition"("definitionId", "key");

-- CreateIndex
CREATE INDEX "WorkflowInstance_organizationId_projectId_status_idx" ON "public"."WorkflowInstance"("organizationId", "projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowInstance_creatorUserId_idempotencyKey_key" ON "public"."WorkflowInstance"("creatorUserId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowHistory_instanceId_idempotencyKey_key" ON "public"."WorkflowHistory"("instanceId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowHistory_instanceId_instanceVersion_key" ON "public"."WorkflowHistory"("instanceId", "instanceVersion");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalRule_controlPointId_stageIndex_approverUserId_key" ON "public"."ApprovalRule"("controlPointId", "stageIndex", "approverUserId");

-- CreateIndex
CREATE INDEX "OperationalRequest_organizationId_projectId_status_idx" ON "public"."OperationalRequest"("organizationId", "projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OperationalRequest_requesterUserId_idempotencyKey_key" ON "public"."OperationalRequest"("requesterUserId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "ControlCheck_controlPointId_instanceId_instanceVersion_key" ON "public"."ControlCheck"("controlPointId", "instanceId", "instanceVersion");

-- CreateIndex
CREATE INDEX "Notification_recipientUserId_readAt_idx" ON "public"."Notification"("recipientUserId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_recipientUserId_reference_key" ON "public"."Notification"("recipientUserId", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_type_channel_key" ON "public"."NotificationPreference"("userId", "type", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "Reminder_organizationId_reference_key" ON "public"."Reminder"("organizationId", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "RecurringOccurrence_recurringWorkId_scheduledAt_key" ON "public"."RecurringOccurrence"("recurringWorkId", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "Escalation_organizationId_reference_key" ON "public"."Escalation"("organizationId", "reference");

-- AddForeignKey
ALTER TABLE "public"."NiceJobsIncentivePolicy" ADD CONSTRAINT "NiceJobsIncentivePolicy_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsIncentivePolicy" ADD CONSTRAINT "NiceJobsIncentivePolicy_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsIncentivePolicy" ADD CONSTRAINT "NiceJobsIncentivePolicy_jobVersionId_fkey" FOREIGN KEY ("jobVersionId") REFERENCES "public"."NiceJobsVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsIncentiveVersion" ADD CONSTRAINT "NiceJobsIncentiveVersion_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "public"."NiceJobsIncentivePolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsIncentiveVersion" ADD CONSTRAINT "NiceJobsIncentiveVersion_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsIncentiveVersion" ADD CONSTRAINT "NiceJobsIncentiveVersion_reviewerUserId_fkey" FOREIGN KEY ("reviewerUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsIncentiveEarning" ADD CONSTRAINT "NiceJobsIncentiveEarning_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "public"."NiceJobsAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsIncentiveEarning" ADD CONSTRAINT "NiceJobsIncentiveEarning_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "public"."NiceJobsIncentivePolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsIncentiveEarning" ADD CONSTRAINT "NiceJobsIncentiveEarning_policyVersionId_fkey" FOREIGN KEY ("policyVersionId") REFERENCES "public"."NiceJobsIncentiveVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsIncentiveEarning" ADD CONSTRAINT "NiceJobsIncentiveEarning_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "public"."NiceJobsPerformanceSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsIncentiveEarning" ADD CONSTRAINT "NiceJobsIncentiveEarning_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "public"."OperationalRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsIncentiveEarning" ADD CONSTRAINT "NiceJobsIncentiveEarning_creatorUserId_fkey" FOREIGN KEY ("creatorUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsWallet" ADD CONSTRAINT "NiceJobsWallet_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "public"."NiceJobsAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsWallet" ADD CONSTRAINT "NiceJobsWallet_creatorUserId_fkey" FOREIGN KEY ("creatorUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsWalletAdjustment" ADD CONSTRAINT "NiceJobsWalletAdjustment_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "public"."NiceJobsWallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsWalletAdjustment" ADD CONSTRAINT "NiceJobsWalletAdjustment_policyVersionId_fkey" FOREIGN KEY ("policyVersionId") REFERENCES "public"."NiceJobsIncentiveVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsWalletAdjustment" ADD CONSTRAINT "NiceJobsWalletAdjustment_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "public"."OperationalRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsWalletAdjustment" ADD CONSTRAINT "NiceJobsWalletAdjustment_creatorUserId_fkey" FOREIGN KEY ("creatorUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsWalletReversalProposal" ADD CONSTRAINT "NiceJobsWalletReversalProposal_adjustmentId_fkey" FOREIGN KEY ("adjustmentId") REFERENCES "public"."NiceJobsWalletAdjustment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsWalletReversalProposal" ADD CONSTRAINT "NiceJobsWalletReversalProposal_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "public"."NiceJobsWalletLedger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsWalletLedger" ADD CONSTRAINT "NiceJobsWalletLedger_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "public"."NiceJobsWallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsWalletLedger" ADD CONSTRAINT "NiceJobsWalletLedger_earningId_fkey" FOREIGN KEY ("earningId") REFERENCES "public"."NiceJobsIncentiveEarning"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsWalletLedger" ADD CONSTRAINT "NiceJobsWalletLedger_adjustmentId_fkey" FOREIGN KEY ("adjustmentId") REFERENCES "public"."NiceJobsWalletAdjustment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsWalletLedger" ADD CONSTRAINT "NiceJobsWalletLedger_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "public"."NiceJobsSettlementStatement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsWalletLedger" ADD CONSTRAINT "NiceJobsWalletLedger_reversesId_fkey" FOREIGN KEY ("reversesId") REFERENCES "public"."NiceJobsWalletLedger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsWalletLedger" ADD CONSTRAINT "NiceJobsWalletLedger_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsSettlementPeriod" ADD CONSTRAINT "NiceJobsSettlementPeriod_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "public"."NiceJobsIncentivePolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsSettlementPeriod" ADD CONSTRAINT "NiceJobsSettlementPeriod_policyVersionId_fkey" FOREIGN KEY ("policyVersionId") REFERENCES "public"."NiceJobsIncentiveVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsSettlementPeriod" ADD CONSTRAINT "NiceJobsSettlementPeriod_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "public"."OperationalRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsSettlementPeriod" ADD CONSTRAINT "NiceJobsSettlementPeriod_creatorUserId_fkey" FOREIGN KEY ("creatorUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsSettlementStatement" ADD CONSTRAINT "NiceJobsSettlementStatement_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "public"."NiceJobsSettlementPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsSettlementStatement" ADD CONSTRAINT "NiceJobsSettlementStatement_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "public"."NiceJobsWallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsSettlementLine" ADD CONSTRAINT "NiceJobsSettlementLine_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "public"."NiceJobsSettlementStatement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsSettlementLine" ADD CONSTRAINT "NiceJobsSettlementLine_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "public"."NiceJobsWalletLedger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsPayoutIntent" ADD CONSTRAINT "NiceJobsPayoutIntent_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "public"."NiceJobsSettlementStatement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsPayoutIntent" ADD CONSTRAINT "NiceJobsPayoutIntent_creatorUserId_fkey" FOREIGN KEY ("creatorUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsFinanceException" ADD CONSTRAINT "NiceJobsFinanceException_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsFinanceException" ADD CONSTRAINT "NiceJobsFinanceException_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsFinanceException" ADD CONSTRAINT "NiceJobsFinanceException_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "public"."NiceJobsWallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsFinanceException" ADD CONSTRAINT "NiceJobsFinanceException_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsPerformanceFramework" ADD CONSTRAINT "NiceJobsPerformanceFramework_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsPerformanceFramework" ADD CONSTRAINT "NiceJobsPerformanceFramework_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsPerformanceFramework" ADD CONSTRAINT "NiceJobsPerformanceFramework_jobVersionId_fkey" FOREIGN KEY ("jobVersionId") REFERENCES "public"."NiceJobsVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsPerformanceVersion" ADD CONSTRAINT "NiceJobsPerformanceVersion_frameworkId_fkey" FOREIGN KEY ("frameworkId") REFERENCES "public"."NiceJobsPerformanceFramework"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsPerformanceVersion" ADD CONSTRAINT "NiceJobsPerformanceVersion_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsPerformanceSnapshot" ADD CONSTRAINT "NiceJobsPerformanceSnapshot_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "public"."NiceJobsAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsPerformanceSnapshot" ADD CONSTRAINT "NiceJobsPerformanceSnapshot_frameworkVersionId_fkey" FOREIGN KEY ("frameworkVersionId") REFERENCES "public"."NiceJobsPerformanceVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsPerformanceSnapshot" ADD CONSTRAINT "NiceJobsPerformanceSnapshot_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "public"."NiceJobsPerformanceSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsPerformanceSnapshot" ADD CONSTRAINT "NiceJobsPerformanceSnapshot_generatedByUserId_fkey" FOREIGN KEY ("generatedByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsPerformanceReview" ADD CONSTRAINT "NiceJobsPerformanceReview_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "public"."NiceJobsPerformanceSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsPerformanceReview" ADD CONSTRAINT "NiceJobsPerformanceReview_reviewerUserId_fkey" FOREIGN KEY ("reviewerUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsPerformanceReview" ADD CONSTRAINT "NiceJobsPerformanceReview_supportTaskId_fkey" FOREIGN KEY ("supportTaskId") REFERENCES "public"."Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsPerformanceAttention" ADD CONSTRAINT "NiceJobsPerformanceAttention_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "public"."NiceJobsPerformanceSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsPip" ADD CONSTRAINT "NiceJobsPip_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "public"."NiceJobsAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsPip" ADD CONSTRAINT "NiceJobsPip_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "public"."NiceJobsPerformanceSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsPip" ADD CONSTRAINT "NiceJobsPip_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "public"."Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsPipReview" ADD CONSTRAINT "NiceJobsPipReview_pipId_fkey" FOREIGN KEY ("pipId") REFERENCES "public"."NiceJobsPip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsPipReview" ADD CONSTRAINT "NiceJobsPipReview_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsKnowledge" ADD CONSTRAINT "NiceJobsKnowledge_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsKnowledge" ADD CONSTRAINT "NiceJobsKnowledge_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsKnowledgeVersion" ADD CONSTRAINT "NiceJobsKnowledgeVersion_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "public"."NiceJobsKnowledge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsKnowledgeVersion" ADD CONSTRAINT "NiceJobsKnowledgeVersion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsKnowledgeVersion" ADD CONSTRAINT "NiceJobsKnowledgeVersion_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "public"."NiceJobsTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsKnowledgeVersion" ADD CONSTRAINT "NiceJobsKnowledgeVersion_jobVersionId_fkey" FOREIGN KEY ("jobVersionId") REFERENCES "public"."NiceJobsVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsKnowledgeVersion" ADD CONSTRAINT "NiceJobsKnowledgeVersion_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "public"."NiceJobsAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsKnowledgeVersion" ADD CONSTRAINT "NiceJobsKnowledgeVersion_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "public"."Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsKnowledgeVersion" ADD CONSTRAINT "NiceJobsKnowledgeVersion_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsKnowledgeVersion" ADD CONSTRAINT "NiceJobsKnowledgeVersion_communicationTemplateId_fkey" FOREIGN KEY ("communicationTemplateId") REFERENCES "public"."CommunicationTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsKnowledgeVersion" ADD CONSTRAINT "NiceJobsKnowledgeVersion_relatedVersionId_fkey" FOREIGN KEY ("relatedVersionId") REFERENCES "public"."NiceJobsKnowledgeVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsContentFile" ADD CONSTRAINT "NiceJobsContentFile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsContentFile" ADD CONSTRAINT "NiceJobsContentFile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsContentFile" ADD CONSTRAINT "NiceJobsContentFile_uploaderUserId_fkey" FOREIGN KEY ("uploaderUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsSopStep" ADD CONSTRAINT "NiceJobsSopStep_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "public"."NiceJobsKnowledgeVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsSopStep" ADD CONSTRAINT "NiceJobsSopStep_resourceVersionId_fkey" FOREIGN KEY ("resourceVersionId") REFERENCES "public"."NiceJobsKnowledgeVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsSopStep" ADD CONSTRAINT "NiceJobsSopStep_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsKnowledgeReceipt" ADD CONSTRAINT "NiceJobsKnowledgeReceipt_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "public"."NiceJobsKnowledgeVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsKnowledgeReceipt" ADD CONSTRAINT "NiceJobsKnowledgeReceipt_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "public"."NiceJobsAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsKnowledgeReceipt" ADD CONSTRAINT "NiceJobsKnowledgeReceipt_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsKnowledgeWorkLink" ADD CONSTRAINT "NiceJobsKnowledgeWorkLink_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "public"."NiceJobsKnowledgeVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsKnowledgeWorkLink" ADD CONSTRAINT "NiceJobsKnowledgeWorkLink_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsKnowledgeWorkLink" ADD CONSTRAINT "NiceJobsKnowledgeWorkLink_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "public"."NiceJobsLead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsKnowledgeWorkLink" ADD CONSTRAINT "NiceJobsKnowledgeWorkLink_followupId_fkey" FOREIGN KEY ("followupId") REFERENCES "public"."NiceJobsLeadFollowup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsTemplate" ADD CONSTRAINT "NiceJobsTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsTemplate" ADD CONSTRAINT "NiceJobsTemplate_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsTemplate" ADD CONSTRAINT "NiceJobsTemplate_publishedVersionId_fkey" FOREIGN KEY ("publishedVersionId") REFERENCES "public"."NiceJobsVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsVersion" ADD CONSTRAINT "NiceJobsVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "public"."NiceJobsTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsVersionArea" ADD CONSTRAINT "NiceJobsVersionArea_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "public"."NiceJobsVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsVersionArea" ADD CONSTRAINT "NiceJobsVersionArea_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsWorkerProfile" ADD CONSTRAINT "NiceJobsWorkerProfile_personId_fkey" FOREIGN KEY ("personId") REFERENCES "public"."Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsWorkerProfile" ADD CONSTRAINT "NiceJobsWorkerProfile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsAssignment" ADD CONSTRAINT "NiceJobsAssignment_onboardingId_fkey" FOREIGN KEY ("onboardingId") REFERENCES "public"."NiceJobsOnboarding"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsAssignment" ADD CONSTRAINT "NiceJobsAssignment_readinessReviewId_fkey" FOREIGN KEY ("readinessReviewId") REFERENCES "public"."NiceJobsTrainingReview"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsAssignment" ADD CONSTRAINT "NiceJobsAssignment_activatedByUserId_fkey" FOREIGN KEY ("activatedByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsAssignment" ADD CONSTRAINT "NiceJobsAssignment_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "public"."NiceJobsWorkerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsAssignment" ADD CONSTRAINT "NiceJobsAssignment_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "public"."NiceJobsVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsAssignment" ADD CONSTRAINT "NiceJobsAssignment_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsAssignment" ADD CONSTRAINT "NiceJobsAssignment_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "public"."Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsDailyReport" ADD CONSTRAINT "NiceJobsDailyReport_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "public"."NiceJobsAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsDailyReport" ADD CONSTRAINT "NiceJobsDailyReport_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "public"."NiceJobsDailyReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsDailyReport" ADD CONSTRAINT "NiceJobsDailyReport_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsLeadPolicy" ADD CONSTRAINT "NiceJobsLeadPolicy_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsLeadPolicy" ADD CONSTRAINT "NiceJobsLeadPolicy_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsLeadPolicy" ADD CONSTRAINT "NiceJobsLeadPolicy_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "public"."WorkflowDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsLeadPolicy" ADD CONSTRAINT "NiceJobsLeadPolicy_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsLeadEligibility" ADD CONSTRAINT "NiceJobsLeadEligibility_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "public"."NiceJobsLeadPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsLeadEligibility" ADD CONSTRAINT "NiceJobsLeadEligibility_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "public"."NiceJobsVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsLead" ADD CONSTRAINT "NiceJobsLead_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsLead" ADD CONSTRAINT "NiceJobsLead_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsLead" ADD CONSTRAINT "NiceJobsLead_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "public"."NiceJobsLeadPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsLead" ADD CONSTRAINT "NiceJobsLead_workflowInstanceId_fkey" FOREIGN KEY ("workflowInstanceId") REFERENCES "public"."WorkflowInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsLead" ADD CONSTRAINT "NiceJobsLead_currentWorkerAssignmentId_fkey" FOREIGN KEY ("currentWorkerAssignmentId") REFERENCES "public"."NiceJobsAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsLeadAssignment" ADD CONSTRAINT "NiceJobsLeadAssignment_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "public"."NiceJobsLead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsLeadAssignment" ADD CONSTRAINT "NiceJobsLeadAssignment_workerAssignmentId_fkey" FOREIGN KEY ("workerAssignmentId") REFERENCES "public"."NiceJobsAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsLeadAssignment" ADD CONSTRAINT "NiceJobsLeadAssignment_assignedByUserId_fkey" FOREIGN KEY ("assignedByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsLeadActivity" ADD CONSTRAINT "NiceJobsLeadActivity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "public"."NiceJobsLead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsLeadActivity" ADD CONSTRAINT "NiceJobsLeadActivity_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "public"."OperationalEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsLeadActivity" ADD CONSTRAINT "NiceJobsLeadActivity_workerAssignmentId_fkey" FOREIGN KEY ("workerAssignmentId") REFERENCES "public"."NiceJobsAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsLeadFollowup" ADD CONSTRAINT "NiceJobsLeadFollowup_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "public"."NiceJobsLead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsLeadFollowup" ADD CONSTRAINT "NiceJobsLeadFollowup_assignmentHistoryId_fkey" FOREIGN KEY ("assignmentHistoryId") REFERENCES "public"."NiceJobsLeadAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsLeadFollowup" ADD CONSTRAINT "NiceJobsLeadFollowup_workerAssignmentId_fkey" FOREIGN KEY ("workerAssignmentId") REFERENCES "public"."NiceJobsAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TaskEvidence" ADD CONSTRAINT "TaskEvidence_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TaskEvidence" ADD CONSTRAINT "TaskEvidence_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsApplication" ADD CONSTRAINT "NiceJobsApplication_reviewRequestId_fkey" FOREIGN KEY ("reviewRequestId") REFERENCES "public"."OperationalRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsApplication" ADD CONSTRAINT "NiceJobsApplication_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "public"."Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsApplication" ADD CONSTRAINT "NiceJobsApplication_creatorUserId_fkey" FOREIGN KEY ("creatorUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsApplication" ADD CONSTRAINT "NiceJobsApplication_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsApplication" ADD CONSTRAINT "NiceJobsApplication_versionId_divisionId_fkey" FOREIGN KEY ("versionId", "divisionId") REFERENCES "public"."NiceJobsVersionArea"("versionId", "divisionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsApplicationHistory" ADD CONSTRAINT "NiceJobsApplicationHistory_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "public"."NiceJobsApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsInterview" ADD CONSTRAINT "NiceJobsInterview_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "public"."NiceJobsApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsInterview" ADD CONSTRAINT "NiceJobsInterview_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsInterviewer" ADD CONSTRAINT "NiceJobsInterviewer_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "public"."NiceJobsInterview"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsInterviewer" ADD CONSTRAINT "NiceJobsInterviewer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsInterviewEvaluation" ADD CONSTRAINT "NiceJobsInterviewEvaluation_interviewId_userId_fkey" FOREIGN KEY ("interviewId", "userId") REFERENCES "public"."NiceJobsInterviewer"("interviewId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsOffer" ADD CONSTRAINT "NiceJobsOffer_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "public"."NiceJobsApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsOffer" ADD CONSTRAINT "NiceJobsOffer_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsTrainingPlan" ADD CONSTRAINT "NiceJobsTrainingPlan_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "public"."NiceJobsVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsOnboarding" ADD CONSTRAINT "NiceJobsOnboarding_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "public"."NiceJobsApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsOnboarding" ADD CONSTRAINT "NiceJobsOnboarding_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "public"."NiceJobsOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsOnboarding" ADD CONSTRAINT "NiceJobsOnboarding_planId_fkey" FOREIGN KEY ("planId") REFERENCES "public"."NiceJobsTrainingPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsOnboarding" ADD CONSTRAINT "NiceJobsOnboarding_reviewerUserId_fkey" FOREIGN KEY ("reviewerUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsOnboarding" ADD CONSTRAINT "NiceJobsOnboarding_readinessReviewerUserId_fkey" FOREIGN KEY ("readinessReviewerUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsTrainingProgress" ADD CONSTRAINT "NiceJobsTrainingProgress_onboardingId_fkey" FOREIGN KEY ("onboardingId") REFERENCES "public"."NiceJobsOnboarding"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsTrainingSubmission" ADD CONSTRAINT "NiceJobsTrainingSubmission_progressId_fkey" FOREIGN KEY ("progressId") REFERENCES "public"."NiceJobsTrainingProgress"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsTrainingSubmission" ADD CONSTRAINT "NiceJobsTrainingSubmission_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsTrainingReview" ADD CONSTRAINT "NiceJobsTrainingReview_onboardingId_fkey" FOREIGN KEY ("onboardingId") REFERENCES "public"."NiceJobsOnboarding"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsTrainingReview" ADD CONSTRAINT "NiceJobsTrainingReview_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "public"."NiceJobsTrainingSubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsTrainingReview" ADD CONSTRAINT "NiceJobsTrainingReview_reviewerUserId_fkey" FOREIGN KEY ("reviewerUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsTrainingReview" ADD CONSTRAINT "NiceJobsTrainingReview_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "public"."OperationalEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Integration" ADD CONSTRAINT "Integration_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Integration" ADD CONSTRAINT "Integration_creatorUserId_fkey" FOREIGN KEY ("creatorUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CommunicationPolicy" ADD CONSTRAINT "CommunicationPolicy_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CommunicationPolicy" ADD CONSTRAINT "CommunicationPolicy_controlPointId_fkey" FOREIGN KEY ("controlPointId") REFERENCES "public"."ControlPoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CommunicationPolicy" ADD CONSTRAINT "CommunicationPolicy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CommunicationConsent" ADD CONSTRAINT "CommunicationConsent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CommunicationConsent" ADD CONSTRAINT "CommunicationConsent_personId_fkey" FOREIGN KEY ("personId") REFERENCES "public"."Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CommunicationTemplate" ADD CONSTRAINT "CommunicationTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CommunicationTemplate" ADD CONSTRAINT "CommunicationTemplate_ownerPersonId_fkey" FOREIGN KEY ("ownerPersonId") REFERENCES "public"."Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CommunicationThread" ADD CONSTRAINT "CommunicationThread_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CommunicationThread" ADD CONSTRAINT "CommunicationThread_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CommunicationThread" ADD CONSTRAINT "CommunicationThread_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "public"."Integration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CommunicationMessage" ADD CONSTRAINT "CommunicationMessage_creatorPersonId_fkey" FOREIGN KEY ("creatorPersonId") REFERENCES "public"."Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CommunicationMessage" ADD CONSTRAINT "CommunicationMessage_siaId_fkey" FOREIGN KEY ("siaId") REFERENCES "public"."SiaIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CommunicationMessage" ADD CONSTRAINT "CommunicationMessage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CommunicationMessage" ADD CONSTRAINT "CommunicationMessage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CommunicationMessage" ADD CONSTRAINT "CommunicationMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "public"."CommunicationThread"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CommunicationMessage" ADD CONSTRAINT "CommunicationMessage_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "public"."Integration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CommunicationMessage" ADD CONSTRAINT "CommunicationMessage_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "public"."CommunicationPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CommunicationMessage" ADD CONSTRAINT "CommunicationMessage_consentId_fkey" FOREIGN KEY ("consentId") REFERENCES "public"."CommunicationConsent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CommunicationMessage" ADD CONSTRAINT "CommunicationMessage_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "public"."CommunicationTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CommunicationMessage" ADD CONSTRAINT "CommunicationMessage_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "public"."OperationalRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CommunicationMessage" ADD CONSTRAINT "CommunicationMessage_creatorUserId_fkey" FOREIGN KEY ("creatorUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."IntegrationEvent" ADD CONSTRAINT "IntegrationEvent_operationalEventId_fkey" FOREIGN KEY ("operationalEventId") REFERENCES "public"."OperationalEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."IntegrationEvent" ADD CONSTRAINT "IntegrationEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."IntegrationEvent" ADD CONSTRAINT "IntegrationEvent_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "public"."Integration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AutomationRule" ADD CONSTRAINT "AutomationRule_ownerPersonId_fkey" FOREIGN KEY ("ownerPersonId") REFERENCES "public"."Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AutomationRule" ADD CONSTRAINT "AutomationRule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AutomationRule" ADD CONSTRAINT "AutomationRule_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ScheduledJob" ADD CONSTRAINT "ScheduledJob_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ScheduledJob" ADD CONSTRAINT "ScheduledJob_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "public"."AutomationRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AutomationRun" ADD CONSTRAINT "AutomationRun_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "public"."AutomationRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AutomationRun" ADD CONSTRAINT "AutomationRun_workflowVersionId_fkey" FOREIGN KEY ("workflowVersionId") REFERENCES "public"."NiceJobsAutomationVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NiceJobsAutomationVersion" ADD CONSTRAINT "NiceJobsAutomationVersion_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "public"."AutomationRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CommunicationRateBucket" ADD CONSTRAINT "CommunicationRateBucket_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."User" ADD CONSTRAINT "User_personId_fkey" FOREIGN KEY ("personId") REFERENCES "public"."Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EmailAuthChallenge" ADD CONSTRAINT "EmailAuthChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Organization" ADD CONSTRAINT "Organization_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GroupProfile" ADD CONSTRAINT "GroupProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CompanyProfile" ADD CONSTRAINT "CompanyProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CompanyProfile" ADD CONSTRAINT "CompanyProfile_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "public"."GroupProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CompanyRelationship" ADD CONSTRAINT "CompanyRelationship_fromCompanyId_fkey" FOREIGN KEY ("fromCompanyId") REFERENCES "public"."CompanyProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CompanyRelationship" ADD CONSTRAINT "CompanyRelationship_toCompanyId_fkey" FOREIGN KEY ("toCompanyId") REFERENCES "public"."CompanyProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OwnershipRelationship" ADD CONSTRAINT "OwnershipRelationship_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."CompanyProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OwnershipRelationship" ADD CONSTRAINT "OwnershipRelationship_ownerPersonId_fkey" FOREIGN KEY ("ownerPersonId") REFERENCES "public"."Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OwnershipRelationship" ADD CONSTRAINT "OwnershipRelationship_ownerOrgId_fkey" FOREIGN KEY ("ownerOrgId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DepartmentProfile" ADD CONSTRAINT "DepartmentProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TeamProfile" ADD CONSTRAINT "TeamProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Brand" ADD CONSTRAINT "Brand_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Product" ADD CONSTRAINT "Product_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Product" ADD CONSTRAINT "Product_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Product" ADD CONSTRAINT "Product_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "public"."Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Project" ADD CONSTRAINT "Project_programId_fkey" FOREIGN KEY ("programId") REFERENCES "public"."Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Project" ADD CONSTRAINT "Project_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "public"."Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Project" ADD CONSTRAINT "Project_ownerPersonId_fkey" FOREIGN KEY ("ownerPersonId") REFERENCES "public"."Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Project" ADD CONSTRAINT "Project_accountablePersonId_fkey" FOREIGN KEY ("accountablePersonId") REFERENCES "public"."Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Project" ADD CONSTRAINT "Project_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Project" ADD CONSTRAINT "Project_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExecutiveRecord" ADD CONSTRAINT "ExecutiveRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExecutiveRecord" ADD CONSTRAINT "ExecutiveRecord_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExecutiveRecord" ADD CONSTRAINT "ExecutiveRecord_ownerPersonId_fkey" FOREIGN KEY ("ownerPersonId") REFERENCES "public"."Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LabsCustomerGrant" ADD CONSTRAINT "LabsCustomerGrant_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LabsCustomerGrant" ADD CONSTRAINT "LabsCustomerGrant_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "public"."ExecutiveRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LabsCustomerGrant" ADD CONSTRAINT "LabsCustomerGrant_customerUserId_fkey" FOREIGN KEY ("customerUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LabsCustomerGrant" ADD CONSTRAINT "LabsCustomerGrant_issuedByUserId_fkey" FOREIGN KEY ("issuedByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExecutiveHistory" ADD CONSTRAINT "ExecutiveHistory_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "public"."ExecutiveRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExecutiveHistory" ADD CONSTRAINT "ExecutiveHistory_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Goal" ADD CONSTRAINT "Goal_programId_fkey" FOREIGN KEY ("programId") REFERENCES "public"."Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Goal" ADD CONSTRAINT "Goal_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Goal" ADD CONSTRAINT "Goal_ownerPersonId_fkey" FOREIGN KEY ("ownerPersonId") REFERENCES "public"."Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Goal" ADD CONSTRAINT "Goal_accountablePersonId_fkey" FOREIGN KEY ("accountablePersonId") REFERENCES "public"."Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Goal" ADD CONSTRAINT "Goal_parentGoalId_fkey" FOREIGN KEY ("parentGoalId") REFERENCES "public"."Goal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Goal" ADD CONSTRAINT "Goal_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Goal" ADD CONSTRAINT "Goal_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_niceJobsAssignmentId_fkey" FOREIGN KEY ("niceJobsAssignmentId") REFERENCES "public"."NiceJobsAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "public"."Milestone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_ownerPersonId_fkey" FOREIGN KEY ("ownerPersonId") REFERENCES "public"."Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_assigneePersonId_fkey" FOREIGN KEY ("assigneePersonId") REFERENCES "public"."Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_creatorPersonId_fkey" FOREIGN KEY ("creatorPersonId") REFERENCES "public"."Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "public"."Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Milestone" ADD CONSTRAINT "Milestone_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Milestone" ADD CONSTRAINT "Milestone_ownerPersonId_fkey" FOREIGN KEY ("ownerPersonId") REFERENCES "public"."Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TaskDependency" ADD CONSTRAINT "TaskDependency_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TaskDependency" ADD CONSTRAINT "TaskDependency_prerequisiteId_fkey" FOREIGN KEY ("prerequisiteId") REFERENCES "public"."Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProgressUpdate" ADD CONSTRAINT "ProgressUpdate_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "public"."Goal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProgressUpdate" ADD CONSTRAINT "ProgressUpdate_actorPersonId_fkey" FOREIGN KEY ("actorPersonId") REFERENCES "public"."Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExecutionBlocker" ADD CONSTRAINT "ExecutionBlocker_niceJobsLeadId_fkey" FOREIGN KEY ("niceJobsLeadId") REFERENCES "public"."NiceJobsLead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExecutionBlocker" ADD CONSTRAINT "ExecutionBlocker_niceJobsAssignmentId_fkey" FOREIGN KEY ("niceJobsAssignmentId") REFERENCES "public"."NiceJobsAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExecutionBlocker" ADD CONSTRAINT "ExecutionBlocker_reporterUserId_fkey" FOREIGN KEY ("reporterUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExecutionBlocker" ADD CONSTRAINT "ExecutionBlocker_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExecutionBlocker" ADD CONSTRAINT "ExecutionBlocker_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExecutionBlocker" ADD CONSTRAINT "ExecutionBlocker_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExecutionBlocker" ADD CONSTRAINT "ExecutionBlocker_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "public"."Goal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExecutionBlocker" ADD CONSTRAINT "ExecutionBlocker_ownerPersonId_fkey" FOREIGN KEY ("ownerPersonId") REFERENCES "public"."Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExecutionBlocker" ADD CONSTRAINT "ExecutionBlocker_dependencyTaskId_fkey" FOREIGN KEY ("dependencyTaskId") REFERENCES "public"."Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Membership" ADD CONSTRAINT "Membership_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Membership" ADD CONSTRAINT "Membership_personId_fkey" FOREIGN KEY ("personId") REFERENCES "public"."Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Membership" ADD CONSTRAINT "Membership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Role" ADD CONSTRAINT "Role_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "public"."Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "public"."Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MembershipRole" ADD CONSTRAINT "MembershipRole_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "public"."Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MembershipRole" ADD CONSTRAINT "MembershipRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "public"."Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuditEvent" ADD CONSTRAINT "AuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuditEvent" ADD CONSTRAINT "AuditEvent_actorPersonId_fkey" FOREIGN KEY ("actorPersonId") REFERENCES "public"."Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuditEvent" ADD CONSTRAINT "AuditEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NexaDirective" ADD CONSTRAINT "NexaDirective_nexaId_fkey" FOREIGN KEY ("nexaId") REFERENCES "public"."NexaIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NexaDirective" ADD CONSTRAINT "NexaDirective_bossUserId_fkey" FOREIGN KEY ("bossUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NexaDirective" ADD CONSTRAINT "NexaDirective_directorUserId_fkey" FOREIGN KEY ("directorUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NexaDirective" ADD CONSTRAINT "NexaDirective_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NexaDirective" ADD CONSTRAINT "NexaDirective_siaId_fkey" FOREIGN KEY ("siaId") REFERENCES "public"."SiaIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NexaDirective" ADD CONSTRAINT "NexaDirective_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "public"."SiaAction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReportingRelationship" ADD CONSTRAINT "ReportingRelationship_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReportingRelationship" ADD CONSTRAINT "ReportingRelationship_personId_fkey" FOREIGN KEY ("personId") REFERENCES "public"."Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReportingRelationship" ADD CONSTRAINT "ReportingRelationship_managerPersonId_fkey" FOREIGN KEY ("managerPersonId") REFERENCES "public"."Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Responsibility" ADD CONSTRAINT "Responsibility_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Responsibility" ADD CONSTRAINT "Responsibility_personId_fkey" FOREIGN KEY ("personId") REFERENCES "public"."Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Responsibility" ADD CONSTRAINT "Responsibility_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Responsibility" ADD CONSTRAINT "Responsibility_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Responsibility" ADD CONSTRAINT "Responsibility_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "public"."Goal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Responsibility" ADD CONSTRAINT "Responsibility_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Responsibility" ADD CONSTRAINT "Responsibility_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "public"."Milestone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Responsibility" ADD CONSTRAINT "Responsibility_programId_fkey" FOREIGN KEY ("programId") REFERENCES "public"."Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Responsibility" ADD CONSTRAINT "Responsibility_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "public"."Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Responsibility" ADD CONSTRAINT "Responsibility_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "public"."Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Responsibility" ADD CONSTRAINT "Responsibility_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Program" ADD CONSTRAINT "Program_companyOrganizationId_fkey" FOREIGN KEY ("companyOrganizationId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Program" ADD CONSTRAINT "Program_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Program" ADD CONSTRAINT "Program_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "public"."Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Program" ADD CONSTRAINT "Program_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Batch" ADD CONSTRAINT "Batch_programId_fkey" FOREIGN KEY ("programId") REFERENCES "public"."Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Batch" ADD CONSTRAINT "Batch_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "public"."Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Location" ADD CONSTRAINT "Location_companyOrganizationId_fkey" FOREIGN KEY ("companyOrganizationId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Location" ADD CONSTRAINT "Location_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BatchParticipant" ADD CONSTRAINT "BatchParticipant_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "public"."Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BatchParticipant" ADD CONSTRAINT "BatchParticipant_personId_fkey" FOREIGN KEY ("personId") REFERENCES "public"."Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SiaRoleAssignment" ADD CONSTRAINT "SiaRoleAssignment_siaId_fkey" FOREIGN KEY ("siaId") REFERENCES "public"."SiaIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SiaRoleAssignment" ADD CONSTRAINT "SiaRoleAssignment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SiaRoleAssignment" ADD CONSTRAINT "SiaRoleAssignment_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "public"."Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SiaContext" ADD CONSTRAINT "SiaContext_siaId_fkey" FOREIGN KEY ("siaId") REFERENCES "public"."SiaIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SiaContext" ADD CONSTRAINT "SiaContext_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SiaContext" ADD CONSTRAINT "SiaContext_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SiaContext" ADD CONSTRAINT "SiaContext_ownerPersonId_fkey" FOREIGN KEY ("ownerPersonId") REFERENCES "public"."Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SiaRun" ADD CONSTRAINT "SiaRun_siaId_fkey" FOREIGN KEY ("siaId") REFERENCES "public"."SiaIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SiaRun" ADD CONSTRAINT "SiaRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SiaRun" ADD CONSTRAINT "SiaRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SiaRun" ADD CONSTRAINT "SiaRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SiaRun" ADD CONSTRAINT "SiaRun_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "public"."AuditEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SiaAction" ADD CONSTRAINT "SiaAction_siaId_fkey" FOREIGN KEY ("siaId") REFERENCES "public"."SiaIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SiaAction" ADD CONSTRAINT "SiaAction_requesterUserId_fkey" FOREIGN KEY ("requesterUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SiaAction" ADD CONSTRAINT "SiaAction_requesterPersonId_fkey" FOREIGN KEY ("requesterPersonId") REFERENCES "public"."Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SiaAction" ADD CONSTRAINT "SiaAction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SiaAction" ADD CONSTRAINT "SiaAction_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SiaAction" ADD CONSTRAINT "SiaAction_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "public"."OperationalRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SiaAction" ADD CONSTRAINT "SiaAction_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "public"."AuditEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SiaGoal" ADD CONSTRAINT "SiaGoal_siaId_fkey" FOREIGN KEY ("siaId") REFERENCES "public"."SiaIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SiaTool" ADD CONSTRAINT "SiaTool_siaId_fkey" FOREIGN KEY ("siaId") REFERENCES "public"."SiaIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SiaApproval" ADD CONSTRAINT "SiaApproval_siaId_fkey" FOREIGN KEY ("siaId") REFERENCES "public"."SiaIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SiaApproval" ADD CONSTRAINT "SiaApproval_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "public"."OperationalRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SiaApproval" ADD CONSTRAINT "SiaApproval_approverUserId_fkey" FOREIGN KEY ("approverUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SiaApproval" ADD CONSTRAINT "SiaApproval_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OperationalEvent" ADD CONSTRAINT "OperationalEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OperationalEvent" ADD CONSTRAINT "OperationalEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OperationalEvent" ADD CONSTRAINT "OperationalEvent_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "public"."AuditEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkflowDefinition" ADD CONSTRAINT "WorkflowDefinition_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkflowState" ADD CONSTRAINT "WorkflowState_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "public"."WorkflowDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkflowTransition" ADD CONSTRAINT "WorkflowTransition_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "public"."WorkflowDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkflowTransition" ADD CONSTRAINT "WorkflowTransition_fromStateId_fkey" FOREIGN KEY ("fromStateId") REFERENCES "public"."WorkflowState"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkflowTransition" ADD CONSTRAINT "WorkflowTransition_toStateId_fkey" FOREIGN KEY ("toStateId") REFERENCES "public"."WorkflowState"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkflowTransition" ADD CONSTRAINT "WorkflowTransition_controlPointId_fkey" FOREIGN KEY ("controlPointId") REFERENCES "public"."ControlPoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkflowInstance" ADD CONSTRAINT "WorkflowInstance_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "public"."WorkflowDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkflowInstance" ADD CONSTRAINT "WorkflowInstance_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkflowInstance" ADD CONSTRAINT "WorkflowInstance_creatorUserId_fkey" FOREIGN KEY ("creatorUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkflowInstance" ADD CONSTRAINT "WorkflowInstance_currentStateId_fkey" FOREIGN KEY ("currentStateId") REFERENCES "public"."WorkflowState"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkflowHistory" ADD CONSTRAINT "WorkflowHistory_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "public"."WorkflowInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkflowHistory" ADD CONSTRAINT "WorkflowHistory_transitionId_fkey" FOREIGN KEY ("transitionId") REFERENCES "public"."WorkflowTransition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkflowHistory" ADD CONSTRAINT "WorkflowHistory_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ControlPoint" ADD CONSTRAINT "ControlPoint_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ApprovalRule" ADD CONSTRAINT "ApprovalRule_controlPointId_fkey" FOREIGN KEY ("controlPointId") REFERENCES "public"."ControlPoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ApprovalRule" ADD CONSTRAINT "ApprovalRule_approverUserId_fkey" FOREIGN KEY ("approverUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OperationalRequest" ADD CONSTRAINT "OperationalRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OperationalRequest" ADD CONSTRAINT "OperationalRequest_requesterUserId_fkey" FOREIGN KEY ("requesterUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OperationalRequest" ADD CONSTRAINT "OperationalRequest_controlPointId_fkey" FOREIGN KEY ("controlPointId") REFERENCES "public"."ControlPoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OperationalRequest" ADD CONSTRAINT "OperationalRequest_workflowInstanceId_fkey" FOREIGN KEY ("workflowInstanceId") REFERENCES "public"."WorkflowInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ControlCheck" ADD CONSTRAINT "ControlCheck_controlPointId_fkey" FOREIGN KEY ("controlPointId") REFERENCES "public"."ControlPoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ControlCheck" ADD CONSTRAINT "ControlCheck_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "public"."WorkflowInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ControlCheck" ADD CONSTRAINT "ControlCheck_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Notification" ADD CONSTRAINT "Notification_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Notification" ADD CONSTRAINT "Notification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Reminder" ADD CONSTRAINT "Reminder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Reminder" ADD CONSTRAINT "Reminder_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RecurringWork" ADD CONSTRAINT "RecurringWork_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RecurringWork" ADD CONSTRAINT "RecurringWork_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RecurringWork" ADD CONSTRAINT "RecurringWork_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "public"."WorkflowDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RecurringOccurrence" ADD CONSTRAINT "RecurringOccurrence_recurringWorkId_fkey" FOREIGN KEY ("recurringWorkId") REFERENCES "public"."RecurringWork"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Escalation" ADD CONSTRAINT "Escalation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Escalation" ADD CONSTRAINT "Escalation_responsibleUserId_fkey" FOREIGN KEY ("responsibleUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The historical SQLite trigger rules are retained in prisma/sqlite-migrations-archive.
-- These guards are part of the PostgreSQL baseline and must be installed before writes.
CREATE FUNCTION nicejobs_reject_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '%', TG_ARGV[0] USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER nicejobs_wallet_ledger_no_update BEFORE UPDATE ON "NiceJobsWalletLedger"
FOR EACH ROW EXECUTE FUNCTION nicejobs_reject_change('Posted financial history is immutable');
CREATE TRIGGER nicejobs_wallet_ledger_no_delete BEFORE DELETE ON "NiceJobsWalletLedger"
FOR EACH ROW EXECUTE FUNCTION nicejobs_reject_change('Posted financial history is immutable');

CREATE FUNCTION nicejobs_wallet_ledger_valid_insert_fn() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."status" <> 'POSTED' OR NEW."amountMinor" = 0
    OR NEW."currency" IS DISTINCT FROM (SELECT "currency" FROM "NiceJobsWallet" WHERE "id" = NEW."walletId")
    OR (NEW."type" = 'CREDIT' AND (NEW."amountMinor" < 0 OR NEW."earningId" IS NULL))
    OR (NEW."type" = 'SETTLEMENT' AND (NEW."amountMinor" > 0 OR NEW."statementId" IS NULL))
    OR (NEW."type" = 'REVERSAL' AND (NEW."reversesId" IS NULL
      OR NEW."amountMinor" IS DISTINCT FROM -(SELECT "amountMinor" FROM "NiceJobsWalletLedger" WHERE "id" = NEW."reversesId")
      OR NEW."walletId" IS DISTINCT FROM (SELECT "walletId" FROM "NiceJobsWalletLedger" WHERE "id" = NEW."reversesId")))
  THEN RAISE EXCEPTION 'Invalid financial ledger entry' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER nicejobs_wallet_ledger_valid_insert BEFORE INSERT ON "NiceJobsWalletLedger"
FOR EACH ROW EXECUTE FUNCTION nicejobs_wallet_ledger_valid_insert_fn();

CREATE FUNCTION nicejobs_policy_version_immutable_fn() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."publishedAt" IS NOT NULL AND
    ROW(NEW."definition", NEW."currency", NEW."policyId", NEW."number", NEW."effectiveAt", NEW."expiresAt", NEW."ownerUserId", NEW."reviewerUserId", NEW."reviewedAt", NEW."publishedAt")
    IS DISTINCT FROM
    ROW(OLD."definition", OLD."currency", OLD."policyId", OLD."number", OLD."effectiveAt", OLD."expiresAt", OLD."ownerUserId", OLD."reviewerUserId", OLD."reviewedAt", OLD."publishedAt")
  THEN RAISE EXCEPTION 'Published incentive policy is immutable' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER nicejobs_policy_version_immutable BEFORE UPDATE ON "NiceJobsIncentiveVersion"
FOR EACH ROW EXECUTE FUNCTION nicejobs_policy_version_immutable_fn();

CREATE FUNCTION nicejobs_earning_calculation_immutable_fn() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW."assignmentId", NEW."policyId", NEW."policyVersionId", NEW."snapshotId", NEW."periodStart", NEW."periodEnd", NEW."currency", NEW."amountMinor", NEW."eligibility", NEW."calculation", NEW."creatorUserId")
    IS DISTINCT FROM
    ROW(OLD."assignmentId", OLD."policyId", OLD."policyVersionId", OLD."snapshotId", OLD."periodStart", OLD."periodEnd", OLD."currency", OLD."amountMinor", OLD."eligibility", OLD."calculation", OLD."creatorUserId")
  THEN RAISE EXCEPTION 'Incentive calculation is immutable' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER nicejobs_earning_calculation_immutable BEFORE UPDATE ON "NiceJobsIncentiveEarning"
FOR EACH ROW EXECUTE FUNCTION nicejobs_earning_calculation_immutable_fn();

CREATE FUNCTION nicejobs_adjustment_proposal_immutable_fn() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW."walletId", NEW."policyVersionId", NEW."direction", NEW."amountMinor", NEW."reason", NEW."description", NEW."privateNote", NEW."creatorUserId")
    IS DISTINCT FROM
    ROW(OLD."walletId", OLD."policyVersionId", OLD."direction", OLD."amountMinor", OLD."reason", OLD."description", OLD."privateNote", OLD."creatorUserId")
  THEN RAISE EXCEPTION 'Financial proposal is immutable' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER nicejobs_adjustment_proposal_immutable BEFORE UPDATE ON "NiceJobsWalletAdjustment"
FOR EACH ROW EXECUTE FUNCTION nicejobs_adjustment_proposal_immutable_fn();

CREATE FUNCTION nicejobs_statement_snapshot_immutable_fn() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW."periodId", NEW."walletId", NEW."currency", NEW."amountMinor", NEW."snapshot")
       IS DISTINCT FROM ROW(OLD."periodId", OLD."walletId", OLD."currency", OLD."amountMinor", OLD."snapshot")
    OR (OLD."status" IN ('APPROVED', 'VOIDED') AND NEW."status" IS DISTINCT FROM OLD."status")
  THEN RAISE EXCEPTION 'Settlement statement is immutable' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER nicejobs_statement_snapshot_immutable BEFORE UPDATE ON "NiceJobsSettlementStatement"
FOR EACH ROW EXECUTE FUNCTION nicejobs_statement_snapshot_immutable_fn();

CREATE TRIGGER nicejobs_payout_no_false_confirmation BEFORE UPDATE ON "NiceJobsPayoutIntent"
FOR EACH ROW EXECUTE FUNCTION nicejobs_reject_change('No payment executor or provider is configured');

CREATE FUNCTION nicejobs_payout_valid_intent_fn() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."status" <> 'PROVIDER_NOT_CONFIGURED' OR NEW."providerReference" IS NOT NULL OR NEW."amountMinor" <= 0
    OR NOT EXISTS (
      SELECT 1 FROM "NiceJobsSettlementStatement" s
      JOIN "NiceJobsWalletLedger" l ON l."statementId" = s."id"
      WHERE s."id" = NEW."statementId" AND s."status" = 'APPROVED'
        AND s."amountMinor" = NEW."amountMinor" AND s."currency" = NEW."currency"
        AND l."amountMinor" = -s."amountMinor" AND l."currency" = s."currency")
  THEN RAISE EXCEPTION 'Invalid internal payout intent' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER nicejobs_payout_valid_intent BEFORE INSERT ON "NiceJobsPayoutIntent"
FOR EACH ROW EXECUTE FUNCTION nicejobs_payout_valid_intent_fn();

CREATE FUNCTION nicejobs_wallet_identity_immutable_fn() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."assignmentId" IS DISTINCT FROM OLD."assignmentId" OR NEW."currency" IS DISTINCT FROM OLD."currency"
  THEN RAISE EXCEPTION 'Wallet owner and currency are immutable' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER nicejobs_wallet_identity_immutable BEFORE UPDATE ON "NiceJobsWallet"
FOR EACH ROW EXECUTE FUNCTION nicejobs_wallet_identity_immutable_fn();

CREATE FUNCTION nicejobs_ledger_approved_source_fn() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  current_balance bigint;
BEGIN
  -- Updating the parent row serializes postings under READ COMMITTED and forces a
  -- serialization failure under a stale REPEATABLE READ/SERIALIZABLE snapshot.
  UPDATE "NiceJobsWallet" SET "revision" = "revision" + 1 WHERE "id" = NEW."walletId";
  IF NOT FOUND THEN RAISE EXCEPTION 'Wallet unavailable' USING ERRCODE = '23514'; END IF;
  SELECT COALESCE(SUM("amountMinor"), 0) INTO current_balance
  FROM "NiceJobsWalletLedger" WHERE "walletId" = NEW."walletId";
  IF NEW."type" NOT IN ('CREDIT', 'ADJUSTMENT', 'REVERSAL', 'SETTLEMENT')
    OR NEW."amountMinor" NOT BETWEEN -9000000000000 AND 9000000000000
    OR current_balance + NEW."amountMinor" NOT BETWEEN 0 AND 9000000000000
    OR (NEW."type" = 'CREDIT' AND NOT EXISTS (
      SELECT 1 FROM "NiceJobsIncentiveEarning" e
      JOIN "NiceJobsWallet" w ON w."id" = NEW."walletId"
      JOIN "OperationalRequest" r ON r."id" = e."requestId"
      WHERE e."id" = NEW."earningId" AND e."status" = 'APPROVED'
        AND e."eligibility" = 'ELIGIBLE' AND e."amountMinor" = NEW."amountMinor"
        AND e."currency" = NEW."currency" AND e."assignmentId" = w."assignmentId"
        AND r."status" = 'APPROVED' AND r."siaId" IS NULL))
    OR (NEW."type" IN ('ADJUSTMENT', 'REVERSAL') AND NOT EXISTS (
      SELECT 1 FROM "NiceJobsWalletAdjustment" a
      JOIN "OperationalRequest" r ON r."id" = a."requestId"
      WHERE a."id" = NEW."adjustmentId" AND a."status" = 'APPROVED'
        AND a."walletId" = NEW."walletId"
        AND (CASE WHEN a."direction" = 'CREDIT' THEN a."amountMinor" ELSE -a."amountMinor" END) = NEW."amountMinor"
        AND r."status" = 'APPROVED' AND r."siaId" IS NULL))
    OR (NEW."type" = 'SETTLEMENT' AND NOT EXISTS (
      SELECT 1 FROM "NiceJobsSettlementStatement" s
      JOIN "NiceJobsSettlementPeriod" p ON p."id" = s."periodId"
      JOIN "OperationalRequest" r ON r."id" = p."requestId"
      WHERE s."id" = NEW."statementId" AND s."status" = 'APPROVED'
        AND s."walletId" = NEW."walletId" AND -s."amountMinor" = NEW."amountMinor"
        AND s."currency" = NEW."currency" AND r."status" = 'APPROVED' AND r."siaId" IS NULL))
  THEN RAISE EXCEPTION 'Approved financial source and bounded funds required' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER nicejobs_ledger_approved_source BEFORE INSERT ON "NiceJobsWalletLedger"
FOR EACH ROW EXECUTE FUNCTION nicejobs_ledger_approved_source_fn();

CREATE FUNCTION nicejobs_automation_published_material_fn() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."publishedAt" IS NOT NULL AND
    ROW(NEW."definition", NEW."ruleId", NEW."number", NEW."reviewedByUserId", NEW."reviewedByPersonId", NEW."reviewedAt", NEW."publishedAt")
    IS DISTINCT FROM
    ROW(OLD."definition", OLD."ruleId", OLD."number", OLD."reviewedByUserId", OLD."reviewedByPersonId", OLD."reviewedAt", OLD."publishedAt")
  THEN RAISE EXCEPTION 'published automation material is immutable' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "NiceJobsAutomationPublishedMaterialImmutable" BEFORE UPDATE ON "NiceJobsAutomationVersion"
FOR EACH ROW EXECUTE FUNCTION nicejobs_automation_published_material_fn();

CREATE FUNCTION nicejobs_automation_published_delete_fn() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."publishedAt" IS NOT NULL
  THEN RAISE EXCEPTION 'published automation cannot be deleted' USING ERRCODE = '23514'; END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER "NiceJobsAutomationPublishedDeleteForbidden" BEFORE DELETE ON "NiceJobsAutomationVersion"
FOR EACH ROW EXECUTE FUNCTION nicejobs_automation_published_delete_fn();
