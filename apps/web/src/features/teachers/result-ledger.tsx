/**
 * ResultLedger — high-density, ledger-style score-entry grid.
 *
 * Supports:
 *  - Tab/Enter/Arrow keyboard navigation across the 2-D cell grid
 *  - Typing "a" in a score cell to toggle Absent state
 *  - Per-row Exempt toggle (EXM)
 *  - Live provisional total + grade (client-side approximation only; server is authoritative)
 *  - Debounced per-row autosave (800 ms after last change)
 *  - Per-row dirty / saving / saved / error indicators
 *  - Published-batch correction slide-over
 */
import type {
  GradingSchemeDto,
  ResultBatchDto,
  ResultComponentDto,
  ResultEntryDto,
} from '@onyx/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react';

import { ApiClientError } from '../../lib/api/index.js';
import { useAuthSession } from '../../lib/auth/use-auth-session.js';
import { Button, FormField } from '../../shared/ui/index.js';
import { teacherApi, teacherQueryKeys } from './teacher-api.js';

// ─── helpers ────────────────────────────────────────────────────────────────

function apiErrorMessage(error: Error | null): string | undefined {
  if (error === null) return undefined;
  return error instanceof ApiClientError ? error.message : 'The request could not be completed.';
}

/** Provisional total from draft components (ABSENT components score 0). */
function provisionalTotal(components: readonly ResultComponentDto[]): number {
  return components.reduce((sum, c) => {
    if (c.state === 'ABSENT') return sum;
    const raw = Number(c.score);
    return sum + (Number.isFinite(raw) ? raw : 0);
  }, 0);
}

/** Provisional grade from total and grading scheme bands. */
function provisionalGrade(
  total: number,
  scheme: ResultBatchDto['assessmentScheme'],
  grading: GradingSchemeDto,
): string | undefined {
  const max = Number(scheme.totalMaximum);
  if (max <= 0 || !Number.isFinite(max)) return undefined;
  const pct = (total / max) * 100;
  const band = [...grading.bands]
    .sort((a, b) => Number(a.minimumPercentage) - Number(b.minimumPercentage))
    .find((b) => pct >= Number(b.minimumPercentage) && pct <= Number(b.maximumPercentage));
  return band?.grade;
}

function getComponentValue(
  components: readonly ResultComponentDto[],
  key: string,
): ResultComponentDto {
  return (
    components.find((c) => c.key === key) ?? {
      key,
      state: 'SCORED' as const,
      score: '',
    }
  );
}

// ─── row save-state ──────────────────────────────────────────────────────────

type RowSaveState = 'clean' | 'dirty' | 'saving' | 'saved' | 'error';

// ─── correction dialog ───────────────────────────────────────────────────────

interface CorrectionDialogProps {
  batch: ResultBatchDto;
  entry: ResultEntryDto;
  draft: EntryDraft;
  onClose: () => void;
}

function CorrectionDialog({ batch, entry, draft: parentDraft, onClose }: CorrectionDialogProps) {
  const auth = useAuthSession();
  const cache = useQueryClient();
  const [reason, setReason] = useState('');
  const [localDraft, setLocalDraft] = useState<EntryDraft>(() => ({
    components: [...parentDraft.components],
    exempt: parentDraft.exempt,
  }));

  function setLocalComponent(key: string, update: ResultComponentDto) {
    setLocalDraft((prev) => ({
      ...prev,
      components: prev.components.some((c) => c.key === key)
        ? prev.components.map((c) => (c.key === key ? update : c))
        : [...prev.components, update],
    }));
  }

  const correction = useMutation({
    mutationFn: () =>
      teacherApi.requestResultCorrection(auth.apiClient, entry.id, {
        ...localDraft,
        reason,
      }),
    onSuccess: async () => {
      setReason('');
      await cache.invalidateQueries({ queryKey: teacherQueryKeys.resultBatch(batch.id) });
    },
  });

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section aria-modal="true" className="dialog surface" role="dialog">
        <h2 className="ledger-dialog__title">Request correction</h2>
        <p className="ledger-dialog__student">
          <strong>{entry.student.name}</strong>
          <span className="ledger-dialog__student-id">{entry.student.studentId}</span>
        </p>
        <p className="ledger-dialog__note">
          This batch is published. Adjust the scores below and enter a correction reason — school
          administration will review the request.
        </p>
        <div className="ledger-dialog__scores">
          {batch.assessmentScheme.components.map((component) => {
            const value = getComponentValue(localDraft.components, component.key);
            return (
              <FormField
                controlId={`correction-score-${entry.id}-${component.key}`}
                key={component.key}
                label={`${component.label} (max ${component.maximum})`}
              >
                <input
                  aria-label={`${component.label} for ${entry.student.name}`}
                  className="ledger__score-input"
                  id={`correction-score-${entry.id}-${component.key}`}
                  inputMode="decimal"
                  max={component.maximum}
                  min="0"
                  step="0.01"
                  type="number"
                  value={value.score ?? ''}
                  onChange={(e) => {
                    setLocalComponent(component.key, {
                      key: component.key,
                      score: e.target.value,
                      state: 'SCORED',
                    });
                  }}
                />
              </FormField>
            );
          })}
        </div>
        <FormField controlId={`correction-reason-${entry.id}`} label="Reason for correction">
          <textarea
            id={`correction-reason-${entry.id}`}
            rows={3}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
            }}
          />
        </FormField>
        {correction.isError ? (
          <p className="form-alert form-alert--error" role="alert">
            {apiErrorMessage(correction.error)}
          </p>
        ) : null}
        {correction.isSuccess ? (
          <p className="form-alert form-alert--success" role="status">
            Correction request submitted.
          </p>
        ) : null}
        <div className="ledger-dialog__actions">
          <Button
            disabled={reason.trim().length < 5}
            loading={correction.isPending}
            loadingLabel="Submitting…"
            variant="primary"
            onClick={() => {
              correction.mutate();
            }}
          >
            Submit request
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </section>
    </div>
  );
}

// ─── ledger row ──────────────────────────────────────────────────────────────

interface EntryDraft {
  components: ResultComponentDto[];
  exempt: boolean;
}

interface LedgerRowProps {
  batch: ResultBatchDto;
  entry: ResultEntryDto;
  rowIndex: number;
  editable: boolean;
  /** ref grid: inputRefs.current[row][col] */
  inputRefs: RefObject<(HTMLInputElement | null)[][]>;
  onDirtyChange: (id: string, state: RowSaveState) => void;
  onSaved: (id: string) => void;
}

function LedgerRow({
  batch,
  entry,
  rowIndex,
  editable,
  inputRefs,
  onDirtyChange,
  onSaved,
}: LedgerRowProps) {
  const auth = useAuthSession();
  const cache = useQueryClient();
  const [draft, setDraft] = useState<EntryDraft>({
    components: [...entry.components],
    exempt: entry.exempt,
  });
  const [saveState, setSaveState] = useState<RowSaveState>('clean');
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useMutation({
    mutationFn: () => teacherApi.saveResultEntry(auth.apiClient, entry.id, draft),
    onMutate: () => {
      setSaveState('saving');
      onDirtyChange(entry.id, 'saving');
    },
    onSuccess: async () => {
      setSaveState('saved');
      onSaved(entry.id);
      await cache.invalidateQueries({ queryKey: teacherQueryKeys.resultBatch(batch.id) });
      // Reset to "clean" after 2 s so the indicator fades
      setTimeout(() => {
        setSaveState((prev) => (prev === 'saved' ? 'clean' : prev));
      }, 2000);
    },
    onError: () => {
      setSaveState('error');
      onDirtyChange(entry.id, 'error');
    },
  });

  // Debounced autosave: fires 800 ms after the last draft change when editable
  useEffect(() => {
    if (!editable) return;
    if (saveState !== 'dirty') return;
    if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      save.mutate();
    }, 800);
    return () => {
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- draft is captured in mutationFn closure
  }, [draft, editable, saveState]);

  function markDirty() {
    setSaveState('dirty');
    onDirtyChange(entry.id, 'dirty');
  }

  function setComponent(key: string, update: ResultComponentDto) {
    markDirty();
    setDraft((prev) => ({
      ...prev,
      components: prev.components.some((c) => c.key === key)
        ? prev.components.map((c) => (c.key === key ? update : c))
        : [...prev.components, update],
    }));
  }

  function toggleExempt(exempt: boolean) {
    markDirty();
    setDraft((prev) => ({ ...prev, exempt, components: exempt ? [] : prev.components }));
  }

  // Keyboard navigation: Tab moves right (let browser), Enter/Down moves down same col, Up moves up
  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>, col: number) {
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      const nextRow = rowIndex + 1;
      inputRefs.current[nextRow]?.[col]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevRow = rowIndex - 1;
      inputRefs.current[prevRow]?.[col]?.focus();
    }
  }

  const components = batch.assessmentScheme.components;

  const provTotal = useMemo(
    () => (draft.exempt ? undefined : provisionalTotal(draft.components)),
    [draft.components, draft.exempt],
  );
  const provGrade = useMemo(
    () =>
      draft.exempt || provTotal === undefined
        ? undefined
        : provisionalGrade(provTotal, batch.assessmentScheme, batch.gradingScheme),
    [draft.exempt, provTotal, batch.assessmentScheme, batch.gradingScheme],
  );

  const rowClass = [
    'ledger__row',
    'result-entry-card',
    draft.exempt ? 'ledger__row--exempt' : '',
    saveState === 'saving' ? 'ledger__row--saving' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <tr className={rowClass}>
        {/* Student info */}
        <td className="ledger__cell ledger__cell--student">
          <span className="ledger__student-name">{entry.student.name}</span>
          <span className="ledger__student-id">{entry.student.studentId}</span>
        </td>

        {/* Score cells */}
        {components.map((component, colIndex) => {
          const value = getComponentValue(draft.components, component.key);
          const isAbsent = value.state === 'ABSENT';
          const disabled = draft.exempt || isAbsent || !editable;

          return (
            <td className="ledger__cell ledger__cell--score" key={component.key}>
              {isAbsent ? (
                <button
                  className="ledger__abs-badge"
                  title="Click to clear absent mark"
                  type="button"
                  onClick={() => {
                    if (!editable || draft.exempt) return;
                    setComponent(component.key, { key: component.key, score: '', state: 'SCORED' });
                  }}
                >
                  ABS
                </button>
              ) : (
                <input
                  aria-label={`${component.label} for ${entry.student.name}`}
                  className="ledger__score-input"
                  data-col={colIndex}
                  data-row={rowIndex}
                  disabled={disabled}
                  inputMode="decimal"
                  max={component.maximum}
                  min="0"
                  ref={(el) => {
                    (inputRefs.current[rowIndex] ??= [])[colIndex] = el;
                  }}
                  step="0.01"
                  type="number"
                  value={value.score ?? ''}
                  onChange={(e) => {
                    setComponent(component.key, {
                      key: component.key,
                      score: e.target.value,
                      state: 'SCORED',
                    });
                  }}
                  onKeyDown={(e) => {
                    handleKeyDown(e, colIndex);
                    // "a" toggles Absent
                    if (e.key === 'a' && !e.ctrlKey && !e.metaKey && editable && !draft.exempt) {
                      e.preventDefault();
                      setComponent(component.key, { key: component.key, state: 'ABSENT' });
                    }
                  }}
                />
              )}
            </td>
          );
        })}

        {/* Provisional total */}
        <td className="ledger__cell ledger__cell--total">
          {draft.exempt ? (
            <span className="ledger__exm-badge">EXM</span>
          ) : provTotal !== undefined ? (
            <span className="ledger__total-value">{provTotal.toFixed(2)}</span>
          ) : (
            <span className="ledger__pending">—</span>
          )}
        </td>

        {/* Provisional grade */}
        <td className="ledger__cell ledger__cell--grade">
          {draft.exempt ? null : provGrade !== undefined ? (
            <span className="ledger__grade-value">{provGrade}</span>
          ) : (
            <span className="ledger__pending">—</span>
          )}
        </td>

        {/* Actions / state */}
        <td className="ledger__cell ledger__cell--actions">
          <div className="ledger__row-actions">
            {editable ? (
              <label className="ledger__exempt-label" title="Exempt student from this subject">
                <input
                  checked={draft.exempt}
                  className="ledger__exempt-check"
                  type="checkbox"
                  onChange={(e) => {
                    toggleExempt(e.target.checked);
                  }}
                />
                <span aria-hidden="true">EXM</span>
                <span className="visually-hidden">Exempt</span>
              </label>
            ) : null}
            {batch.status === 'PUBLISHED' && !editable ? (
              <button
                className="ledger__correction-btn"
                title="Request a published-result correction"
                type="button"
                onClick={() => {
                  setCorrectionOpen(true);
                }}
              >
                Correct
              </button>
            ) : null}
            <LedgerRowSaveIndicator
              error={saveState === 'error' ? apiErrorMessage(save.error) : undefined}
              state={saveState}
            />
          </div>
        </td>
      </tr>

      {correctionOpen ? (
        <CorrectionDialog
          batch={batch}
          draft={draft}
          entry={entry}
          onClose={() => {
            setCorrectionOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

// ─── save indicator ──────────────────────────────────────────────────────────

function LedgerRowSaveIndicator({
  state,
  error,
}: {
  state: RowSaveState;
  error: string | undefined;
}) {
  if (state === 'clean') return null;
  if (state === 'dirty')
    return (
      <span aria-live="polite" className="ledger__save-state ledger__save-state--dirty">
        Unsaved
      </span>
    );
  if (state === 'saving')
    return (
      <span aria-live="polite" className="ledger__save-state ledger__save-state--saving">
        Saving…
      </span>
    );
  if (state === 'saved')
    return (
      <span aria-live="polite" className="ledger__save-state ledger__save-state--saved">
        Saved
      </span>
    );
  return (
    <span
      aria-live="assertive"
      className="ledger__save-state ledger__save-state--error"
      title={error}
    >
      Error
    </span>
  );
}

// ─── public component ────────────────────────────────────────────────────────

export interface ResultLedgerProps {
  batch: ResultBatchDto;
  /** Called when any row transitions to dirty/error (true) or clean/saved (false). */
  onAnyDirty: (anyDirty: boolean) => void;
}

export function ResultLedger({ batch, onAnyDirty }: ResultLedgerProps) {
  // 2-D ref grid: [rowIndex][colIndex] → input element
  const inputRefs = useRef<(HTMLInputElement | null)[][]>([]);

  // Map of entryId → RowSaveState for global tracking
  const [rowStates, setRowStates] = useState<ReadonlyMap<string, RowSaveState>>(new Map());

  const handleDirtyChange = useCallback((id: string, state: RowSaveState) => {
    setRowStates((prev) => {
      const next = new Map(prev);
      next.set(id, state);
      return next;
    });
  }, []);

  const handleSaved = useCallback((id: string) => {
    setRowStates((prev) => {
      const next = new Map(prev);
      next.set(id, 'saved');
      return next;
    });
  }, []);

  useEffect(() => {
    const hasDirty = [...rowStates.values()].some(
      (s) => s === 'dirty' || s === 'saving' || s === 'error',
    );
    onAnyDirty(hasDirty);
  }, [rowStates, onAnyDirty]);

  const editable = batch.status === 'DRAFT' || batch.status === 'RETURNED_FOR_CORRECTION';
  const components = batch.assessmentScheme.components;

  return (
    <div className="ledger-wrap">
      <table className="ui-table ledger-table">
        <caption className="visually-hidden">
          Score entry for {batch.subject.name} — {batch.classLevel.name}
          {batch.track ? ` / ${batch.track.name}` : ''} — {batch.term.name} /{' '}
          {batch.academicSession.label}
        </caption>
        <thead>
          <tr>
            <th className="ledger__hcell ledger__hcell--student" scope="col">
              Student
            </th>
            {components.map((c) => (
              <th className="ledger__hcell ledger__hcell--score" key={c.key} scope="col">
                <span className="ledger__hcell-label">{c.label}</span>
                <span className="ledger__hcell-max">/ {c.maximum}</span>
              </th>
            ))}
            <th className="ledger__hcell ledger__hcell--total" scope="col">
              Total
              <span className="ledger__hcell-max">/ {batch.assessmentScheme.totalMaximum}</span>
            </th>
            <th className="ledger__hcell ledger__hcell--grade" scope="col">
              Grade
            </th>
            <th className="ledger__hcell ledger__hcell--actions" scope="col">
              <span className="visually-hidden">Row actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {batch.entries.length === 0 ? (
            <tr>
              <td colSpan={components.length + 4} className="ledger__empty">
                No eligible enrolled students were found for this subject.
              </td>
            </tr>
          ) : (
            batch.entries.map((entry, rowIndex) => (
              <LedgerRow
                batch={batch}
                editable={editable}
                entry={entry}
                inputRefs={inputRefs}
                key={entry.id}
                onDirtyChange={handleDirtyChange}
                onSaved={handleSaved}
                rowIndex={rowIndex}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
