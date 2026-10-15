"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { CHAIN_ID } from "./config";
import { ensureCorrectChain, getAccounts, getChainId, getProvider, requestAccounts } from "./wallet";

interface WalletState {
  address: `0x${string}` | null;
  chainId: number | null;
  isMetaMaskAvailable: boolean;
  isConnecting: boolean;
  isCorrectChain: boolean;
  error: string | null;
  connect: () => Promise<void>;
  switchChain: () => Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletState | null>(null);
const DISCONNECTED_KEY = "claimcourt:disconnected";

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<`0x${string}` | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [isMetaMaskAvailable, setAvailable] = useState(false);
  const [isConnecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Restore an existing connection (without prompting) and subscribe to wallet events.
  useEffect(() => {
    const provider = getProvider();
    setAvailable(!!provider);
    if (!provider) return;

    if (localStorage.getItem(DISCONNECTED_KEY) !== "1") {
      getAccounts().then((accounts) => setAddress((accounts[0] as `0x${string}`) ?? null));
    }
    getChainId().then(setChainId);

    const onAccounts = (accounts: string[]) => setAddress((accounts[0] as `0x${string}`) ?? null);
    const onChain = (hex: string) => setChainId(parseInt(hex, 16));
    provider.on?.("accountsChanged", onAccounts);
    provider.on?.("chainChanged", onChain);
    return () => {
      provider.removeListener?.("accountsChanged", onAccounts);
      provider.removeListener?.("chainChanged", onChain);
    };
  }, []);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const accounts = await requestAccounts();
      await ensureCorrectChain();
      setAddress((accounts[0] as `0x${string}`) ?? null);
      setChainId(await getChainId());
      localStorage.removeItem(DISCONNECTED_KEY);
    } catch (e: any) {
      setError(e?.message || "Failed to connect");
    } finally {
      setConnecting(false);
    }
  }, []);

  const switchChain = useCallback(async () => {
    setError(null);
    try {
      await ensureCorrectChain();
      setChainId(await getChainId());
    } catch (e: any) {
      setError(e?.message || "Failed to switch network");
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    localStorage.setItem(DISCONNECTED_KEY, "1");
  }, []);

  const value = useMemo<WalletState>(
    () => ({
      address,
      chainId,
      isMetaMaskAvailable,
      isConnecting,
      isCorrectChain: chainId === CHAIN_ID,
      error,
      connect,
      switchChain,
      disconnect,
    }),
    [address, chainId, isMetaMaskAvailable, isConnecting, error, connect, switchChain, disconnect],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside <WalletProvider>");
  return ctx;
}
