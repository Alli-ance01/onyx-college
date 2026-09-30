import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';

import { useAuthSession } from '../../lib/auth/use-auth-session.js';
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Panel,
  StatusBadge,
} from '../../shared/ui/index.js';
import { studentPortalApi, studentPortalQueryKeys } from './student-portal-api.js';
import { formatDateTime, notificationResourceHref, sentenceCase } from './student-portal-utils.js';

export function StudentNotificationsPage() {
  const auth = useAuthSession();
  const cache = useQueryClient();
  const notifications = useQuery({
    queryKey: studentPortalQueryKeys.notifications,
    queryFn: () => studentPortalApi.notifications(auth.apiClient),
  });
  const refresh = async () =>
    cache.invalidateQueries({ queryKey: studentPortalQueryKeys.notifications });
  const markRead = useMutation({
    mutationFn: (id: string) => studentPortalApi.markNotificationRead(auth.apiClient, id),
    onSuccess: refresh,
  });
  const markAll = useMutation({
    mutationFn: () => studentPortalApi.markAllNotificationsRead(auth.apiClient),
    onSuccess: refresh,
  });
  const unreadCount = notifications.data?.filter((item) => item.readAt === undefined).length ?? 0;

  return (
    <main className="portal-content product-page student-portal-page">
      <PageHeader
        actions={
          unreadCount === 0 ? null : (
            <Button
              loading={markAll.isPending}
              loadingLabel="Marking read"
              onClick={() => {
                markAll.mutate();
              }}
              variant="secondary"
            >
              Mark all as read
            </Button>
          )
        }
        description="Account, registration, academic, and school updates addressed to you."
        eyebrow={String(unreadCount) + ' unread'}
        title="Notifications"
      />
      {notifications.isPending ? <LoadingState label="Loading notifications" rows={6} /> : null}
      {notifications.isError ? (
        <ErrorState
          onRetry={() => void notifications.refetch()}
          title="Notifications unavailable"
        />
      ) : null}
      {notifications.isSuccess && notifications.data.length === 0 ? (
        <EmptyState
          description="Important account and academic updates will appear here."
          title="No notifications"
        />
      ) : null}
      {notifications.data === undefined || notifications.data.length === 0 ? null : (
        <div className="notification-list">
          {notifications.data.map((notification) => {
            const href = notificationResourceHref(notification);
            return (
              <article
                className={
                  notification.readAt === undefined
                    ? 'notification-item notification-item--unread'
                    : 'notification-item'
                }
                key={notification.id}
              >
                <div className="notification-item__marker" aria-hidden="true" />
                <div>
                  <div className="notification-item__heading">
                    <h2>{notification.title}</h2>
                    <StatusBadge tone={notification.readAt === undefined ? 'warning' : 'neutral'}>
                      {notification.readAt === undefined ? 'Unread' : 'Read'}
                    </StatusBadge>
                  </div>
                  <p>{notification.body}</p>
                  <small>
                    {sentenceCase(notification.type)} / {formatDateTime(notification.createdAt)}
                  </small>
                  <div className="notification-item__actions">
                    {href === undefined ? null : <Link to={href}>Open related record</Link>}
                    {notification.readAt === undefined ? (
                      <Button
                        disabled={markRead.isPending}
                        onClick={() => {
                          markRead.mutate(notification.id);
                        }}
                        variant="ghost"
                      >
                        Mark read
                      </Button>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}

export function StudentSettingsPage() {
  const auth = useAuthSession();
  const cache = useQueryClient();
  const sessions = useQuery({
    queryKey: studentPortalQueryKeys.sessions,
    queryFn: () => studentPortalApi.sessions(auth.apiClient),
  });
  const revoke = useMutation({
    mutationFn: (sessionId: string) => studentPortalApi.revokeSession(auth.apiClient, sessionId),
    onSuccess: async () => cache.invalidateQueries({ queryKey: studentPortalQueryKeys.sessions }),
  });
  const revokeOthers = useMutation({
    mutationFn: () => studentPortalApi.logoutOtherSessions(auth.apiClient),
    onSuccess: async () => cache.invalidateQueries({ queryKey: studentPortalQueryKeys.sessions }),
  });

  return (
    <main className="portal-content product-page student-portal-page">
      <PageHeader
        description="Manage password and active browser sessions. Official biodata changes belong in Profile Correction Requests."
        eyebrow="Account security"
        title="Settings"
      />
      <div className="settings-grid">
        <Panel
          description="Use your current password to replace it with a new secure password."
          title="Password"
        >
          <Link className="ui-button ui-button--secondary" to="/auth/change-password">
            Change password
          </Link>
        </Panel>
        <Panel
          description="End every other active login while keeping this browser signed in."
          title="Other sessions"
        >
          <Button
            loading={revokeOthers.isPending}
            loadingLabel="Signing out"
            onClick={() => {
              revokeOthers.mutate();
            }}
            variant="secondary"
          >
            Sign out other sessions
          </Button>
          {revokeOthers.data === undefined ? null : (
            <p className="success-copy">{revokeOthers.data.revokedCount} session(s) revoked.</p>
          )}
        </Panel>
      </div>
      <Panel
        description="Devices and browsers currently associated with your account."
        title="Active sessions"
      >
        {sessions.isPending ? <LoadingState label="Loading sessions" rows={3} /> : null}
        {sessions.isError ? (
          <ErrorState onRetry={() => void sessions.refetch()} title="Sessions unavailable" />
        ) : null}
        {sessions.data === undefined ? null : (
          <div className="session-list">
            {sessions.data.map((session) => (
              <div className="session-row" key={session.id}>
                <div>
                  <strong>{session.deviceLabel}</strong>
                  <p>Last used {formatDateTime(session.lastUsedAt)}</p>
                  <small>Expires {formatDateTime(session.expiresAt)}</small>
                </div>
                {session.current ? (
                  <StatusBadge tone="success">Current</StatusBadge>
                ) : (
                  <Button
                    disabled={revoke.isPending}
                    onClick={() => {
                      revoke.mutate(session.id);
                    }}
                    variant="danger"
                  >
                    Revoke
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>
    </main>
  );
}
