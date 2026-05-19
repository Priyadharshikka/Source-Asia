'use strict';

const config = require('../../config');

/**
 * In-memory rate-limit store.
 *
 * Per user_id we keep:
 *   - acceptedTimestamps: number[]  (ms epoch, sorted ascending — append-only)
 *   - rejectedTotal:      number    (cumulative, lifetime of the process)
 *
 * All operations execute synchronously inside one Node.js event-loop tick,
 * so even with thousands of concurrent connections they cannot interleave:
 * Node guarantees that a synchronous block runs to completion before
 * any other JS code on the same loop. That is what makes
 * `tryAccept` correct under concurrency without an explicit mutex.
 */
class RateLimitStore {
  constructor({ windowMs, maxAccepted }) {
    this.windowMs = windowMs;
    this.maxAccepted = maxAccepted;
    /** @type {Map<string, { acceptedTimestamps: number[], rejectedTotal: number }>} */
    this.byUser = new Map();
  }

  _getOrCreate(userId) {
    let bucket = this.byUser.get(userId);
    if (!bucket) {
      bucket = { acceptedTimestamps: [], rejectedTotal: 0 };
      this.byUser.set(userId, bucket);
    }
    return bucket;
  }

  /**
   * Drops timestamps older than (now - windowMs). Mutates the array in place.
   */
  _prune(bucket, now) {
    const cutoff = now - this.windowMs;
    const ts = bucket.acceptedTimestamps;
    // ts is sorted ascending; find first index >= cutoff and slice from there.
    // Linear scan is fine because the array is bounded by maxAccepted (5).
    let i = 0;
    while (i < ts.length && ts[i] <= cutoff) i += 1;
    if (i > 0) bucket.acceptedTimestamps = ts.slice(i);
  }

  /**
   * Atomically attempt to accept a request for `userId`.
   * Returns { accepted: true, acceptedInWindow } or
   *         { accepted: false, retryAfterMs, acceptedInWindow }.
   *
   * IMPORTANT: must remain fully synchronous (no await) so concurrent calls
   * cannot observe a stale window.
   */
  tryAccept(userId, now = Date.now()) {
    const bucket = this._getOrCreate(userId);
    this._prune(bucket, now);

    if (bucket.acceptedTimestamps.length < this.maxAccepted) {
      bucket.acceptedTimestamps.push(now);
      return {
        accepted: true,
        acceptedInWindow: bucket.acceptedTimestamps.length,
      };
    }

    bucket.rejectedTotal += 1;
    const oldest = bucket.acceptedTimestamps[0];
    const retryAfterMs = Math.max(0, oldest + this.windowMs - now);
    return {
      accepted: false,
      retryAfterMs,
      acceptedInWindow: bucket.acceptedTimestamps.length,
    };
  }

  /**
   * Returns per-user stats. If `userId` is omitted, returns a map of all users.
   */
  getStats(userId, now = Date.now()) {
    if (userId !== undefined) {
      const bucket = this.byUser.get(userId);
      if (!bucket) {
        return {
          user_id: userId,
          accepted_in_current_window: 0,
          rejected_total: 0,
          window_ms: this.windowMs,
          max_accepted_per_window: this.maxAccepted,
        };
      }
      this._prune(bucket, now);
      return {
        user_id: userId,
        accepted_in_current_window: bucket.acceptedTimestamps.length,
        rejected_total: bucket.rejectedTotal,
        window_ms: this.windowMs,
        max_accepted_per_window: this.maxAccepted,
      };
    }

    const users = [];
    let globalAccepted = 0;
    let globalRejected = 0;
    for (const [uid, bucket] of this.byUser.entries()) {
      this._prune(bucket, now);
      users.push({
        user_id: uid,
        accepted_in_current_window: bucket.acceptedTimestamps.length,
        rejected_total: bucket.rejectedTotal,
      });
      globalAccepted += bucket.acceptedTimestamps.length;
      globalRejected += bucket.rejectedTotal;
    }
    return {
      window_ms: this.windowMs,
      max_accepted_per_window: this.maxAccepted,
      totals: {
        users: users.length,
        accepted_in_current_window: globalAccepted,
        rejected_total: globalRejected,
      },
      users,
    };
  }
}

// Module-level singleton. In production you'd inject this; for an in-memory
// single-instance service a module singleton is simple and explicit.
const store = new RateLimitStore(config.rateLimit);

module.exports = { RateLimitStore, store };
