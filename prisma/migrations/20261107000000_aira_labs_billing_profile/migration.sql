CREATE TABLE "LabsBillingProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "legalName" TEXT,
    "registeredAddress" TEXT,
    "registeredState" TEXT,
    "gstin" TEXT,
    "gstRegistrationStatus" TEXT NOT NULL DEFAULT 'NOT_CONFIRMED',
    "pan" TEXT,
    "financialYear" TEXT,
    "companyEmail" TEXT,
    "companyPhone" TEXT,
    "logoReference" TEXT,
    "authorizedSignatory" TEXT,
    "bankDetails" TEXT,
    "quotationTerms" TEXT,
    "invoiceTerms" TEXT,
    "documentFooter" TEXT,
    "profileStatus" TEXT NOT NULL DEFAULT 'INCOMPLETE',
    "taxReviewStatus" TEXT NOT NULL DEFAULT 'PENDING_CA_REVIEW',
    "approvedTaxBasisPoints" TEXT,
    "taxReviewEvidence" TEXT,
    "eInvoiceStatus" TEXT NOT NULL DEFAULT 'PENDING_CA_REVIEW',
    "eInvoiceReviewNote" TEXT,
    "verificationEvidence" TEXT,
    "legalVerifiedAt" TIMESTAMP(3),
    "legalVerifiedByUserId" TEXT,
    "caReviewedAt" TIMESTAMP(3),
    "caReviewedByUserId" TEXT,
    "updatedByUserId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LabsBillingProfile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "LabsBillingProfile_companyId_key" ON "LabsBillingProfile"("companyId");
CREATE INDEX "LabsBillingProfile_profileStatus_updatedAt_idx" ON "LabsBillingProfile"("profileStatus", "updatedAt");

CREATE TABLE "LabsBillingEvidence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "profileId" TEXT,
    "vendorBillId" TEXT,
    "evidenceType" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "verifiedByUserId" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LabsBillingEvidence_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LabsBillingEvidence_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "LabsBillingProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "LabsBillingEvidence_companyId_evidenceType_createdAt_idx" ON "LabsBillingEvidence"("companyId", "evidenceType", "createdAt");

CREATE TABLE "LabsBillingCustomer" (
    "id" TEXT NOT NULL PRIMARY KEY, "companyId" TEXT NOT NULL, "customerType" TEXT NOT NULL, "legalName" TEXT NOT NULL, "businessName" TEXT, "contactPerson" TEXT, "email" TEXT, "phone" TEXT, "billingAddress" TEXT NOT NULL, "state" TEXT NOT NULL, "pinCode" TEXT NOT NULL, "gstRegistrationStatus" TEXT NOT NULL DEFAULT 'UNREGISTERED', "gstin" TEXT, "placeOfSupply" TEXT NOT NULL, "notes" TEXT, "active" BOOLEAN NOT NULL DEFAULT true, "createdByUserId" TEXT NOT NULL, "version" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LabsBillingCustomer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "LabsBillingCustomer_companyId_email_key" ON "LabsBillingCustomer"("companyId", "email");
CREATE INDEX "LabsBillingCustomer_companyId_legalName_active_idx" ON "LabsBillingCustomer"("companyId", "legalName", "active");

CREATE TABLE "LabsBillingService" (
    "id" TEXT NOT NULL PRIMARY KEY, "companyId" TEXT NOT NULL, "category" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT NOT NULL, "scope" TEXT, "deliverables" TEXT, "pricingBasis" TEXT NOT NULL, "defaultPrice" TEXT, "sacCode" TEXT, "gstTreatment" TEXT NOT NULL DEFAULT 'PENDING_CA_REVIEW', "gstBasisPoints" INTEGER, "placeOfSupplyRule" TEXT, "taxApprovalStatus" TEXT NOT NULL DEFAULT 'PENDING_CA_REVIEW', "taxEvidence" TEXT, "active" BOOLEAN NOT NULL DEFAULT false, "createdByUserId" TEXT NOT NULL, "reviewedByUserId" TEXT, "reviewedAt" TIMESTAMP(3), "version" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LabsBillingService_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "LabsBillingService_companyId_name_key" ON "LabsBillingService"("companyId", "name");
CREATE INDEX "LabsBillingService_companyId_active_category_idx" ON "LabsBillingService"("companyId", "active", "category");

CREATE TABLE "LabsBillingSequence" (
    "id" TEXT NOT NULL PRIMARY KEY, "companyId" TEXT NOT NULL, "documentType" TEXT NOT NULL, "financialYear" TEXT NOT NULL, "nextNumber" INTEGER NOT NULL DEFAULT 1, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LabsBillingSequence_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "LabsBillingSequence_companyId_documentType_financialYear_key" ON "LabsBillingSequence"("companyId", "documentType", "financialYear");

CREATE TABLE "LabsBillingInvoice" (
    "id" TEXT NOT NULL PRIMARY KEY, "companyId" TEXT NOT NULL, "divisionId" TEXT NOT NULL, "customerId" TEXT NOT NULL, "quoteId" TEXT NOT NULL, "invoiceNumber" TEXT NOT NULL, "financialYear" TEXT NOT NULL, "issueDate" TIMESTAMP(3) NOT NULL, "dueDate" TIMESTAMP(3), "currency" TEXT NOT NULL, "customerSnapshot" TEXT NOT NULL, "supplierSnapshot" TEXT NOT NULL, "serviceSnapshot" TEXT NOT NULL, "calculationSnapshot" TEXT NOT NULL, "totalAmount" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'ISSUED', "deliveryStatus" TEXT NOT NULL DEFAULT 'NOT_SENT', "sentAt" TIMESTAMP(3), "cancellationReason" TEXT, "cancelledAt" TIMESTAMP(3), "createdByUserId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LabsBillingInvoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LabsBillingInvoice_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LabsBillingInvoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "LabsBillingCustomer"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LabsBillingInvoice_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "ExecutiveRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "LabsBillingInvoice_quoteId_key" ON "LabsBillingInvoice"("quoteId");
CREATE UNIQUE INDEX "LabsBillingInvoice_companyId_invoiceNumber_key" ON "LabsBillingInvoice"("companyId", "invoiceNumber");
CREATE INDEX "LabsBillingInvoice_companyId_status_issueDate_idx" ON "LabsBillingInvoice"("companyId", "status", "issueDate");
CREATE INDEX "LabsBillingInvoice_customerId_issueDate_idx" ON "LabsBillingInvoice"("customerId", "issueDate");

CREATE TABLE "LabsBillingPayment" (
    "id" TEXT NOT NULL PRIMARY KEY, "invoiceId" TEXT NOT NULL, "paymentDate" TIMESTAMP(3) NOT NULL, "amount" TEXT NOT NULL, "paymentMode" TEXT NOT NULL, "bankReference" TEXT, "notes" TEXT, "verificationStatus" TEXT NOT NULL DEFAULT 'PENDING_RECONCILIATION', "recordedByUserId" TEXT NOT NULL, "verifiedByUserId" TEXT, "verifiedAt" TIMESTAMP(3), "reconciliationEvidence" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LabsBillingPayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "LabsBillingInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "LabsBillingPayment_invoiceId_paymentDate_idx" ON "LabsBillingPayment"("invoiceId", "paymentDate");

CREATE TABLE "LabsVendorBill" (
    "id" TEXT NOT NULL PRIMARY KEY, "companyId" TEXT NOT NULL, "vendorName" TEXT NOT NULL, "vendorGstin" TEXT, "vendorInvoiceNumber" TEXT NOT NULL, "billDate" TIMESTAMP(3) NOT NULL, "description" TEXT NOT NULL, "expenseCategory" TEXT NOT NULL, "taxableAmount" TEXT NOT NULL, "gstComponents" TEXT NOT NULL, "totalAmount" TEXT NOT NULL, "dueDate" TIMESTAMP(3), "approvalStatus" TEXT NOT NULL DEFAULT 'PENDING_REVIEW', "approvalEvidence" TEXT, "paymentStatus" TEXT NOT NULL DEFAULT 'UNPAID', "paymentReference" TEXT, "paymentDate" TIMESTAMP(3), "paymentRecordedByUserId" TEXT, "paymentVerifiedByUserId" TEXT, "paymentVerifiedAt" TIMESTAMP(3), "paymentEvidence" TEXT, "createdByUserId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LabsVendorBill_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "LabsVendorBill_companyId_vendorGstin_vendorInvoiceNumber_key" ON "LabsVendorBill"("companyId", "vendorGstin", "vendorInvoiceNumber");
CREATE INDEX "LabsVendorBill_companyId_billDate_paymentStatus_idx" ON "LabsVendorBill"("companyId", "billDate", "paymentStatus");
ALTER TABLE "LabsBillingEvidence" ADD CONSTRAINT "LabsBillingEvidence_vendorBillId_fkey" FOREIGN KEY ("vendorBillId") REFERENCES "LabsVendorBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
