// Janela de 24h da Meta Cloud API: a cada msg recebida do contato,
// renova `windowExpiresAt = now + 24h`. Fora dela, só templates podem
// ser enviados. Pra conexões UNOFFICIAL (Baileys) não tem janela.

import { prisma } from '../../../lib/prisma.js';

const WINDOW_MS = 24 * 60 * 60 * 1000;

export type WindowStatus = {
  open: boolean;
  expiresAt: Date | null;
  hoursRemaining: number;
};

export function calculateStatus(expiresAt: Date | null): WindowStatus {
  if (!expiresAt) return { open: false, expiresAt: null, hoursRemaining: 0 };
  const ms = expiresAt.getTime() - Date.now();
  if (ms <= 0) return { open: false, expiresAt, hoursRemaining: 0 };
  return { open: true, expiresAt, hoursRemaining: ms / 3_600_000 };
}

export async function getWindowStatus(conversationId: string): Promise<WindowStatus> {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { windowExpiresAt: true },
  });
  return calculateStatus(conv?.windowExpiresAt ?? null);
}

// Chama a cada msg recebida do contato (não fromMe). Templates também
// renovam a janela após o cliente responder; aqui só nos importa a
// renovação direta — quem chama decide se aplica.
export async function refreshWindow(conversationId: string): Promise<Date> {
  const expiresAt = new Date(Date.now() + WINDOW_MS);
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { windowExpiresAt: expiresAt },
  });
  return expiresAt;
}
