import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { TotpAccount } from './accountSchema';
import { deleteAccount, loadAccount, storeAccount } from './accountStorage';

interface TotpAccountValue {
  /** true mientras se lee la cuenta desde el almacenamiento seguro. */
  loading: boolean;
  account: TotpAccount | null;
  saveAccount: (account: TotpAccount) => Promise<void>;
  removeAccount: () => Promise<void>;
}

const TotpAccountContext = createContext<TotpAccountValue | null>(null);

export function TotpAccountProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState<TotpAccount | null>(null);

  useEffect(() => {
    let active = true;
    loadAccount()
      .catch(() => null)
      .then((stored) => {
        if (!active) return;
        setAccount(stored);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const saveAccount = useCallback(async (next: TotpAccount) => {
    await storeAccount(next);
    setAccount(next);
  }, []);

  const removeAccount = useCallback(async () => {
    await deleteAccount();
    setAccount(null);
  }, []);

  const value = useMemo(
    () => ({ loading, account, saveAccount, removeAccount }),
    [loading, account, saveAccount, removeAccount],
  );

  return <TotpAccountContext.Provider value={value}>{children}</TotpAccountContext.Provider>;
}

export function useTotpAccount(): TotpAccountValue {
  const value = useContext(TotpAccountContext);
  if (!value) throw new Error('useTotpAccount debe usarse dentro de <TotpAccountProvider>.');
  return value;
}
