import 'dotenv/config';
import { validateProviderConfig, createAiProvider } from '../services/aiProviders';
import { buildSystemPrompt, buildUserMessage } from '../services/extractionPrompt';

async function main() {
  try {
    validateProviderConfig();
  } catch (err) {
    console.error('Provider config validation failed:', err instanceof Error ? err.message : err);
    process.exit(2);
  }

  const provider = createAiProvider();
  console.log('Using provider:', provider.name);

  // Use a tiny harmless prompt that asks for a minimal JSON object.
  const system = buildSystemPrompt(['HealthCheck']);
  const user = buildUserMessage([{ HealthCheck: 'ping' }], 0, 1);

  try {
    const text = await provider.chat(system, user);
    console.log('Provider responded (first 100 chars):', text.slice(0, 100));
    console.log('Provider smoke-test: SUCCESS');
    process.exit(0);
  } catch (err) {
    console.error('Provider smoke-test: FAILED');
    console.error(err instanceof Error ? err.stack || err.message : String(err));
    process.exit(3);
  }
}

main();
