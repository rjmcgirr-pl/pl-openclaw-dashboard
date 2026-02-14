/**
 * SSE Library exports index
 * Central export point for SSE client library
 */

export {
  EventSourceClient,
  createSSEClient,
} from './EventSourceClient';

export {
  createMockTaskCreatedEvent,
  createMockTaskUpdatedEvent,
  createMockTaskDeletedEvent,
  createMockTaskStatusChangedEvent,
  createMockCommentCreatedEvent,
  createMockCronJobEvent,
  MockEventSourceClient,
  createMockSSEClient,
} from './mockEvents';
