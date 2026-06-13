-- Remove the group / employee-benefits module.
-- Tabor does NOT write company/group employee benefits; the platform
-- stays out of that line. Data was demo-seed only, so a clean drop is safe.

-- DropTable (drops its FK to Client and indexes with it)
DROP TABLE "GroupPlan";

-- DropColumn
ALTER TABLE "Client" DROP COLUMN "hasBenefits";

-- DropEnum (only used by GroupPlan)
DROP TYPE "GroupPlanType";
DROP TYPE "RateBasis";
