import { startLogGeneration } from './RawEventGenerator';
import { startRawLogProcessor } from './UsageStatisticsAggregator';

// ... other imports for your application (e.g., Express)

async function main() {
  // --- Start the background job ---
  startLogGeneration();
  startRawLogProcessor();
  // --- Start your main application logic here ---
  // For example, Express server setup
  console.log('✅ Main application has started.');
}

main().catch(console.error);