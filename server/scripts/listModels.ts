import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

async function main() {
  const resp = await ai.models.list();
  for await (const model of resp) {
    console.log(model.name, '|', model.supportedGenerationMethods?.join(', '));
  }
}

main().catch(console.error);
