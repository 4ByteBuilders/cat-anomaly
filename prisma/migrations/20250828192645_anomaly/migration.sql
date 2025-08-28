-- CreateEnum
CREATE TYPE "public"."AnomalySeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "public"."AnomalyStatus" AS ENUM ('UNRESOLVED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "public"."AnomalyType" AS ENUM ('POOR_WORKING_TO_IDLE_RATIO', 'HIGH_FUEL_BURN_RATE', 'SLOW_CYCLE_TIME', 'GEOFENCE_BREACH', 'AFTER_HOURS_OPERATION', 'SUDDEN_FUEL_DROP', 'HIGH_ENGINE_TEMP', 'FREQUENT_DIAGNOSTIC_ERRORS', 'MISSED_MAINTENANCE_WINDOW');

-- CreateTable
CREATE TABLE "public"."DemandForecast" (
    "id" TEXT NOT NULL,
    "equipmentTypeId" TEXT NOT NULL,
    "month" TIMESTAMP(3) NOT NULL,
    "forecastedDemand" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemandForecast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AnomalyLog" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "anomalyType" "public"."AnomalyType" NOT NULL,
    "severity" "public"."AnomalySeverity" NOT NULL,
    "status" "public"."AnomalyStatus" NOT NULL DEFAULT 'UNRESOLVED',
    "details" JSONB NOT NULL,
    "lineItemId" TEXT NOT NULL,

    CONSTRAINT "AnomalyLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DemandForecast_equipmentTypeId_month_idx" ON "public"."DemandForecast"("equipmentTypeId", "month");

-- AddForeignKey
ALTER TABLE "public"."DemandForecast" ADD CONSTRAINT "DemandForecast_equipmentTypeId_fkey" FOREIGN KEY ("equipmentTypeId") REFERENCES "public"."EquipmentType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AnomalyLog" ADD CONSTRAINT "AnomalyLog_lineItemId_fkey" FOREIGN KEY ("lineItemId") REFERENCES "public"."LineItem"("lineItemId") ON DELETE RESTRICT ON UPDATE CASCADE;
