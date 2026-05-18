import React from 'react';
import type { TimelineEvent } from '@evidence-freezer/shared';
import { formatDateTime } from '../lib/case-files';

export function AttackTimeline({ events }: { events: TimelineEvent[] }) {
  const sortedEvents = [...events].sort((left, right) => left.timestamp.localeCompare(right.timestamp));

  if (sortedEvents.length === 0) {
    return (
      <div className="state-block">
        <strong>No timeline events recorded.</strong>
        <span>Open the raw trace link for source telemetry.</span>
      </div>
    );
  }

  return (
    <ol className="timeline-list">
      {sortedEvents.map((event) => (
        <li className="timeline-event" key={`${event.timestamp}-${event.span_id ?? event.event_type}`}>
          <div className="timeline-event__time">
            <time dateTime={event.timestamp}>{formatDateTime(event.timestamp)}</time>
            <span className="span-kind">{event.event_type}</span>
          </div>
          <p>{event.description}</p>
          {event.span_id ? <code>{event.span_id}</code> : null}
        </li>
      ))}
    </ol>
  );
}
