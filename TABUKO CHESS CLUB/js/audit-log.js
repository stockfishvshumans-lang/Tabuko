/**
 * audit-log.js — Arbiter Audit Logging
 * Immutable log of every critical state change for FIDE dispute resolution.
 * Records: timestamp, admin UID/email, tournament ID, action, details.
 */
const AuditLog = (() => {

  /**
   * Write an audit log entry to Firestore.
   *
   * @param {string} action - Action identifier (e.g. 'ROUND_STARTED', 'RESULT_SUBMITTED')
   * @param {string|null} tournamentId - Associated tournament (null for auth events)
   * @param {Object} details - Action-specific data
   */
  async function log(action, tournamentId, details = {}) {
    try {
      const user = Auth.getUser();
      await db.collection('audit_logs').add({
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        clientTimestamp: new Date().toISOString(),
        adminUid: user ? user.uid : 'system',
        adminEmail: user ? Auth.displayEmail(user.email) : 'system',
        tournamentId: tournamentId || null,
        action,
        details,
        _offline: !navigator.onLine  // Flag if created offline
      });
    } catch (err) {
      // Silently queue — offline persistence will sync later
      console.warn('[AuditLog] Write queued (offline?):', err.message);
    }
  }

  /**
   * Fetch audit logs for a tournament.
   */
  async function getLogsForTournament(tournamentId, limit = 100) {
    const snap = await db.collection('audit_logs')
      .where('tournamentId', '==', tournamentId)
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  /**
   * Fetch all recent audit logs.
   */
  async function getRecentLogs(limit = 50) {
    const snap = await db.collection('audit_logs')
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  /**
   * Simplified alias for arbiters to use in UI/Logic flows.
   */
  async function logArbiterAction(actionType, details, tournamentId = null) {
    return log(actionType, tournamentId, details);
  }

  /**
   * Undo a soft delete by restoring the archived document.
   */
  async function undoAction(collection, docId) {
    try {
      await db.collection(collection).doc(docId).update({
        isArchived: false,
        restoredAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      await log(ACTIONS.RESTORED, null, { collection, docId });
      return true;
    } catch (err) {
      console.error('[AuditLog] Undo failed:', err);
      throw err;
    }
  }

  // ── Action constants ──
  const ACTIONS = {
    AUTH_SIGN_IN: 'AUTH_SIGN_IN',
    AUTH_SIGN_OUT: 'AUTH_SIGN_OUT',
    TOURNAMENT_CREATED: 'TOURNAMENT_CREATED',
    TOURNAMENT_UPDATED: 'TOURNAMENT_UPDATED',
    TOURNAMENT_DELETED: 'TOURNAMENT_DELETED',
    TOURNAMENT_COMPLETED: 'TOURNAMENT_COMPLETED',
    ROUND_STARTED: 'ROUND_STARTED',
    RESULT_SUBMITTED: 'RESULT_SUBMITTED',
    RESULT_CHANGED: 'RESULT_CHANGED',
    PLAYER_REGISTERED: 'PLAYER_REGISTERED',
    PLAYER_WITHDRAWN: 'PLAYER_WITHDRAWN',
    PLAYER_REJOINED: 'PLAYER_REJOINED',
    STANDINGS_RECALCULATED: 'STANDINGS_RECALCULATED',
    CLUB_MEMBER_ADDED: 'CLUB_MEMBER_ADDED',
    CLUB_MEMBER_UPDATED: 'CLUB_MEMBER_UPDATED',
    CLUB_MEMBER_DELETED: 'CLUB_MEMBER_DELETED',
    CLUB_RATING_UPDATED: 'CLUB_RATING_UPDATED',
    SETTINGS_UPDATED: 'SETTINGS_UPDATED',
    RESTORED: 'RESTORED'
  };

  return { log, logArbiterAction, getLogsForTournament, getRecentLogs, undoAction, ACTIONS };
})();

// Global Export
window.AuditLog = AuditLog;
