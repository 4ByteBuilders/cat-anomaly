import { startAnomalyDetector } from "./AnomalyDetector.js";
import { startLogGeneration } from "./RawEventGenerator.js";
import { startRawLogProcessor } from "./UsageStatisticsAggregator.js";

async function main() {
  // --- Start the background job ---
  startLogGeneration(); //comment out when doing actual thing
  startRawLogProcessor();
  startAnomalyDetector();
  // --- Start your main application logic here ---
  // For example, Express server setup
  console.log('✅ Main application has started.');
}

main().catch(console.error);