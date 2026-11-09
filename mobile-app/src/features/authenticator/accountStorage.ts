/**
 * La semilla TOTP se guarda en el almacenamiento seguro del sistema:
 * iOS Keychain / Android Keystore (vía expo-secure-store). Nunca en AsyncStorage.
 */

import * as SecureStore from 'expo-secure-store';

import { parseStoredAccount, type TotpAccount } from './accountSchema';

const STORAGE_KEY = 'totp_account';

const OPTIONS: SecureStore.SecureStoreOptions = {
  // Solo legible con el teléfono desbloqueado y nunca se copia a otro dispositivo en un respaldo.
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export async function loadAccount(): Promise<TotpAccount | null> {
  const raw = await SecureStore.getItemAsync(STORAGE_KEY, OPTIONS);
  const account = parseStoredAccount(raw);
  if (raw && !account) await SecureStore.deleteItemAsync(STORAGE_KEY, OPTIONS); // dato corrupto
  return account;
}

export async function storeAccount(account: TotpAccount): Promise<void> {
  await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(account), OPTIONS);
}

export async function deleteAccount(): Promise<void> {
  await SecureStore.deleteItemAsync(STORAGE_KEY, OPTIONS);
}
