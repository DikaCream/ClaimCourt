// Public runtime configuration (all values are NEXT_PUBLIC_* and safe to expose).
export const RPC_URL = process.env.NEXT_PUBLIC_GENLAYER_RPC_URL || "https://studio.genlayer.com/api";
export const CHAIN_ID = parseInt(process.env.NEXT_PUBLIC_GENLAYER_CHAIN_ID || "61999", 10);
export const CHAIN_ID_HEX = `0x${CHAIN_ID.toString(16)}`;
export const CHAIN_NAME = process.env.NEXT_PUBLIC_GENLAYER_CHAIN_NAME || "GenLayer Studionet";
export const CURRENCY_SYMBOL = process.env.NEXT_PUBLIC_GENLAYER_SYMBOL || "GEN";
export const EXPLORER_URL = process.env.NEXT_PUBLIC_GENLAYER_EXPLORER_URL || "https://explorer-studio.genlayer.com";
export const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "") as `0x${string}` | "";
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "") ||
  "https://claimcourt.vercel.app";



export const START_POINTS = 1000;
export const APPEAL_BOND = 100;

export const txExplorerUrl = (hash: string) => `${EXPLORER_URL}/transactions/${hash}`;
export const addressExplorerUrl = (address: string) => `${EXPLORER_URL}/address/${address}`;
