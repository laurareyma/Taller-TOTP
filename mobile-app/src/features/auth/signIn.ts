/**
 * Flujo OAuth 2.0 Authorization Code + PKCE con el navegador del sistema.
 *
 * 1. Genera code_verifier, code_challenge y state (solo en memoria, dentro de esta función).
 * 2. Abre el navegador seguro (Chrome Custom Tabs / ASWebAuthenticationSession). Nunca un WebView.
 * 3. Recibe el deep link unisabana-auth://oauth/callback y valida el state.
 * 4. Canjea code + code_verifier por los tokens.
 */

import * as WebBrowser from 'expo-web-browser';

import { exchangeCode, type TokenSet } from './authApi';
import { API_URL, CLIENT_ID, REDIRECT_URI } from './config';
import { randomBytesExpo, sha256Expo } from './cryptoExpo';
import { AuthError } from './errors';
import { buildAuthorizeUrl, parseCallbackUrl } from './oauthUrls';
import { createCodeChallenge, createCodeVerifier, createState } from './pkce';

export async function signInWithBrowser(): Promise<TokenSet> {
  const codeVerifier = await createCodeVerifier(randomBytesExpo);
  const codeChallenge = await createCodeChallenge(codeVerifier, sha256Expo);
  const state = await createState(randomBytesExpo);

  const authorizeUrl = buildAuthorizeUrl({ apiUrl: API_URL, clientId: CLIENT_ID, redirectUri: REDIRECT_URI, codeChallenge, state });

  const result = await WebBrowser.openAuthSessionAsync(authorizeUrl, REDIRECT_URI, {
    preferEphemeralSession: true, // iOS: no comparte cookies con Safari
  });
  if (result.type !== 'success') throw new AuthError('cancelled');

  const code = parseCallbackUrl(result.url, REDIRECT_URI, state);
  return exchangeCode(code, codeVerifier);
}
