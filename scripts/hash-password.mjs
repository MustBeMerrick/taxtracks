#!/usr/bin/env node
// Prints an AUTH_PASSWORD_HASH value for deploy/env. Usage:
//   node scripts/hash-password.mjs '<password>'
import { randomBytes, scryptSync } from "node:crypto";

const password = process.argv[2];
if (!password) {
  console.error("Usage: node scripts/hash-password.mjs '<password>'");
  process.exit(1);
}

const salt = randomBytes(16);
const hash = scryptSync(password, salt, 64);
console.log(`${salt.toString("hex")}:${hash.toString("hex")}`);
