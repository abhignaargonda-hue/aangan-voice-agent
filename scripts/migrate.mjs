// Creates the tables in Neon. Safe to re-run (everything is "if not exists").
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = neon(url);

const statements = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8")
  .replace(/--.*$/gm, "")
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean);

for (const s of statements) await sql.query(s);
const tables = await sql.query(`select table_name from information_schema.tables where table_schema = 'public' order by 1`);
console.log("tables:", tables.map((t) => t.table_name).join(", "));
