import type { AuthSessionSummary, NotificationDto, SuccessEnvelope } from '@onyx/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';

import type { ApiClient } from '../../lib/api/api-client.js';
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

async function data<T>(request: Promise<SuccessEnvelope<T>>): Promise<T> {
  return (await request).data;
}
function notifications(client: ApiClient): Promise<readonly NotificationDto[]> {
  return data(client.request('/notifications'));
}
function sessions(client: ApiClient): Promise<readonly AuthSessionSummary[]> {
  return data(client.request('/auth/sessions'));
}
function format(value: string): string {
  return new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}

export function PortalNotificationsPage() {
  const auth = useAuthSession();
  const cache = useQueryClient();
  const key = ['portal-notifications', auth.principal?.portal] as const;
  const query = useQuery({ queryFn: () => notifications(auth.apiClient), queryKey: key });
  const refresh = async () => cache.invalidateQueries({ queryKey: key });
  const read = useMutation({
    mutationFn: (id: string) =>
      data(
        auth.apiClient.request<SuccessEnvelope<{ updated: boolean }>>(`/notifications/${id}/read`, {
          method: 'POST',
        }),
      ),
    onSuccess: refresh,
  });
  const readAll = useMutation({
    mutationFn: () =>
      data(
        auth.apiClient.request<SuccessEnvelope<{ updated: boolean }>>('/notifications/read-all', {
          method: 'POST',
        }),
      ),
    onSuccess: refresh,
  });
  const unread = query.data?.filter((item) => item.readAt === undefined).length ?? 0;
  return (
    <main className="portal-content product-page">
      <PageHeader
        actions={
          unread === 0 ? null : (
            <Button
              loading={readAll.isPending}
              onClick={() => {
                readAll.mutate();
              }}
              variant="secondary"
            >
              Mark all read
            </Button>
          )
        }
        description="Security, workflow, and school updates addressed to your account."
        eyebrow={String(unread) + ' unread'}
        title="Notifications"
      />
      {query.isPending ? <LoadingState rows={6} /> : null}
      {query.isError ? (
        <ErrorState onRetry={() => void query.refetch()} title="Notifications unavailable" />
      ) : null}
      {query.isSuccess && query.data.length === 0 ? (
        <EmptyState
          description="New account and workflow updates will appear here."
          title="No notifications"
        />
      ) : null}
      <div className="notification-list">
        {query.data?.map((item) => (
          <article
            className={
              item.readAt === undefined
                ? 'notification-item notification-item--unread'
                : 'notification-item'
            }
            key={item.id}
          >
            <div className="notification-item__marker" aria-hidden="true" />
            <div>
              <div className="notification-item__heading">
                <h2>{item.title}</h2>
                <StatusBadge tone={item.readAt === undefined ? 'warning' : 'neutral'}>
                  {item.readAt === undefined ? 'Unread' : 'Read'}
                </StatusBadge>
              </div>
              <p>{item.body}</p>
              <small>{format(item.createdAt)}</small>
              {item.readAt === undefined ? (
                <div className="notification-item__actions">
                  <Button
                    disabled={read.isPending}
                    onClick={() => {
                      read.mutate(item.id);
                    }}
                    variant="ghost"
                  >
                    Mark read
                  </Button>
                </div>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}

export function PortalSettingsPage() {
  const auth = useAuthSession();
  const cache = useQueryClient();
  const key = ['portal-sessions', auth.principal?.portal] as const;
  const query = useQuery({ queryFn: () => sessions(auth.apiClient), queryKey: key });
  const refresh = async () => cache.invalidateQueries({ queryKey: key });
  const revoke = useMutation({
    mutationFn: (id: string) =>
      auth.apiClient.request(`/auth/sessions/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });
  const others = useMutation({
    mutationFn: () =>
      data(
        auth.apiClient.request<SuccessEnvelope<{ revokedCount: number }>>('/auth/logout-others', {
          method: 'POST',
        }),
      ),
    onSuccess: refresh,
  });
  return (
    <main className="portal-content product-page">
      <PageHeader
        description="Manage your password and active authenticated devices."
        eyebrow="Account security"
        title="Settings"
      />
      <div className="settings-grid">
        <Panel title="Password" description="Change your password using your current credentials.">
          <Link className="ui-button ui-button--secondary" to="/auth/change-password">
            Change password
          </Link>
        </Panel>
        <Panel
          title="Other sessions"
          description="Sign out every other browser while keeping this one active."
        >
          <Button
            loading={others.isPending}
            onClick={() => {
              others.mutate();
            }}
            variant="secondary"
          >
            Sign out other sessions
          </Button>
          {others.data === undefined ? null : (
            <p className="success-copy">{others.data.revokedCount} session(s) revoked.</p>
          )}
        </Panel>
      </div>
      <Panel title="Active sessions">
        {query.isPending ? <LoadingState rows={3} /> : null}
        {query.isError ? (
          <ErrorState onRetry={() => void query.refetch()} title="Sessions unavailable" />
        ) : null}
        <div className="session-list">
          {query.data?.map((item) => (
            <div className="session-row" key={item.id}>
              <div>
                <strong>{item.deviceLabel}</strong>
                <p>Last used {format(item.lastUsedAt)}</p>
                <small>Expires {format(item.expiresAt)}</small>
              </div>
              {item.current ? (
                <StatusBadge tone="success">Current</StatusBadge>
              ) : (
                <Button
                  disabled={revoke.isPending}
                  onClick={() => {
                    revoke.mutate(item.id);
                  }}
                  variant="danger"
                >
                  Revoke
                </Button>
              )}
            </div>
          ))}
        </div>
      </Panel>
    </main>
  );
}
