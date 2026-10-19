// Proves which source is deployed. Fetches the contract code stored on-chain (genlayer-js getContractCode, i.e.
// the gen_getContractCode RPC) and compares its sha256 with
//   (1) contracts/claimcourt.py in this checkout, and
//   (2) the same file fetched from GitHub at a given commit (--commit <sha>), so the hash is tied to the reviewed commit.
// Usage: node scripts/verify-deployment.mjs [--address 0x..] [--commit <git sha>] [--write]
// With --write the result is saved to deployments/verification.json. Exit code 1 on any mismatch.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";

const arg = (n) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : undefined; };
const rec = JSON.parse(readFileSync(new URL("../deployments/studionet.json", import.meta.url)));
const address = arg("--address") || rec.contractAddress;
const commit = arg("--commit");
const sha = (t) => createHash("sha256").update(t, "utf8").digest("hex");

const client = createClient({ chain: studionet, endpoint: process.env.GENLAYER_RPC_URL || "https://studio.genlayer.com/api" });
const deployed = await client.getContractCode(address);
const local = readFileSync(new URL("../contracts/claimcourt.py", import.meta.url), "utf8");
const out = {
  address, rpc: "https://studio.genlayer.com/api", method: "genlayer-js getContractCode (gen_getContractCode)",
  deployed_sha256: sha(deployed), deployed_bytes: Buffer.byteLength(deployed),
  local_sha256: sha(local), local_matches_deployed: sha(local) === sha(deployed),
  header_ok: deployed.split("\n")[0] === '# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }',
  deploy_tx: rec.deployTxHash, verified_at: new Date().toISOString(),
};
if (commit) {
  const url = `https://raw.githubusercontent.com/DikaCream/ClaimCourt/${commit}/contracts/claimcourt.py`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`cannot fetch ${url}: ${r.status}`);
  const remote = await r.text();
  out.commit = commit; out.commit_source_url = url;
  out.commit_sha256 = sha(remote); out.commit_matches_deployed = sha(remote) === sha(deployed);
}
console.log(JSON.stringify(out, null, 2));
if (process.argv.includes("--write")) {
  writeFileSync(new URL("../deployments/verification.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");
  console.log("Saved deployments/verification.json");
}
process.exit(out.local_matches_deployed && out.header_ok && (out.commit === undefined || out.commit_matches_deployed) ? 0 : 1);
