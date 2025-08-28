import { RawEventLog } from '@prisma/client';
import cron from 'node-cron';
import { prisma } from './lib/prismaClient.js';

/**
 * The main job function that fetches raw logs, processes them into advanced
 * metrics, and updates the usage statistics for each active line item.
 */
async function processRawLogs() {
  console.log(`[Fog Processor] 🌫️ Running job at ${new Date().toISOString()}`);

  // 1. Fetch all unprocessed logs from the database
  const unprocessedLogs = await prisma.rawEventLog.findMany({
    where: { isProcessed: false },
  });

  if (unprocessedLogs.length === 0) {
    console.log('[Fog Processor] No new logs to process.');
    return;
  }

  // 2. Group the logs by their equipmentId for batch processing
  const logsByEquipment = unprocessedLogs.reduce((acc, log) => {
    (acc[log.equipmentId] = acc[log.equipmentId] || []).push(log);
    return acc;
  }, {} as Record<string, RawEventLog[]>);

  // 3. Process the logs for each piece of equipment
  for (const equipmentId in logsByEquipment) {
    const now = new Date();
    // Find the currently active contract (LineItem) for this equipment
    const activeLineItem = await prisma.lineItem.findFirst({
      where: {
        equipmentId: equipmentId,
        startDate: { lte: now },
        endDate: { gte: now },
      },
    });

    // If no active contract, skip these logs for now
    if (!activeLineItem) continue;

    const logs = logsByEquipment[equipmentId];
    
    // --- Step A: Calculate metrics from this specific batch of logs ---
    const batchMetrics = {
        totalEngineHours: logs.filter(l => (l.value as any).status === 'RUNNING' || (l.value as any).status === 'IDLE').length * 0.1, // Simplified: each log event represents ~6 mins of runtime
        totalIdleHours: logs.filter(l => (l.value as any).status === 'IDLE').length * 0.1,
        payloadMovedTonnes: logs.filter(l => l.eventType === 'PAYLOAD_CYCLE').reduce((sum, l) => sum + (l.value as any).payloadTonnes, 0),
        // We need these to calculate the average cycle time later
        totalCycleTimeSeconds: logs.filter(l => l.eventType === 'PAYLOAD_CYCLE').reduce((sum, l) => sum + (l.value as any).cycleTimeSeconds, 0),
        cycleCount: logs.filter(l => l.eventType === 'PAYLOAD_CYCLE').length,
    };
    
    // --- Step B: Use a transaction to ensure data consistency ---
    await prisma.$transaction(async (tx) => {
      // Get the existing usage data for this line item, or create a default if it's the first time
      const existingUsage = await tx.lineItemUsage.findUnique({
          where: { lineItemId: activeLineItem.lineItemId },
      }) || { totalEngineHours: 0, totalIdleHours: 0, payloadMovedTonnes: 0, totalCycleTimeSeconds: 0, cycleCount: 0 };

      // --- Step C: Combine new and existing data to calculate the final, high-level metrics ---
      const newTotalEngineHours = existingUsage.totalEngineHours + batchMetrics.totalEngineHours;
      const newTotalIdleHours = existingUsage.totalIdleHours + batchMetrics.totalIdleHours;
      const newWorkingHours = newTotalEngineHours - newTotalIdleHours;
      const newFuelConsumed = newTotalEngineHours * 5.5; // Simplified fuel calculation based on total hours
      
      const updatedPayload = (existingUsage as any).payloadMovedTonnes + batchMetrics.payloadMovedTonnes;
      const updatedCycleTime = (existingUsage as any).totalCycleTimeSeconds + batchMetrics.totalCycleTimeSeconds;
      const updatedCycleCount = (existingUsage as any).cycleCount + batchMetrics.cycleCount;

      // --- Step D: Create or update the LineItemUsage record with the new totals ---
      await tx.lineItemUsage.upsert({
        where: { lineItemId: activeLineItem.lineItemId },
        create: {
          lineItemId: activeLineItem.lineItemId,
          totalEngineHours: newTotalEngineHours,
          totalIdleHours: newTotalIdleHours,
          workingHours: newWorkingHours,
          fuelConsumed: newFuelConsumed,
          payloadMovedTonnes: updatedPayload,
          // Derived metrics are calculated from the new totals
          workingToIdleRatio: newTotalEngineHours > 0 ? (newWorkingHours / newTotalEngineHours) * 100 : 0,
          fuelBurnRate: newWorkingHours > 0 ? newFuelConsumed / newWorkingHours : 0,
          avgCycleTimeSeconds: updatedCycleCount > 0 ? updatedCycleTime / updatedCycleCount : 0,
        },
        update: {
          totalEngineHours: { increment: batchMetrics.totalEngineHours },
          totalIdleHours: { increment: batchMetrics.totalIdleHours },
          payloadMovedTonnes: { increment: batchMetrics.payloadMovedTonnes },
          // Overwrite derived metrics with newly calculated values
          workingHours: newWorkingHours,
          fuelConsumed: newFuelConsumed,
          workingToIdleRatio: newTotalEngineHours > 0 ? (newWorkingHours / newTotalEngineHours) * 100 : 0,
          fuelBurnRate: newWorkingHours > 0 ? newFuelConsumed / newWorkingHours : 0,
          avgCycleTimeSeconds: updatedCycleCount > 0 ? updatedCycleTime / updatedCycleCount : 0,
        },
      });

      // --- Step E: Mark the raw logs as processed so they aren't handled again ---
      await tx.rawEventLog.updateMany({
        where: { id: { in: logs.map(log => log.id) } },
        data: { isProcessed: true },
      });
    });
     console.log(`[Fog Processor] ✅ Processed ${logs.length} logs for LineItem: ${activeLineItem.lineItemId}`);
  }
}

/**
 * Starts the cron job to process logs every 3 hours.
 */
export function startRawLogProcessor() {
  console.log('🌫️ Fog Processor Cron Job scheduled to run every 3 hours.');
  // Cron schedule for every 3 hours: '0 */3 * * *'
  // cron.schedule('* * * * *', processRawLogs);
  cron.schedule('0 */3 * * *', processRawLogs);
}
