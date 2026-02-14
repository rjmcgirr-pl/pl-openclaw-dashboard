/**
 * SSEProvider - Global SSE Connection Context
 * 
 * Provides application-wide SSE connection with:
 * - Single shared connection instance
 * - Automatic token management
 * - Notification system integration
 * - Connection status tracking
 */

import React, { createContext, useContext, useCallback, useEffect, useState, ReactNode } from 'react';
import { EventSourceClient, createSSEClient } from '../lib/sse/EventSourceClient';
import {
  SSEConnectionState,
  SSEEventType,
  SSEEventData,
  SSEEventHandler,
  TaskCreatedEvent,
  TaskUpdatedEvent,
  TaskDeletedEvent,
  TaskStatusChangedEvent,
  CommentCreatedEvent,
} from '../types/sse';

// Context state interface
interface SSEContextState {
  client: EventSourceClient | null;
  state: SSEConnectionState;
  isConnected: boolean;
  isReconnecting: boolean;
  connect: () => void;
  disconnect: () => void;
  subscribe: <T extends SSEEventData>(
    eventType: SSEEventType | '*',
    handler: SSEEventHandler<T>
  ) => () => void;
  subscribeToMany: <T extends SSEEventData>(
    eventTypes: SSEEventType[],
    handler: SSEEventHandler<T>
  ) => () => void;
}

// Context with default values
const SSEContext = createContext<SSEContextState>({
  client: null,
  state: { status: 'disconnected', reconnectAttempt: 0 },
  isConnected: false,
  isReconnecting: false,
  connect: () => {},
  disconnect: () => {},
  subscribe: () => () => {},
  subscribeToMany: () => () => {},
});

// Hook to use SSE context
export const useSSEContext = () => useContext(SSEContext);

interface SSEProviderProps {
  children: ReactNode;
  url: string;
  token: string;
  autoConnect?: boolean;
  reconnect?: boolean;
  maxReconnectAttempts?: number;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
}

/**
 * SSE Provider Component
 * Wraps the application to provide global SSE connection
 * 
 * @example
 * ```tsx
 * <SSEProvider 
 *   url="/api/events"
 *   token={jwtToken}
 *   autoConnect={true}
 * >
 *   <App />
 * </SSEProvider>
 * ```
 */
export const SSEProvider: React.FC<SSEProviderProps> = ({
  children,
  url,
  token,
  autoConnect = true,
  reconnect = true,
  maxReconnectAttempts = 10,
  onConnect,
  onDisconnect,
  onError,
}) => {
  const [client, setClient] = useState<EventSourceClient | null>(null);
  const [state, setState] = useState<SSEConnectionState>({
    status: 'disconnected',
    reconnectAttempt: 0,
  });

  // Initialize client
  useEffect(() => {
    if (!token) return;

    const sseClient = createSSEClient({
      url,
      token,
      reconnect,
      maxReconnectAttempts,
      onConnect: () => {
        setState((prev) => ({ ...prev, status: 'connected', reconnectAttempt: 0 }));
        onConnect?.();
      },
      onDisconnect: () => {
        setState((prev) => ({ ...prev, status: 'disconnected' }));
        onDisconnect?.();
      },
      onError: (error) => {
        setState((prev) => ({ ...prev, status: 'error', lastError: error }));
        onError?.(error);
      },
      onReconnect: (attempt) => {
        setState((prev) => ({ ...prev, status: 'reconnecting', reconnectAttempt: attempt }));
      },
    });

    setClient(sseClient);

    return () => {
      sseClient.close();
    };
  }, [url, token, reconnect, maxReconnectAttempts, onConnect, onDisconnect, onError]);

  // Connect function
  const connect = useCallback(() => {
    client?.connect();
  }, [client]);

  // Disconnect function
  const disconnect = useCallback(() => {
    client?.close();
  }, [client]);

  // Subscribe function
  const subscribe = useCallback(
    <T extends SSEEventData>(eventType: SSEEventType | '*', handler: SSEEventHandler<T>): (() => void) => {
      if (!client) return () => {};
      return client.subscribe(eventType, handler as SSEEventHandler);
    },
    [client]
  );

  // Subscribe to many function
  const subscribeToMany = useCallback(
    <T extends SSEEventData>(eventTypes: SSEEventType[], handler: SSEEventHandler<T>): (() => void) => {
      if (!client) return () => {};
      return client.subscribeToMany(eventTypes, handler as SSEEventHandler);
    },
    [client]
  );

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect && client && token) {
      client.connect();
    }
  }, [autoConnect, client, token]);

  const value: SSEContextState = {
    client,
    state,
    isConnected: state.status === 'connected',
    isReconnecting: state.status === 'reconnecting',
    connect,
    disconnect,
    subscribe,
    subscribeToMany,
  };

  return <SSEContext.Provider value={value}>{children}</SSEContext.Provider>;
};

export default SSEProvider;
