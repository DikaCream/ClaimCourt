// Minimal MetaMask (EIP-1193) helpers. We switch/add the chain ourselves instead of
// genlayer-js `client.connect()`, which would also prompt for a MetaMask Snap install.
import { CHAIN_ID, CHAIN_ID_HEX, CHAIN_NAME, CURRENCY_SYMBOL, EXPLORER_URL, RPC_URL } from "./config";

export interface EthereumProvider {
  isMetaMask?: boolean;
  request: (args: { method: string; params?: unknown[] | object }) => Promise<any>;
  on?: (event: string, handler: (...args: any[]) => void) => void;
  removeListener?: (event: string, handler: (...args: any[]) => void) => void;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

export function getProvider(): EthereumProvider | null {
  if (typeof window === "undefined") return null;
  return window.ethereum ?? null;
}

export async function requestAccounts(): Promise<string[]> {
  const provider = getProvider();
  if (!provider) throw new Error("MetaMask is not installed");
  try {
    return await provider.request({ method: "eth_requestAccounts" });
  } catch (error: any) {
    if (error?.code === 4001) throw new Error("Connection request was rejected");
    throw new Error(error?.message || "Failed to connect wallet");
  }
}

export async function getAccounts(): Promise<string[]> {
  const provider = getProvider();
  if (!provider) return [];
  try {
    return await provider.request({ method: "eth_accounts" });
  } catch {
    return [];
  }
}

export async function getChainId(): Promise<number | null> {
  const provider = getProvider();
  if (!provider) return null;
  try {
    const hex: string = await provider.request({ method: "eth_chainId" });
    return parseInt(hex, 16);
  } catch {
    return null;
  }
}

export async function ensureCorrectChain(): Promise<void> {
  const provider = getProvider();
  if (!provider) throw new Error("MetaMask is not installed");
  if ((await getChainId()) === CHAIN_ID) return;
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_ID_HEX }] });
  } catch (error: any) {
    // 4902 = chain not added to the wallet yet
    if (error?.code === 4902 || /Unrecognized chain/i.test(error?.message ?? "")) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: CHAIN_ID_HEX,
            chainName: CHAIN_NAME,
            rpcUrls: [RPC_URL],
            nativeCurrency: { name: CURRENCY_SYMBOL, symbol: CURRENCY_SYMBOL, decimals: 18 },
            blockExplorerUrls: [EXPLORER_URL],
          },
        ],
      });
    } else if (error?.code === 4001) {
      throw new Error("Network switch was rejected");
    } else {
      throw new Error(error?.message || "Failed to switch network");
    }
  }
}
