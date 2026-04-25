import {
  initAuthCreds,
  BufferJSON,
  type AuthenticationCreds,
  type AuthenticationState,
  type SignalDataTypeMap,
} from '@whiskeysockets/baileys';
// proto vem de WAProto; importado lazy só se precisar (compatibilidade ESM)
type ProtoLike = {
  Message: {
    AppStateSyncKeyData: { fromObject: (o: Record<string, unknown>) => unknown };
  };
};
let _proto: ProtoLike | null = null;
async function getProto(): Promise<ProtoLike | null> {
  if (_proto) return _proto;
  try {
    const mod = await import('@whiskeysockets/baileys/WAProto/index.js');
    _proto = (mod as { proto?: ProtoLike }).proto ?? (mod as unknown as { default?: { proto?: ProtoLike } }).default?.proto ?? null;
    return _proto;
  } catch {
    return null;
  }
}
import { prisma } from '../../../lib/prisma.js';
import { decryptString, encryptString } from '../../../lib/encryption.js';

type StoredBlob = {
  creds: AuthenticationCreds;
  keys: Record<string, Record<string, unknown>>;
};

// Carrega ou inicializa as credenciais Baileys de uma conexão.
// Persiste tudo (creds + keys) num blob JSON criptografado em
// WhatsAppConnection.sessionData.
export async function useDBAuthState(connectionId: string): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
}> {
  const conn = await prisma.whatsAppConnection.findUnique({
    where: { id: connectionId },
    select: { sessionData: true },
  });

  let blob: StoredBlob;
  if (conn?.sessionData) {
    try {
      const json = decryptString(conn.sessionData);
      blob = JSON.parse(json, BufferJSON.reviver) as StoredBlob;
      if (!blob.creds || !blob.keys) throw new Error('blob invalido');
    } catch {
      blob = { creds: initAuthCreds(), keys: {} };
    }
  } else {
    blob = { creds: initAuthCreds(), keys: {} };
  }

  let writeQueued = false;
  const persist = async () => {
    if (writeQueued) return;
    writeQueued = true;
    setImmediate(async () => {
      writeQueued = false;
      try {
        const json = JSON.stringify(blob, BufferJSON.replacer);
        await prisma.whatsAppConnection.update({
          where: { id: connectionId },
          data: { sessionData: encryptString(json) },
        });
      } catch (e) {
        // melhor falhar silenciosamente: nao queremos derrubar a conexao
        // por causa de um write transient
        console.error('[whatsapp/auth-state] persist failed', e);
      }
    });
  };

  const state: AuthenticationState = {
    creds: blob.creds,
    keys: {
      get: async <T extends keyof SignalDataTypeMap>(
        type: T,
        ids: string[],
      ) => {
        const out: { [id: string]: SignalDataTypeMap[T] } = {};
        const bucket = blob.keys[type as string] ?? {};
        const proto = type === 'app-state-sync-key' ? await getProto() : null;
        for (const id of ids) {
          const v = bucket[id];
          if (v !== undefined) {
            if (proto && type === 'app-state-sync-key') {
              out[id] = proto.Message.AppStateSyncKeyData.fromObject(
                v as Record<string, unknown>,
              ) as unknown as SignalDataTypeMap[T];
            } else {
              out[id] = v as SignalDataTypeMap[T];
            }
          }
        }
        return out;
      },
      set: async (data) => {
        for (const category in data) {
          const cat = category as keyof SignalDataTypeMap;
          const items = data[cat];
          if (!items) continue;
          if (!blob.keys[cat as string]) blob.keys[cat as string] = {};
          for (const id in items) {
            const value = items[id];
            if (value === null || value === undefined) {
              delete blob.keys[cat as string]![id];
            } else {
              blob.keys[cat as string]![id] = value as unknown as Record<string, unknown>;
            }
          }
        }
        await persist();
      },
    },
  };

  const saveCreds = async () => {
    blob.creds = state.creds;
    await persist();
  };

  return { state, saveCreds };
}
