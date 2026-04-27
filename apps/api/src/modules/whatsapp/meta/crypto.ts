// Re-exporta os helpers de cripto da lib genérica. O access token da
// Meta é guardado igual aos creds do Baileys: AES-256-GCM com IV aleatório.
export { encryptString as encryptAccessToken, decryptString as decryptAccessToken } from '../../../lib/encryption.js';
