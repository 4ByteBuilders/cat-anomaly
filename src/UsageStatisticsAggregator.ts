import { RawEventLog } from '@prisma/client';
import cron from 'node-cron';
import { prisma } from './lib/prismaClient';

/**
 * Processes a batch of raw logs for a single piece of equipment.
 * @param logs The raw event logs to process.
 * @returns The calculated usage metrics for this batch.
 */
function calculateMetrics(logs: RawEventLog[]) {
  const metrics = {
    totalIdleHours: 0,
    totalEngineHours: 0,
    fuelConsumed: 0,
    highEngineTempAlerts: 0,
    suddenFuelDrops: 0,
    diagnosticErrors: 0,
  };

  let lastFuelReading: number | null = null;

  for (const log of logs) {
    const value = log.value as any; // Type assertion for simplicity

    switch (log.eventType) {
      case 'ENGINE_STATUS':
        if (value.status === 'RUNNING') metrics.totalEngineHours += 0.1; // Assuming each log represents ~6 mins
        if (value.status === 'IDLE') metrics.totalIdleHours += 0.1;
        break;
      case 'FUEL_LEVEL':
        if (lastFuelReading !== null && (lastFuelReading - value.level > 10)) {
            metrics.suddenFuelDrops += 1;
        }
        lastFuelReading = value.level;
        break;
      case 'ENGINE_TEMP':
        if (value.temp > 100) metrics.highEngineTempAlerts += 1;
        break;
      case 'DIAGNOSTIC_CODE':
        if (value.severity === 'HIGH') metrics.diagnosticErrors += 1;
        break;
    }
  }
  // A simple fuel consumption estimate
  metrics.fuelConsumed = metrics.totalEngineHours * 5.5; // 5.5 liters/hour
  return metrics;
}

/**
 * The main job function that fetches, processes, and stores data.
 */
async function processRawLogs() {
  console.log(`[Fog Processor] 🌫️ Running job at ${new Date().toISOString()}`);

  const unprocessedLogs = await prisma.rawEventLog.findMany({
    where: { isProcessed: false },
  });

  if (unprocessedLogs.length === 0) {
    console.log('[Fog Processor] No new logs to process.');
    return;
  }

  // Group logs by equipmentId
  const logsByEquipment = unprocessedLogs.reduce((acc, log) => {
    (acc[log.equipmentId] = acc[log.equipmentId] || []).push(log);
    return acc;
  }, {} as Record<string, RawEventLog[]>);

  for (const equipmentId in logsByEquipment) {
    const now = new Date();
    const activeLineItem = await prisma.lineItem.findFirst({
      where: {
        equipmentId: equipmentId,
        startDate: { lte: now },
        endDate: { gte: now },
      },
    });

    if (!activeLineItem) continue; // Skip logs for equipment not in an active contract

    const metrics = calculateMetrics(logsByEquipment[equipmentId]);

    // Use a transaction to update usage and mark logs as processed
    await prisma.$transaction(async (tx) => {
      await tx.lineItemUsage.upsert({
        where: { lineItemId: activeLineItem.lineItemId },
        create: {
          lineItemId: activeLineItem.lineItemId,
          ...metrics,
          workingHours: metrics.totalEngineHours - metrics.totalIdleHours,
        },
        update: {
          totalEngineHours: { increment: metrics.totalEngineHours },
          totalIdleHours: { increment: metrics.totalIdleHours },
          workingHours: { increment: metrics.totalEngineHours - metrics.totalIdleHours },
          fuelConsumed: { increment: metrics.fuelConsumed },
          highEngineTempAlerts: { increment: metrics.highEngineTempAlerts },
          suddenFuelDrops: { increment: metrics.suddenFuelDrops },
          diagnosticErrors: { increment: metrics.diagnosticErrors },
        },
      });

      await tx.rawEventLog.updateMany({
        where: { id: { in: logsByEquipment[equipmentId].map(log => log.id) } },
        data: { isProcessed: true },
      });
    });
     console.log(`[Fog Processor] ✅ Processed ${logsByEquipment[equipmentId].length} logs for LineItem: ${activeLineItem.lineItemId}`);
  }
}

/**
 * Starts the cron job to process logs every 3 hours.
 */
export function startRawLogProcessor() {
  console.log('🌫️ Fog Processor Cron Job scheduled to run every 3 hours.');
  // Cron schedule for every 3 hours: '0 */3 * * *'
  cron.schedule('0 */3 * * *', processRawLogs);
}