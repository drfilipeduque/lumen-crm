import { useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSocketEvent, useSocketIO } from '../hooks/useSocketIO';
import { useAuthStore } from '../stores/useAuthStore';
import { toast } from './ui/Toast';

type ReminderDuePayload = { id: string; title: string; opportunityId: string };
type WAConnectionUpdate = { connectionId: string; status: string; qr?: string; phone?: string | null };
type MessageNew = { conversationId: string; messageId: string; contactId: string; fromMe?: boolean };
type MessageStatus = {
  conversationId: string;
  messageId: string;
  status: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
};
type ConversationUpdate = { conversationId: string };

let beepCtx: AudioContext | null = null;
function playBeep() {
  try {
    if (!beepCtx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      beepCtx = new Ctx();
    }
    const ctx = beepCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.value = 0.0001;
    osc.connect(gain).connect(ctx.destination);
    const now = ctx.currentTime;
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    osc.start(now);
    osc.stop(now + 0.4);
  } catch {
    /* ignore */
  }
}

function showDesktopNotification(title: string, body: string) {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, icon: '/favicon.ico' });
  } catch {
    /* ignore */
  }
}

export function RealtimeListener() {
  // Garante que o socket está conectado conforme a sessão.
  useSocketIO();

  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const lastShownRef = useRef<Set<string>>(new Set());

  useSocketEvent<WAConnectionUpdate>('whatsapp:connection-update', (payload) => {
    qc.invalidateQueries({ queryKey: ['whatsapp-connections'] });
    qc.invalidateQueries({ queryKey: ['whatsapp-qr', payload.connectionId] });
    qc.invalidateQueries({ queryKey: ['whatsapp-entry-rules'] });
    if (payload.status === 'CONNECTED') {
      toast(`📱 WhatsApp conectado${payload.phone ? ` (${payload.phone})` : ''}`, 'success');
    }
  });

  useSocketEvent<MessageNew>('message:new', (payload) => {
    qc.invalidateQueries({ queryKey: ['conversations-list'] });
    qc.invalidateQueries({ queryKey: ['conversations-unread-total'] });
    qc.invalidateQueries({ queryKey: ['conversation-detail', payload.conversationId] });
    qc.invalidateQueries({ queryKey: ['conversation-messages', payload.conversationId] });
    qc.invalidateQueries({ queryKey: ['board'] });

    // Som apenas para mensagens RECEBIDAS (nunca para enviadas pelo próprio usuário)
    // e quando a tab não está focada na conversa em questão.
    if (payload.fromMe) return;
    const onConversationsPage = window.location.pathname === '/conversations';
    const params = new URLSearchParams(window.location.search);
    const focusedId = params.get('id');
    const isFocused = onConversationsPage && focusedId === payload.conversationId;
    if (!isFocused) {
      const prefs = (user?.preferences ?? {}) as { notifications?: { sound?: boolean } };
      if (prefs.notifications?.sound !== false) playBeep();
    }
  });

  useSocketEvent<MessageStatus>('message:status', (payload) => {
    qc.invalidateQueries({ queryKey: ['conversation-messages', payload.conversationId] });
  });

  useSocketEvent<ConversationUpdate>('conversation:update', (payload) => {
    qc.invalidateQueries({ queryKey: ['conversations-list'] });
    qc.invalidateQueries({ queryKey: ['conversations-unread-total'] });
    qc.invalidateQueries({ queryKey: ['conversation-detail', payload.conversationId] });
  });

  useSocketEvent<ReminderDuePayload>('reminder:due', (payload) => {
    if (lastShownRef.current.has(payload.id)) return;
    lastShownRef.current.add(payload.id);

    qc.invalidateQueries({ queryKey: ['reminders-pending-count'] });
    qc.invalidateQueries({ queryKey: ['reminders-notifications'] });
    qc.invalidateQueries({ queryKey: ['reminders-global'] });
    qc.invalidateQueries({ queryKey: ['opportunity-reminders', payload.opportunityId] });

    toast(`🔔 Lembrete: ${payload.title}`, 'info');

    const prefs = (user?.preferences ?? {}) as { notifications?: { sound?: boolean; desktop?: boolean } };
    const notif = prefs.notifications ?? {};
    if (notif.sound !== false) playBeep();
    if (notif.desktop !== false) showDesktopNotification('Lembrete Lumen', payload.title);
  });

  return null;
}
