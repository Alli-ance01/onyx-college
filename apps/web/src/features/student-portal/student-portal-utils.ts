import type { NotificationDto } from '@onyx/contracts';

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('en-NG', {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

export function notificationResourceHref(
  notification: Pick<NotificationDto, 'resourceId' | 'resourceType'>,
): string | undefined {
  if (notification.resourceType === 'Assignment') return '/student/assignments';
  if (notification.resourceType === 'Announcement') return '/student/announcements';
  if (notification.resourceType === 'TermReport' && notification.resourceId !== undefined) {
    return `/student/results/${notification.resourceId}`;
  }
  if (
    notification.resourceType === 'ProfileCorrectionRequest' ||
    notification.resourceType === 'StudentRegistration'
  ) {
    return '/student/profile';
  }
  return undefined;
}

export function sentenceCase(value: string): string {
  return value
    .toLocaleLowerCase()
    .replaceAll('_', ' ')
    .replace(/^./u, (character) => character.toLocaleUpperCase());
}
