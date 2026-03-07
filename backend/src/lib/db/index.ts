import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';
import path from 'path';
import fs from 'fs';

const DATA_DIR =
  process.env.DATA_DIR || (process.env.VERCEL === '1' ? '/tmp' : process.cwd());
const DB_DIR = path.join(DATA_DIR, './data');
fs.mkdirSync(DB_DIR, { recursive: true });
const sqlite = new Database(path.join(DATA_DIR, './data/db.sqlite'));
const db = drizzle(sqlite, {
  schema: schema,
});

export default db;
