import { useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSocketEvent, useSocketIO } from '../hooks/useSocketIO';
import { useAuthStore } from '../stores/useAuthStore';
import { toast } from './ui/Toast';

type ReminderDuePayload = { id: string; title: string; opportunityId: string };

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
