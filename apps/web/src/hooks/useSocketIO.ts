import { useEffect, useRef } from 'react';
import { useAuthStore } from '../stores/useAuthStore';
import { disconnectSocket, getSocket } from '../lib/socket';
import type { Socket } from 'socket.io-client';

// Mantém uma conexão única por sessão (useToken).
// Componentes consomem via useSocketEvent abaixo.
export function useSocketIO(): Socket | null {
  const token = useAuthStore((s) => s.accessToken);
  const status = useAuthStore((s) => s.status);
  useEffect(() => {
    if (status !== 'authenticated' || !token) return;
    getSocket(token);
    return () => {
      // Não desconecta no unmount — outras partes podem estar usando.
    };
  }, [token, status]);
  useEffect(() => {
    return () => {
      // Desconecta apenas quando a sessão termina (via logout/clear)
      if (status === 'unauthenticated') disconnectSocket();
    };
  }, [status]);
  return token ? getSocket(token) : null;
}

// Subscreve em um evento; remove na desmontagem.
export function useSocketEvent<T>(event: string, handler: (payload: T) => void) {
  const token = useAuthStore((s) => s.accessToken);
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!token) return;
    const socket = getSocket(token);
    if (!socket) return;
    const fn = (payload: T) => handlerRef.current(payload);
    socket.on(event, fn);
    return () => {
      socket.off(event, fn);
    };
  }, [event, token]);
}
