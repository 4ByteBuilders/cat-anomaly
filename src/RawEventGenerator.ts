import { EventType } from '@prisma/client';
import { faker } from '@faker-js/faker';
import { prisma } from './lib/prismaClient';

// Helper function to create a delay in milliseconds
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function generateEventValue(eventType: EventType) {
  switch (eventType) {
    case 'ENGINE_STATUS':
      const status = faker.helpers.arrayElement(['IDLE', 'RUNNING', 'OFF']);
      return {
        status,
        rpm: status === 'RUNNING' ? faker.number.int({ min: 1200, max: 2500 }) : faker.number.int({ min: 700, max: 900 }),
      };
    case 'FUEL_LEVEL':
      return {
        level: faker.number.float({ min: 5, max: 100, fractionDigits: 1 }),
      };
    case 'LOCATION_UPDATE':
      return {
        lat: faker.location.latitude({ min: 12.8, max: 13.0 }),
        long: faker.location.longitude({ min: 79.0, max: 79.2 }),
      };
    case 'ENGINE_TEMP':
      return {
        temp: faker.number.int({ min: 85, max: 105 }),
      };
    case 'DIAGNOSTIC_CODE':
      return {
        code: `P${faker.string.alphanumeric(4).toUpperCase()}`,
        severity: faker.helpers.arrayElement(['LOW', 'MEDIUM', 'HIGH']),
      };
    default:
      return {};
  }
}

// --- Exported function for background log generation ---
export async function startLogGeneration() {
  console.log('🚀 Starting Edge Simulator Job...');
  console.log('This will run continuously to generate raw event logs.');
  console.log('Press Ctrl+C to stop.');

  while (true) {
    try {
      const rentedEquipment = await prisma.equipment.findMany({
        where: {
          status: 'rented',
        },
      });

      if (rentedEquipment.length === 0) {
        console.log('No rented equipment found. Waiting...');
        await sleep(10000);
        continue;
      }

      const randomEquipment = faker.helpers.arrayElement(rentedEquipment);
      const randomEventType = faker.helpers.arrayElement(Object.values(EventType));
      const eventData = {
        equipmentId: randomEquipment.equipmentId,
        eventType: randomEventType,
        value: generateEventValue(randomEventType),
      };

      await prisma.rawEventLog.create({
        data: eventData,
      });

      console.log(`[${new Date().toISOString()}] 📝 Logged event: ${randomEventType} for Equipment ID: ${randomEquipment.equipmentId}`);

      const randomDelay = faker.number.int({ min: 1000, max: 5000 });
      await sleep(randomDelay);

    } catch (error) {
      console.error('An error occurred during simulation:', error);
      await sleep(15000);
    }
  }
}