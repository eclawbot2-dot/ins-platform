-- CreateEnum
CREATE TYPE "PolicyAnalysisSource" AS ENUM ('PUBLIC_UPLOAD', 'CLIENT_PORTAL', 'STAFF');

-- CreateEnum
CREATE TYPE "PolicyAnalysisStatus" AS ENUM ('PENDING', 'EXTRACTING', 'ANALYZED', 'FAILED', 'MANUAL_REVIEW');

-- CreateTable
CREATE TABLE "PolicyAnalysis" (
    "id" TEXT NOT NULL,
    "source" "PolicyAnalysisSource" NOT NULL,
    "status" "PolicyAnalysisStatus" NOT NULL DEFAULT 'PENDING',
    "uploaderName" TEXT,
    "uploaderEmail" TEXT,
    "clientId" TEXT,
    "createdById" TEXT,
    "leadId" TEXT,
    "lineOfBusiness" "LineOfBusiness",
    "carrierName" TEXT,
    "extractedJson" JSONB,
    "summaryText" TEXT,
    "gapsJson" JSONB,
    "recommendationsJson" JSONB,
    "score" INTEGER,
    "fileKey" TEXT,
    "fileName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PolicyAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PolicyAnalysis_source_status_idx" ON "PolicyAnalysis"("source", "status");

-- CreateIndex
CREATE INDEX "PolicyAnalysis_clientId_idx" ON "PolicyAnalysis"("clientId");

-- CreateIndex
CREATE INDEX "PolicyAnalysis_createdAt_idx" ON "PolicyAnalysis"("createdAt");

-- AddForeignKey
ALTER TABLE "PolicyAnalysis" ADD CONSTRAINT "PolicyAnalysis_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyAnalysis" ADD CONSTRAINT "PolicyAnalysis_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyAnalysis" ADD CONSTRAINT "PolicyAnalysis_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
