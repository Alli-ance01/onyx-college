import type { ReactNode } from 'react';

import { EmptyState, ErrorState, LoadingState } from './async-state.js';

export interface DataTableColumn<Row> {
  align?: 'center' | 'end' | 'start';
  header: string;
  id: string;
  render: (row: Row) => ReactNode;
  width?: string;
}

interface DataTableProps<Row> {
  caption: string;
  columns: readonly DataTableColumn<Row>[];
  emptyDescription?: string;
  emptyTitle?: string;
  getRowKey: (row: Row) => string;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  rows: readonly Row[];
}

export function DataTable<Row>({
  caption,
  columns,
  emptyDescription = 'Records will appear here when they become available.',
  emptyTitle = 'No records found',
  getRowKey,
  loading = false,
  error = false,
  onRetry,
  rows,
}: DataTableProps<Row>) {
  if (error) {
    return (
      <ErrorState
        title={`${caption} unavailable`}
        {...(onRetry === undefined ? {} : { onRetry })}
      />
    );
  }
  if (loading) {
    return <LoadingState label={`Loading ${caption}`} rows={5} variant="table" />;
  }

  if (rows.length === 0) {
    return <EmptyState description={emptyDescription} title={emptyTitle} />;
  }

  return (
    <div className="ui-table-wrap">
      <table className="ui-table">
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                className={`ui-table__cell--${column.align ?? 'start'}`}
                key={column.id}
                scope="col"
                style={column.width === undefined ? undefined : { width: column.width }}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={getRowKey(row)}>
              {columns.map((column) => (
                <td
                  className={`ui-table__cell--${column.align ?? 'start'}`}
                  data-label={column.header}
                  key={column.id}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
