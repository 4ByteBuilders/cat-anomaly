import { EventType } from '@prisma/client';
import { faker } from '@faker-js/faker';
import { prisma } from './lib/prismaClient.js';

// Helper function to create a delay in milliseconds
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// --- Stateful device context ---
type EquipmentState = {
  status: 'IDLE' | 'RUNNING' | 'OFF';
  rpm: number;
  fuelLevel: number;
  lat: number;
  long: number;
  temp: number;
  hydraulicPressure: number;
};

const initialState = (): EquipmentState => ({
  status: 'IDLE',
  rpm: 750,
  fuelLevel: faker.number.float({ min: 200, max: 400, fractionDigits: 1 }), // Large tank
  lat: faker.location.latitude({ min: 12.900, max: 12.910 }), // Small site boundary
  long: faker.location.longitude({ min: 79.100, max: 79.110 }),
  temp: faker.number.int({ min: 75, max: 90 }), // Engine temp
  hydraulicPressure: faker.number.int({ min: 3000, max: 4500 }), // psi
});

function updateState(state: EquipmentState): EquipmentState {
  // Simulate status transitions
  const statusTransition = faker.helpers.arrayElement(['IDLE', 'RUNNING', 'OFF']);
  state.status = statusTransition;

  // RPM based on status
  state.rpm = state.status === 'RUNNING'
    ? faker.number.int({ min: 1200, max: 2200 })
    : faker.number.int({ min: 600, max: 900 });

  // Fuel consumption if running
  if (state.status === 'RUNNING') {
    state.fuelLevel = Math.max(0, state.fuelLevel - faker.number.float({ min: 1.0, max: 5.0, fractionDigits: 2 }));
  } else if (state.status === 'IDLE') {
    state.fuelLevel = Math.max(0, state.fuelLevel - faker.number.float({ min: 0.2, max: 1.0, fractionDigits: 2 }));
  }

  // Location drift (simulate small movement within site)
  state.lat = Math.min(12.910, Math.max(12.900, state.lat + faker.number.float({ min: -0.0002, max: 0.0002, fractionDigits: 6 })));
  state.long = Math.min(79.110, Math.max(79.100, state.long + faker.number.float({ min: -0.0002, max: 0.0002, fractionDigits: 6 })));

  // Temperature changes
  state.temp = Math.min(110, Math.max(70, state.temp + faker.number.int({ min: -2, max: 3 })));

  // Hydraulic pressure fluctuation
  state.hydraulicPressure = Math.min(5000, Math.max(2500, state.hydraulicPressure + faker.number.int({ min: -50, max: 50 })));

  return state;
}

function generateEventValue(eventType: EventType, state: EquipmentState) {
  switch (eventType) {
    case 'ENGINE_STATUS':
      return { status: state.status, rpm: state.rpm };
    case 'FUEL_LEVEL':
      return { level: state.fuelLevel };
    case 'LOCATION_UPDATE':
      return { lat: state.lat, long: state.long };
    case 'ENGINE_TEMP':
      return { temp: state.temp };
    case 'DIAGNOSTIC_CODE':
      return { code: `P${faker.string.alphanumeric(4).toUpperCase()}`, severity: faker.helpers.arrayElement(['LOW', 'MEDIUM', 'HIGH']) };
    case 'PAYLOAD_CYCLE':
      return {
        payloadTonnes: faker.number.float({ min: 5, max: 40, fractionDigits: 1 }),
        cycleTimeSeconds: faker.number.int({ min: 30, max: 180 })
      };
    case 'HYDRAULIC_PRESSURE':
      return { pressurePsi: state.hydraulicPressure };
    default:
      return {};
  }
}

// --- Exported function for background log generation ---
export async function startLogGeneration() {
  console.log('🚀 Starting Edge Simulator Job...');
  console.log('This will run continuously to generate raw event logs.');
  console.log('Press Ctrl+C to stop.');

  // Map to hold state for each equipment
  const equipmentStates: Record<string, EquipmentState> = {};

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

      // Pick a random equipment
      const randomEquipment = faker.helpers.arrayElement(rentedEquipment);

      // Initialize state if not present
      if (!equipmentStates[randomEquipment.equipmentId]) {
        equipmentStates[randomEquipment.equipmentId] = initialState();
      }

      // Update state for this equipment
      const state = updateState(equipmentStates[randomEquipment.equipmentId]);

      // Pick a random event type
      const randomEventType = faker.helpers.arrayElement(Object.values(EventType));
      const eventData = {
        equipmentId: randomEquipment.equipmentId,
        eventType: randomEventType,
        value: generateEventValue(randomEventType, state),
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