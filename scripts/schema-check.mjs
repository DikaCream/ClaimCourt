// Asks Studionet to parse the contract and return its schema (read-only, no transaction).
import { readFileSync } from "node:fs";
import { getClient } from "./lib.mjs";

const client = getClient({ withAccount: false });
const code = readFileSync(new URL("../contracts/claimcourt.py", import.meta.url), "utf8");
const schema = await client.getContractSchemaForCode(code);
console.log(JSON.stringify(schema, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2));
