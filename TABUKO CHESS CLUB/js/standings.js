/**
 * standings.js — Pure FIDE Data Adapter
 * Strictly responsible for mapping Firebase data to the TieBreak.js schema.
 * Contains ZERO UI rendering and ZERO mathematical tiebreak logic.
 */
const Standings = (() => {

  /**
   * prepareData: Converts flat Firebase records into FIDE-ready player objects.
   * Schema: { results: [ {opponentId, result, color, round, isUnplayed} ], roundScores: [ 1, 0.5, 0... ] }
   */
  function prepareData(rawPlayers, rawMatches, targetRound) {
    // 1. Guard clauses and aggressive type coercion
    const players = Array.isArray(rawPlayers) ? JSON.parse(JSON.stringify(rawPlayers)) : [];

    // DEFENSIVE: Sanitize rawMatches immediately to remove nulls or non-objects
    const rawArr = Array.isArray(rawMatches) ? rawMatches :
      (rawMatches && typeof rawMatches === 'object' ? Object.values(rawMatches) : []);
    const safeMatches = rawArr.filter(m => m && typeof m === 'object');

    const target = parseInt(targetRound, 10) || 0;

    if (players.length === 0 || target === 0) return [];

    return players.map(player => {
      // 2. Initialize strict FIDE properties
      const p = {
        ...player,
        results: [],
        roundScores: [],
        score: 0
      };

      // 3. STRICT ROUND ALIGNMENT: Loop precisely from Round 1 to targetRound
      // This guarantees `roundScores[0]` is ALWAYS Round 1, preventing TieBreak.js indexing crashes.
      for (let r = 1; r <= target; r++) {
        // Find the match for this specific round
        const m = safeMatches.find(match => {
          const isParticipant = (match.whiteId === p.id || match.blackId === p.id || (match.isBye && match.playerId === p.id));
          const hasResult = (match.result && match.result !== '') || match.isBye;
          const matchRound = parseInt(match.round, 10);
          return isParticipant && hasResult && matchRound === r;
        });

        if (m) {
          // Player played or had an official BYE this round
          let points = 0;
          const isWhite = m.whiteId === p.id;
          const opponentId = isWhite ? m.blackId : m.whiteId;

          if (m.isBye === true || m.result === 'BYE') {
            // FIDE Bye Logic
            points = 1;
            p.results.push({
              opponentId: null,
              result: 1,
              color: 'None',
              round: r,
              isUnplayed: true
            });
          } else {
            // Standard Result Logic
            const res = m.result;
            
            // 1. FIREBASE OBJECT SUPPORT (Extract from {whiteScore, blackScore})
            if (typeof res === 'object' && res !== null) {
              points = isWhite ? Number(res.whiteScore || 0) : Number(res.blackScore || 0);
            } 
            // 2. STRING FALLBACK ("1-0", "0.5-0.5", etc)
            else if (res === '1-0') points = isWhite ? 1 : 0;
            else if (res === '0-1') points = isWhite ? 0 : 1;
            else if (res === '0.5-0.5' || res === '½-½') points = 0.5;

            p.results.push({
              opponentId: opponentId,
              result: points,
              color: isWhite ? 'White' : 'Black',
              round: r,
              isUnplayed: false
            });
          }

          p.roundScores.push(points);
          p.score += points;

        } else {
          // Missing/Unplayed Round (Late Entry, Unpaired, or Missing Data)
          // MUST pad the arrays to preserve FIDE math indexing (C.02.13.2)
          p.results.push({
            opponentId: null,
            result: 0,
            color: 'None',
            round: r,
            isUnplayed: true
          });
          p.roundScores.push(0);
        }
      }

      return p;
    });
  }

  /**
   * generateLiveStandings: The master orchestrator for the reactive pipeline.
   * Called by UI.js to refresh the standings leaderboard.
   */
  function generateLiveStandings(rawPlayers, rawMatches, targetRound, totalRounds) {
    console.group("🏆 Standings Pipeline Trace");
    console.log("1. Raw Firebase Input:", { rawPlayers, rawMatches, targetRound, totalRounds });

    // 1. Adapter Stage
    const preparedPlayers = prepareData(rawPlayers, rawMatches, targetRound);
    console.log("2. FIDE Adapted Data:", preparedPlayers);

    // 2. Math Engine Stage
    try {
      if (typeof TieBreak === 'undefined' || !TieBreak.rankPlayers) {
        throw new Error("TieBreak.js module is missing from the global window scope.");
      }

      // Chain directly to the FIDE math engine
      const finalStandings = TieBreak.rankPlayers(preparedPlayers, null, totalRounds);

      console.log("3. FIDE Engine Output:", finalStandings);
      console.groupEnd();
      return finalStandings;

    } catch (error) {
      console.error("❌ FIDE Engine Crash:", error);
      console.groupEnd();
      // Throw the error so the UI.js try/catch can render the visual error card
      throw error;
    }
  }

  // EXPORT BLOCK
  return {
    prepareData,
    prepareDataForTiebreaks: prepareData, // Alias
    generateLiveStandings,
    calculateStandings: generateLiveStandings, // Alias
    createStandingsCache: generateLiveStandings, // Alias
    calculateTeamStandings: (teams) => (window.TeamStandings || TeamStandings).sortTeams(teams)
  };
})();

// Explicit Global Export
window.Standings = Standings;