// app
export const PORT = process.env.PORT || 3000;
export const DATABASE_URL = process.env.DATABASE_URL || 'file:./dev.db';
export const NODE_ENV = process.env.NODE_ENV || 'development';

// ai
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
export const GEMINI_MODEL = process.env.GEMINI_MODEL || '';

// onboarding
const MAX_FILE_SIZE_MB = Number(process.env.MAX_FILE_SIZE_MB) || 5;
export const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024; // Convert MB to bytes
export const MAX_FILES = Number(process.env.MAX_FILES) || 3;

// products
export const BATCH_SIZE = Number(process.env.BATCH_SIZE) || 10;
