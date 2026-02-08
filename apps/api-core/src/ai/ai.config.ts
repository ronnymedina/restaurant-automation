import { registerAs } from '@nestjs/config';
import { GEMINI_API_KEY, GEMINI_MODEL } from '../config';

export const aiConfig = registerAs('ai', () => ({
  apiKey: GEMINI_API_KEY,
  model: GEMINI_MODEL,
}));
