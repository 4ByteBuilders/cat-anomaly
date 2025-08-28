import { startLogGeneration } from './RawEventGenerator';

// ... other imports for your application (e.g., Express)

async function main() {
  // --- Start the background job ---
  startLogGeneration();

  // --- Start your main application logic here ---
  // For example, Express server setup
  console.log('✅ Main application has started.');
}

main().catch(console.error);