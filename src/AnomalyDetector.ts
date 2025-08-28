import { PrismaClient, LineItem, LineItemUsage, AnomalyType, AnomalySeverity, RawEventLog } from '@prisma/client';
import cron from 'node-cron';

const prisma = new PrismaClient();

async function createAnomalyIfNotExists(lineItemId: string, anomalyType: AnomalyType, severity: AnomalySeverity, details: object) {
    const existingAnomaly = await prisma.anomalyLog.findFirst({
        where: { lineItemId, anomalyType, status: 'UNRESOLVED' },
    });

    if (!existingAnomaly) {
        await prisma.anomalyLog.create({
            data: {
                lineItemId,
                anomalyType,
                severity,
                details,
            },
        });
        console.log(`[Anomaly Detector] 🚩 Created new anomaly: ${anomalyType} for LineItem ${lineItemId}`);
    }
}

async function checkForAnomalies() {
    console.log(`[Anomaly Detector] 🕵️‍♀️ Running job at ${new Date().toISOString()}`);

    const activeLineItemsWithUsage = await prisma.lineItem.findMany({
        where: {
            startDate: { lte: new Date() },
            endDate: { gte: new Date() },
            usage: { isNot: null },
        },
        include: {
            usage: true,
            contract: true, // Needed for siteId
        },
    });

    for (const item of activeLineItemsWithUsage) {
        const usage = item.usage!;
        const oneHourAgo = new Date(new Date().getTime() - 60 * 60 * 1000);

        // --- 1. Aggregated Data Anomalies (from LineItemUsage) ---

        // POOR_WORKING_TO_IDLE_RATIO
        if (usage.workingToIdleRatio < 50 && usage.totalEngineHours > 10) {
            await createAnomalyIfNotExists(item.lineItemId, AnomalyType.POOR_WORKING_TO_IDLE_RATIO, AnomalySeverity.MEDIUM, {
                workingToIdleRatio: parseFloat(usage.workingToIdleRatio.toFixed(2)),
                threshold: 50,
            });
        }

        // HIGH_FUEL_BURN_RATE
        if (usage.fuelBurnRate > 10 && usage.workingHours > 5) {
            await createAnomalyIfNotExists(item.lineItemId, AnomalyType.HIGH_FUEL_BURN_RATE, AnomalySeverity.LOW, {
                currentBurnRate: parseFloat(usage.fuelBurnRate.toFixed(2)),
                benchmarkRate: 8.0,
            });
        }

        // SLOW_CYCLE_TIME
        if (usage.avgCycleTimeSeconds && usage.avgCycleTimeSeconds > 150) {
            await createAnomalyIfNotExists(item.lineItemId, AnomalyType.SLOW_CYCLE_TIME, AnomalySeverity.LOW, {
                avgCycleTimeSeconds: usage.avgCycleTimeSeconds,
                benchmarkSeconds: 120,
            });
        }

        // MISSED_MAINTENANCE_WINDOW
        const maintenanceInterval = 250;
        if (usage.totalEngineHours > maintenanceInterval && (usage.totalEngineHours % maintenanceInterval) < 10) { // Flag within 10 hours of interval
            await createAnomalyIfNotExists(item.lineItemId, AnomalyType.MISSED_MAINTENANCE_WINDOW, AnomalySeverity.MEDIUM, {
                totalEngineHours: usage.totalEngineHours,
                nextServiceDueAt: Math.ceil(usage.totalEngineHours / maintenanceInterval) * maintenanceInterval,
            });
        }

        // --- 2. Event-Based Anomalies (from RawEventLog in the last hour) ---
        // Note: In a production system, these might be better handled in the FogProcessor for efficiency.
        const recentLogs = await prisma.rawEventLog.findMany({
            where: {
                equipmentId: item.equipmentId,
                timestamp: { gte: oneHourAgo },
            },
        });

        if (recentLogs.length === 0) continue;

        // GEOFENCE_BREACH
        const siteGeofence = { lat: 12.9716, long: 79.1588, radiusKm: 5 }; // Example: 5km radius around Vellore
        const locationLog = recentLogs.find(l => l.eventType === 'LOCATION_UPDATE');
        if (locationLog) {
            const val = locationLog.value as any;
            const R = 6371; // Radius of the earth in km
            const dLat = (val.lat - siteGeofence.lat) * (Math.PI / 180);
            const dLon = (val.long - siteGeofence.long) * (Math.PI / 180);
            const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(siteGeofence.lat * (Math.PI / 180)) * Math.cos(val.lat * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            const distance = R * c; // Distance in km
            if (distance > siteGeofence.radiusKm) {
                await createAnomalyIfNotExists(item.lineItemId, AnomalyType.GEOFENCE_BREACH, AnomalySeverity.HIGH, {
                    lastKnownLocation: { lat: val.lat, long: val.long },
                    site: item.contract.siteId,
                });
            }
        }

        // AFTER_HOURS_OPERATION
        const afterHoursLog = recentLogs.find(l => {
            const hour = new Date(l.timestamp).getHours();
            return (l.eventType === 'ENGINE_STATUS' && (l.value as any).status !== 'OFF' && (hour < 6 || hour > 19)); // 7 PM to 6 AM
        });
        if (afterHoursLog) {
            await createAnomalyIfNotExists(item.lineItemId, AnomalyType.AFTER_HOURS_OPERATION, AnomalySeverity.MEDIUM, {
                eventTime: afterHoursLog.timestamp.toISOString(),
            });
        }

        // SUDDEN_FUEL_DROP
        const fuelLogs = recentLogs.filter(l => l.eventType === 'FUEL_LEVEL').sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        for (let i = 1; i < fuelLogs.length; i++) {
            const prevLevel = (fuelLogs[i - 1].value as any).level;
            const currentLevel = (fuelLogs[i].value as any).level;
            if (prevLevel - currentLevel > 15) { // Drop of > 15%
                await createAnomalyIfNotExists(item.lineItemId, AnomalyType.SUDDEN_FUEL_DROP, AnomalySeverity.HIGH, {
                    fromLevel: prevLevel,
                    toLevel: currentLevel,
                });
                break;
            }
        }

        // HIGH_ENGINE_TEMP
        const highTempLog = recentLogs.find(l => l.eventType === 'ENGINE_TEMP' && (l.value as any).temp > 102);
        if (highTempLog) {
            await createAnomalyIfNotExists(item.lineItemId, AnomalyType.HIGH_ENGINE_TEMP, AnomalySeverity.HIGH, {
                temperature: (highTempLog.value as any).temp,
                threshold: 102,
            });
        }

        // FREQUENT_DIAGNOSTIC_ERRORS
        const errorLogs = recentLogs.filter(l => l.eventType === 'DIAGNOSTIC_CODE');
        const errorCounts = errorLogs.reduce((acc, log) => {
            const code = (log.value as any).code;
            acc[code] = (acc[code] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
        for (const code in errorCounts) {
            if (errorCounts[code] >= 3) {
                await createAnomalyIfNotExists(item.lineItemId, AnomalyType.FREQUENT_DIAGNOSTIC_ERRORS, AnomalySeverity.MEDIUM, {
                    errorCode: code,
                    countInLastHour: errorCounts[code],
                });
            }
        }
    }
}

export function startAnomalyDetector() {
    console.log('🕵️‍♀️ Anomaly Detector Cron Job scheduled to run every hour.');
    // cron.schedule('0 * * * *', checkForAnomalies);
    cron.schedule('* * * * *', checkForAnomalies);
}