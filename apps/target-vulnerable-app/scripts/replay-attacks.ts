import fs from 'fs';
import path from 'path';

const ATTACKS_PATH = path.join(__dirname, '../fixtures/attacks.json');
const API_URL = 'http://localhost:3000/api/chat';

async function runAttacks() {
  if (!fs.existsSync(ATTACKS_PATH)) {
    console.error(`❌ Fixture file not found: ${ATTACKS_PATH}`);
    process.exit(1);
  }

  const attacks = JSON.parse(fs.readFileSync(ATTACKS_PATH, 'utf-8'));

  console.log(`🚀 Replaying ${attacks.length} scenarios against ${API_URL}...\n`);

  for (const attack of attacks) {
    console.log(`\x1b[36m--- Scenario: ${attack.name} ---\x1b[0m`);
    console.log(`\x1b[90mDescription: ${attack.description}\x1b[0m`);
    console.log(`Prompt: "${attack.prompt}"`);

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: attack.prompt }],
          riskSeed: attack.riskSeed
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json() as any;
      
      console.log(`Response: \x1b[32m${data.message.content}\x1b[0m`);
      console.log(`Session ID: ${data.sessionId}`);
      console.log(`Trace ID: ${data.traceId}`);
      console.log(`Phoenix Trace: http://localhost:6006/traces/${data.traceId}`);
    } catch (error: any) {
      console.error(`\x1b[31m❌ Error: ${error.message}\x1b[0m`);
      console.log('Ensure the target app is running at http://localhost:3000');
    }
    console.log('\n');
  }
}

runAttacks().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
