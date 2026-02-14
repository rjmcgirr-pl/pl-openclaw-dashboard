/**
 * SSEConnectionStatus Component
 * 
 * Visual indicator showing the SSE connection state with:
 * - Real-time status indicator (connected/disconnected/reconnecting)
 * - Connection pulse animation
 * - Reconnect attempt counter
 * - Error state display
 * - Manual reconnect button
 */

import React, { useMemo } from 'react';
import { SSEConnectionStatus } from '../types/sse';

export interface SSEConnectionStatusProps {
  /** Current connection status */
  status: SSEConnectionStatus;
  /** Current reconnect attempt number (for reconnecting state) */
  reconnectAttempt?: number;
  /** Last error message */
  lastError?: Error;
  /** Time since last event */
  lastEventTime?: Date;
  /** Callback to manually trigger reconnect */
  onReconnect?: () => void;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Show detailed status text */
  showDetails?: boolean;
  /** Custom className */
  className?: string;
  /** Position fixed in corner */
  fixed?: boolean;
  /** Position when fixed */
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}

interface StatusConfig {
  color: string;
  bgColor: string;
  borderColor: string;
  icon: React.ReactNode;
  label: string;
  description: string;
  animate: boolean;
}

/**
 * SSE Connection Status Indicator Component
 */
export const SSEConnectionStatus: React.FC<SSEConnectionStatusProps> = ({
  status,
  reconnectAttempt = 0,
  lastError,
  lastEventTime,
  onReconnect,
  size = 'md',
  showDetails = true,
  className = '',
  fixed = false,
  position = 'bottom-right',
}) => {
  // Size configurations
  const sizes = {
    sm: {
      container: 'px-2 py-1 gap-1.5',
      dot: 'w-2 h-2',
      icon: 'w-3 h-3',
      text: 'text-xs',
    },
    md: {
      container: 'px-3 py-1.5 gap-2',
      dot: 'w-2.5 h-2.5',
      icon: 'w-4 h-4',
      text: 'text-sm',
    },
    lg: {
      container: 'px-4 py-2 gap-2.5',
      dot: 'w-3 h-3',
      icon: 'w-5 h-5',
      text: 'text-base',
    },
  };

  // Status configurations
  const statusConfig: Record<SSEConnectionStatus, StatusConfig> = useMemo(
    () => ({
      connected: {
        color: 'text-green-700',
        bgColor: 'bg-green-50',
        borderColor: 'border-green-200',
        icon: (
          <svg className={sizes[size].icon} fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
        ),
        label: 'Live',
        description: 'Real-time updates active',
        animate: false,
      },
      connecting: {
        color: 'text-yellow-700',
        bgColor: 'bg-yellow-50',
        borderColor: 'border-yellow-200',
        icon: (
          <svg className={`${sizes[size].icon} animate-spin`} fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ),
        label: 'Connecting...',
        description: 'Establishing connection',
        animate: true,
      },
      disconnected: {
        color: 'text-gray-600',
        bgColor: 'bg-gray-50',
        borderColor: 'border-gray-200',
        icon: (
          <svg className={sizes[size].icon} fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z"
              clipRule="evenodd"
            />
            <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
          </svg>
        ),
        label: 'Offline',
        description: 'Real-time updates disabled',
        animate: false,
      },
      error: {
        color: 'text-red-700',
        bgColor: 'bg-red-50',
        borderColor: 'border-red-200',
        icon: (
          <svg className={sizes[size].icon} fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
        ),
        label: 'Error',
        description: lastError?.message || 'Connection failed',
        animate: false,
      },
      reconnecting: {
        color: 'text-orange-700',
        bgColor: 'bg-orange-50',
        borderColor: 'border-orange-200',
        icon: (
          <svg className={`${sizes[size].icon} animate-spin`} fill="none" viewBox="0 0 24 24">
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        ),
        label: `Reconnecting${reconnectAttempt > 0 ? ` (${reconnectAttempt})` : ''}...`,
        description: `Attempt ${reconnectAttempt} to restore connection`,
        animate: true,
      },
    }),
    [size, lastError, reconnectAttempt]
  );

  const currentStatus = statusConfig[status];

  // Calculate time since last event
  const timeSinceLastEvent = useMemo(() => {
    if (!lastEventTime) return null;
    const diff = Date.now() - lastEventTime.getTime();
    if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    return `${Math.floor(diff / 3600000)}h ago`;
  }, [lastEventTime]);

  // Position classes for fixed mode
  const positionClasses = {
    'top-left': 'top-4 left-4',
    'top-right': 'top-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'bottom-right': 'bottom-4 right-4',
  };

  const containerClasses = `
    inline-flex items-center rounded-full border shadow-sm
    transition-all duration-200 ease-in-out
    ${currentStatus.bgColor}
    ${currentStatus.borderColor}
    ${sizes[size].container}
    ${fixed ? `fixed ${positionClasses[position]} z-50` : ''}
    ${className}
  `.trim();

  return (
    <div className={containerClasses} role="status" aria-live="polite">
      {/* Status Dot/Pulse */}
      <span className="relative flex h-2.5 w-2.5">
        {status === 'connected' && (
          <>
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${currentStatus.color.replace(
                'text-',
                'bg-'
              )}`}
            />
            <span
              className={`relative inline-flex rounded-full ${sizes[size].dot} ${currentStatus.color.replace(
                'text-',
                'bg-'
              )}`}
            />
          </>
        )}
        {status !== 'connected' && (
          <span className={`inline-flex items-center justify-center ${currentStatus.color}`}>
            {currentStatus.icon}
          </span>
        )}
      </span>

      {/* Status Text */}
      {showDetails && (
        <div className="flex flex-col">
          <span className={`font-medium ${currentStatus.color} ${sizes[size].text}`}>
            {currentStatus.label}
          </span>
          {size !== 'sm' && (
            <span className={`text-xs ${currentStatus.color} opacity-80`}>
              {currentStatus.description}
            </span>
          )}
        </div>
      )}

      {/* Time since last event (only for connected state) */}
      {status === 'connected' && timeSinceLastEvent && size === 'lg' && (
        <span className={`ml-2 text-xs ${currentStatus.color} opacity-60 border-l pl-2 ${currentStatus.borderColor}`}>
          Last update: {timeSinceLastEvent}
        </span>
      )}

      {/* Reconnect button (only for disconnected/error states) */}
      {(status === 'disconnected' || status === 'error') && onReconnect && (
        <button
          onClick={onReconnect}
          className={`
            ml-2 px-2 py-0.5 rounded text-xs font-medium
            bg-white border hover:bg-gray-50
            transition-colors duration-150
            ${currentStatus.color} ${currentStatus.borderColor}
          `}
          type="button"
        >
          Retry
        </button>
      )}
    </div>
  );
};

/**
 * Compact version - just the dot with tooltip
 */
export const SSEConnectionDot: React.FC<
  Omit<SSEConnectionStatusProps, 'showDetails' | 'size'>
> = ({ status, className = '', fixed = false, position = 'bottom-right' }) => {
  const colors = {
    connected: 'bg-green-500',
    connecting: 'bg-yellow-500',
    disconnected: 'bg-gray-400',
    error: 'bg-red-500',
    reconnecting: 'bg-orange-500',
  };

  const positionClasses = {
    'top-left': 'top-4 left-4',
    'top-right': 'top-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'bottom-right': 'bottom-4 right-4',
  };

  return (
    <div
      className={`
        relative flex h-3 w-3
        ${fixed ? `fixed ${positionClasses[position]} z-50` : ''}
        ${className}
      `}
      title={`SSE: ${status}`}
    >
      {status === 'connected' && (
        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${colors[status]}`} />
      )}
      {(status === 'connecting' || status === 'reconnecting') && (
        <span className={`animate-pulse absolute inline-flex h-full w-full rounded-full opacity-75 ${colors[status]}`} />
      )}
      <span
        className={`relative inline-flex rounded-full h-3 w-3 ${colors[status]} ${
          status === 'disconnected' ? 'opacity-50' : ''
        }`}
      />
    </div>
  );
};

export default SSEConnectionStatus;
