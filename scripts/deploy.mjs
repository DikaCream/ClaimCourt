// Deploys contracts/claimcourt.py to GenLayer Studionet using the wallet in .env.
// Usage:
//   node scripts/deploy.mjs              # submit a new deployment
//   node scripts/deploy.mjs --tx 0x...   # resume tracking an already-submitted deployment
// Writes deployments/studionet.json and frontend/.env.local (public values only).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { getClient, waitAndInspect, EXPLORER_URL } from "./lib.mjs";

const client = getClient();
const deployer = client.account.address;
const txFlag = process.argv.indexOf("--tx");
let txHash = txFlag > -1 ? process.argv[txFlag + 1] : undefined;

console.log(`Deployer: ${deployer}`);
if (!txHash) {
  const code = readFileSync(new URL("../contracts/claimcourt.py", import.meta.url), "utf8");
  console.log("Submitting deploy transaction to Studionet...");
  txHash = await client.deployContract({ code, args: [] });
}
console.log(`Deploy tx hash: ${txHash}`);

const outcome = await waitAndInspect(client, txHash);
console.log(`Status: ${outcome.statusName} | Consensus: ${outcome.consensusResult} | Execution: ${outcome.executionResult}`);
if (!outcome.success) {
  console.error("Deployment did not finish successfully.", outcome.stderr || "");
  process.exit(1);
}
const contractAddress = outcome.contractAddress;
console.log(`Contract address: ${contractAddress}`);
console.log(`Explorer (tx): ${EXPLORER_URL}/transactions/${txHash}`);

mkdirSync(new URL("../deployments/", import.meta.url), { recursive: true });
const record = {
  network: "studionet",
  chainId: 61999,
  rpc: "https://studio.genlayer.com/api",
  explorer: EXPLORER_URL,
  contractAddress,
  deployTxHash: txHash,
  deployer,
  status: outcome.statusName,
  consensusResult: outcome.consensusResult,
  executionResult: outcome.executionResult,
  createdAt: outcome.tx.created_at,
};
writeFileSync(new URL("../deployments/studionet.json", import.meta.url), JSON.stringify(record, null, 2) + "\n");
console.log("Saved deployments/studionet.json");

const exampleUrl = new URL("../frontend/.env.example", import.meta.url);
if (existsSync(exampleUrl)) {
  const base = readFileSync(exampleUrl, "utf8");
  const updated = /^NEXT_PUBLIC_CONTRACT_ADDRESS=.*$/m.test(base)
    ? base.replace(/^NEXT_PUBLIC_CONTRACT_ADDRESS=.*$/m, `NEXT_PUBLIC_CONTRACT_ADDRESS=${contractAddress}`)
    : `${base}\nNEXT_PUBLIC_CONTRACT_ADDRESS=${contractAddress}\n`;
  writeFileSync(new URL("../frontend/.env.local", import.meta.url), updated);
  console.log("Updated frontend/.env.local");
}
