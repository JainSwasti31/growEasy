import 'dotenv/config';
import app from './app';
import { validateProviderConfig } from './services/aiProviders';

// ── Startup validation ────────────────────────────────────────────────────────
// Fail immediately if AI_PROVIDER or its API key is misconfigured,
// rather than discovering it mid-import on the first request.
try {
  validateProviderConfig();
} catch (err) {
  console.error('❌ Server startup failed:', err instanceof Error ? err.message : err);
  process.exit(1);
}

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;

app.listen(PORT, () => {
  console.log(`🚀 GrowEasy server running on http://localhost:${PORT}`);
  console.log(`   AI provider: ${process.env.AI_PROVIDER ?? 'gemini (default)'}`);
});
