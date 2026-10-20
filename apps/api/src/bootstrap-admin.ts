import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { createDatabase, getSqliteFile } from './db/index.js';
import { users } from './db/schema.js';

const args = process.argv.slice(2);
const emailIndex = args.indexOf('--email');
const passwordIndex = args.indexOf('--password');
const hasOnlyExpectedArguments = args.length === 4 && emailIndex !== passwordIndex && emailIndex >= 0 && passwordIndex >= 0;

if (!hasOnlyExpectedArguments) {
  throw new Error('Uso: npm run bootstrap-admin -- --email <email> --password <senha>');
}

const email = args[emailIndex + 1]?.trim().toLowerCase();
const password = args[passwordIndex + 1];
if (!email || !password || password.length < 12) throw new Error('Informe um e-mail e uma senha com pelo menos 12 caracteres');
const db = new Database(getSqliteFile());
try {
  const database = createDatabase(db);
  const user = database.select({ id: users.id }).from(users).where(eq(users.email, email)).get();
  if (!user) throw new Error('Usuário não encontrado; crie a conta primeiro');
  database.update(users).set({ role: 'admin' }).where(eq(users.id, user.id)).run();
  console.info('Papel admin concedido ao usuário informado.');
} finally { db.close(); }
