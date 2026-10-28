'use strict';

// In-process heartbeat for the central scalping calculation. It is deliberately
// independent of database opportunity rows: a successful run may produce zero
// actionable signals. A process restart clears the heartbeat until the next run.
let state = {
  startedAt: null,
  lastAttemptAt: null,
  lastCompletedAt: null,
  lastStatus: 'not-started',
  lastError: null,
  lastCandidateCount: null,
  lastSkipReason: null
};

function nowIso() {
  return new Date().toISOString();
}

function markStarted() {
  const now = nowIso();
  state = {
    ...state,
    startedAt: state.startedAt || now,
    lastAttemptAt: now,
    lastStatus: 'running',
    lastError: null,
    lastSkipReason: null
  };
}

function markCompleted(candidateCount) {
  const now = nowIso();
  state = {
    ...state,
    startedAt: state.startedAt || now,
    lastAttemptAt: state.lastAttemptAt || now,
    lastCompletedAt: now,
    lastStatus: 'completed',
    lastError: null,
    lastCandidateCount: Number.isFinite(Number(candidateCount)) ? Number(candidateCount) : 0,
    lastSkipReason: null
  };
}

function markSkipped(reason) {
  const now = nowIso();
  state = {
    ...state,
    lastAttemptAt: now,
    lastStatus: 'skipped',
    lastSkipReason: String(reason || 'unspecified'),
    lastError: null
  };
}

function markFailed(error) {
  const now = nowIso();
  state = {
    ...state,
    startedAt: state.startedAt || now,
    lastAttemptAt: state.lastAttemptAt || now,
    lastStatus: 'failed',
    lastError: String(error && error.message ? error.message : error || 'Unknown error').slice(0, 500),
    lastSkipReason: null
  };
}

function getStatus() {
  return { ...state };
}

module.exports = { markStarted, markCompleted, markSkipped, markFailed, getStatus };
