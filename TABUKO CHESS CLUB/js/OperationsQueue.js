// js/OperationsQueue.js — Append-Only Tactical Log with Lifecycle Gates
const OperationsQueue = (() => {
  const _log = [];

  /**
   * push: Appends a mutation to the global ledger and executes it.
   */
  async function push(type, payload) {
    const op = {
      id: crypto.randomUUID(),
      type,
      payload,
      timestamp: Date.now(),
      status: 'pending'
    };

    // 1. Append to local state
    _log.push(op);

    // 2. Persist to Global Log (Firestore)
    try {
      await db.collection('operations_log').doc(op.id).set(op);
      console.log(`[OpsQueue] Op Sealed: ${type}`, op.id);
      
      // 3. Process the operation based on lifecycle logic
      return await executeOp(op);
    } catch (err) {
      console.error("[OpsQueue] Persistence Error", err);
      UI.showToast("Offline: Operation Cached", "warning");
    }
  }

  async function executeOp(op) {
    const { tournamentId, roundNumber } = op.payload;
    
    switch (op.type) {
      case 'SUBMIT_RESULT':
        // Direct integration with Tournament lifecycle
        return await Tournament.submitResultAndUpdate(tournamentId, roundNumber, op.payload.board, op.payload.whiteScore, op.payload.blackScore);
      
      case 'LOCK_ROUND':
        // Intermediate Lifecycle Step: Does NOT archive
        console.log(`[Lifecycle] Locking Round ${roundNumber} results...`);
        return await Tournament.lockRoundResults(tournamentId, roundNumber);
        
      case 'FINALIZE_TOURNAMENT':
        // Final Lifecycle Step: Archives and completes
        console.log(`[Lifecycle] FINALIZING TOURNAMENT...`);
        return await Tournament.finalizeTournament(tournamentId);

      default:
        console.warn("Unknown Op Type:", op.type);
    }
  }

  return { push, getLog: () => [..._log] };
})();

window.OperationsQueue = OperationsQueue;
