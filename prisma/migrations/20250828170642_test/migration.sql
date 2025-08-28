-- CreateEnum
CREATE TYPE "public"."EventType" AS ENUM ('ENGINE_STATUS', 'FUEL_LEVEL', 'LOCATION_UPDATE', 'ENGINE_TEMP', 'DIAGNOSTIC_CODE', 'PAYLOAD_CYCLE', 'HYDRAULIC_PRESSURE');

-- CreateTable
CREATE TABLE "public"."Client" (
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("clientId")
);

-- CreateTable
CREATE TABLE "public"."EquipmentType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "EquipmentType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Equipment" (
    "equipmentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'available',
    "equipmentTypeId" TEXT NOT NULL,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("equipmentId")
);

-- CreateTable
CREATE TABLE "public"."Contract" (
    "contractId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "clientId" TEXT NOT NULL,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("contractId")
);

-- CreateTable
CREATE TABLE "public"."LineItem" (
    "lineItemId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "totalEngineHours" DOUBLE PRECISION,
    "fuelUsage" DOUBLE PRECISION,
    "downtimeHours" DOUBLE PRECISION,
    "operatingDays" INTEGER,
    "contractId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "lastOperatorId" TEXT,

    CONSTRAINT "LineItem_pkey" PRIMARY KEY ("lineItemId")
);

-- CreateTable
CREATE TABLE "public"."Operator" (
    "operatorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Operator_pkey" PRIMARY KEY ("operatorId")
);

-- CreateTable
CREATE TABLE "public"."WaitingList" (
    "requestId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "equipmentTypeId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "requestedStartDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaitingList_pkey" PRIMARY KEY ("requestId")
);

-- CreateTable
CREATE TABLE "public"."RawEventLog" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "equipmentId" TEXT NOT NULL,
    "eventType" "public"."EventType" NOT NULL,
    "value" JSONB NOT NULL,
    "isProcessed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RawEventLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LineItemUsage" (
    "id" TEXT NOT NULL,
    "totalEngineHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalIdleHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fuelConsumed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "workingHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "workingToIdleRatio" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fuelBurnRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "distanceTraveled" DOUBLE PRECISION DEFAULT 0,
    "payloadMovedTonnes" DOUBLE PRECISION DEFAULT 0,
    "avgCycleTimeSeconds" DOUBLE PRECISION DEFAULT 0,
    "lineItemId" TEXT NOT NULL,

    CONSTRAINT "LineItemUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Client_email_key" ON "public"."Client"("email");

-- CreateIndex
CREATE UNIQUE INDEX "EquipmentType_name_key" ON "public"."EquipmentType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "LineItemUsage_lineItemId_key" ON "public"."LineItemUsage"("lineItemId");

-- AddForeignKey
ALTER TABLE "public"."Equipment" ADD CONSTRAINT "Equipment_equipmentTypeId_fkey" FOREIGN KEY ("equipmentTypeId") REFERENCES "public"."EquipmentType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Contract" ADD CONSTRAINT "Contract_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("clientId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LineItem" ADD CONSTRAINT "LineItem_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "public"."Contract"("contractId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LineItem" ADD CONSTRAINT "LineItem_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "public"."Equipment"("equipmentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LineItem" ADD CONSTRAINT "LineItem_lastOperatorId_fkey" FOREIGN KEY ("lastOperatorId") REFERENCES "public"."Operator"("operatorId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WaitingList" ADD CONSTRAINT "WaitingList_equipmentTypeId_fkey" FOREIGN KEY ("equipmentTypeId") REFERENCES "public"."EquipmentType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LineItemUsage" ADD CONSTRAINT "LineItemUsage_lineItemId_fkey" FOREIGN KEY ("lineItemId") REFERENCES "public"."LineItem"("lineItemId") ON DELETE RESTRICT ON UPDATE CASCADE;
