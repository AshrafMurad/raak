/**
 * Env preload: backend/.env wins over workspace root .env (dotenv never
 * overrides variables already present in process.env). Runs before config loads.
 */
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ quiet: true }); // ./backend/.env when run via package scripts
dotenv.config({ path: path.resolve(process.cwd(), '../.env'), quiet: true }); // workspace root
