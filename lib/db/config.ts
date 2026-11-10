import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";
import * as schema from "./schema";

config({ path: ".env.local", quiet: true });

// Fall back to an unroutable placeholder so `next build` can compile without
// secrets. Queries still require a real DATABASE_URL at runtime.
const connectionString =
  process.env.DATABASE_URL ??
  "postgres://placeholder:placeholder@localhost:5432/prfrd";

export const sql = neon(connectionString);
export const db = drizzle(sql, { schema });
