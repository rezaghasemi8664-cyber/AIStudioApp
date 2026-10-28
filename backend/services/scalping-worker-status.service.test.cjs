'use strict';

const status = require('./scalping-worker-status.service.cjs');

describe('scalping worker status heartbeat', () => {
  test('records a successful calculation even when no opportunities are found', () => {
    status.markStarted();
    status.markCompleted(0);

    const result = status.getStatus();
    expect(result.lastStatus).toBe('completed');
    expect(result.lastAttemptAt).toBeTruthy();
    expect(result.lastCompletedAt).toBeTruthy();
    expect(result.lastCandidateCount).toBe(0);
    expect(result.lastError).toBeNull();
  });

  test('records calculation failures separately from zero-signal runs', () => {
    status.markStarted();
    status.markFailed(new Error('history unavailable'));

    const result = status.getStatus();
    expect(result.lastStatus).toBe('failed');
    expect(result.lastError).toBe('history unavailable');
    expect(result.lastAttemptAt).toBeTruthy();
  });

  test('records skipped execution outside market hours without claiming success', () => {
    status.markSkipped('market-closed');

    const result = status.getStatus();
    expect(result.lastStatus).toBe('skipped');
    expect(result.lastSkipReason).toBe('market-closed');
  });
});
