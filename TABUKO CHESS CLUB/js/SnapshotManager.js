// js/SnapshotManager.js — Local State Recomputation & Sync
const SnapshotManager = (() => {

  /**
   * recomputeLocalState: Synchronizes the UI by replaying the ops log.
   * This is critical for offline-first reliability.
   */
  async function recomputeLocalState(tournamentId) {
    console.log(`[Snapshot] Syncing local state for ${tournamentId}...`);
    
    // 1. Fetch latest checkpoint
    const snapshot = await db.collection('tournaments').doc(tournamentId).collection('snapshots').orderBy('timestamp', 'desc').limit(1).get();
    let state = snapshot.empty ? { results: {}, lockedRounds: [] } : snapshot.docs[0].data().state;
    const since = snapshot.empty ? 0 : snapshot.docs[0].data().timestamp;

    // 2. Fetch trailing operations log
    const ops = await db.collection('operations_log')
      .where('payload.tournamentId', '==', tournamentId)
      .where('timestamp', '>', since)
      .orderBy('timestamp', 'asc')
      .get();

    // 3. Replay log onto state
    ops.forEach(doc => {
      const op = doc.data();
      if (op.type === 'SUBMIT_RESULT') {
        state.results[`${op.payload.roundNumber}_${op.payload.board}`] = op.payload.result;
      } else if (op.type === 'LOCK_ROUND') {
        state.lockedRounds.push(op.payload.roundNumber);
      }
    });

    return state;
  }

  return { recomputeLocalState };
})();

window.SnapshotManager = SnapshotManager;
