import dotenv from 'dotenv';

// Load .env before validating — this file must be the first import in index.ts
dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('FATAL: JWT_SECRET env var must be set and at least 32 characters long');
  process.exit(1);
}

export const jwtSecret: string = JWT_SECRET;
