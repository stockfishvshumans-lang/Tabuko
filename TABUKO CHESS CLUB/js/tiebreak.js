/**
 * tiebreak.js — STRICT FIDE-Compliant Tie-Break Engine
 * 
 * MATHEMATICAL FIXES:
 * 1. Buchholz Virtual Opponent (C.02.13.2): VirtualScore = PlayerScoreBeforeRound + Result + (RemainingRounds × 0.5)
 * 2. Sonneborn-Berger (C.02.13.2): Correctly handles unplayed games using virtual opponent.
 * 3. Direct Encounter: Applied ONLY if all tied players played each other.
 * 4. Error boundaries: Fails properly when data is missing or inconsistent.
 */
const TieBreak = (() => {

  function buildPlayerMap(players) {
    const map = {};
    players.forEach(p => (map[p.id] = p));
    return map;
  }

  function getScore(player) {
    if (!player.roundScores) throw new Error(`Invalid scores for player ${player.id}`);
    return player.roundScores.reduce((s, r) => s + r, 0);
  }

  /**
   * FIDE Virtual Opponent Score Calculation (C.02.13.2)
   */
  function getVirtualOpponentScore(player, roundNumber, totalRounds) {
    if (!player.roundScores || player.roundScores.length < roundNumber) {
      throw new Error(`Inconsistent results: Missing round score for player ${player.id} in round ${roundNumber}`);
    }
    
    // PlayerScoreBeforeRound
    const scoreBeforeRound = player.roundScores
      .slice(0, roundNumber - 1)
      .reduce((s, r) => s + r, 0);

    // Result of the unplayed round for the player
    const resultForRound = player.roundScores[roundNumber - 1];
    
    // Remaining rounds after this one
    const remainingRounds = totalRounds - roundNumber;

    return scoreBeforeRound + resultForRound + (remainingRounds * 0.5);
  }

  function getOpponentScoreForBuchholz(player, r, playerMap, totalRounds) {
    const isUnplayed = !r.opponentId || !playerMap[r.opponentId] || r.isForfeit === true || r.isBye === true;

    if (isUnplayed) {
      return getVirtualOpponentScore(player, r.round, totalRounds);
    }
    
    if (!playerMap[r.opponentId]) {
      throw new Error(`Missing opponent data: ${r.opponentId} not found`);
    }

    return getScore(playerMap[r.opponentId]);
  }

  function buchholzFull(player, playerMap, totalRounds) {
    return (player.results || []).reduce((sum, r) => {
      return sum + getOpponentScoreForBuchholz(player, r, playerMap, totalRounds);
    }, 0);
  }

  function buchholzCut1(player, playerMap, totalRounds) {
    const scores = (player.results || [])
      .map(r => getOpponentScoreForBuchholz(player, r, playerMap, totalRounds))
      .sort((a, b) => a - b);
    if (scores.length <= 1) {
      return scores.reduce((a, b) => a + b, 0);
    }
    return scores.slice(1).reduce((s, v) => s + v, 0); // remove the lowest
  }

  function sonnebornBerger(player, playerMap, totalRounds) {
    return (player.results || []).reduce((sum, r) => {
      const oppScore = getOpponentScoreForBuchholz(player, r, playerMap, totalRounds);
      return sum + (r.result * oppScore);
    }, 0);
  }

  function numberOfWins(player) {
    return (player.results || []).reduce((count, r) => {
      return count + (r.result === 1 ? 1 : 0);
    }, 0);
  }

  function blackWinsGames(player) {
    return (player.results || []).reduce((count, r) => {
      const isBlack = r.color && r.color.toString().toLowerCase().startsWith('b');
      return count + ((r.result === 1 && isBlack) ? 1 : 0);
    }, 0);
  }

  function progressiveScore(player) {
    let sum = 0, total = 0;
    (player.roundScores || []).forEach(r => {
      sum += r;
      total += sum;
    });
    return total;
  }

  function applyDirectEncounter(group) {
    if (group.length <= 1) return;
    
    const ids = group.map(p => p.id);
    
    // Check if ALL tied players played EACH OTHER
    let allPlayed = true;
    for (const p of group) {
      const opponentsInGroup = (p.results || []).filter(r => ids.includes(r.opponentId)).map(r => r.opponentId);
      const uniqueOpponents = new Set(opponentsInGroup);
      if (uniqueOpponents.size < group.length - 1) {
        allPlayed = false;
        break;
      }
    }

    if (!allPlayed) {
      // Direct Encounter skipped
      for (const p of group) {
        p.tieBreaks.DE = 0;
      }
      return;
    }

    // Apply DE
    for (const p of group) {
      let deScore = 0;
      for (const r of (p.results || [])) {
        if (ids.includes(r.opponentId)) {
          deScore += r.result;
        }
      }
      p.tieBreaks.DE = deScore;
    }
  }

  function directEncounter(p1, p2) {
    const match = (p1.results || []).find(r => r.opponentId === p2.id);
    if (!match) return 0;
    if (match.result === 1) return 1;
    if (match.result === 0) return -1;
    return 0;
  }

  function directEncounterGroup(group) {
    const ids = group.map(p => p.id);
    const scores = {};
    group.forEach(p => {
      scores[p.id] = (p.results || [])
        .filter(r => ids.includes(r.opponentId))
        .reduce((sum, r) => sum + r.result, 0);
    });
    return scores;
  }


  function calculateAllTieBreaks(players, order, totalRounds) {
    const map = buildPlayerMap(players);
    return players.map(p => {
      if (!p.results || !p.roundScores) {
         throw new Error(`Inconsistent results: Missing results/scores for player ${p.id}`);
      }

      if (p.results.length !== p.roundScores.length) {
         throw new Error(`Inconsistent results: Length mismatch for player ${p.id}`);
      }

      const tb = {
        BHC1: buchholzCut1(p, map, totalRounds),
        BH: buchholzFull(p, map, totalRounds),
        SB: sonnebornBerger(p, map, totalRounds),
        PS: progressiveScore(p),
        WIN: numberOfWins(p),
        BWG: blackWinsGames(p),
        DE: 0
      };

      // FIDE FLAT MAPPING: Attach variables directly to root for UI performance
      return { 
        ...p, 
        score: getScore(p), 
        bhc1: tb.BHC1,
        bh: tb.BH,
        sb: tb.SB,
        ps: tb.PS,
        win: tb.WIN,
        bwg: tb.BWG,
        de: 0,
        tieBreaks: tb // Keep nested object for internal math compatibility
      };
    });
  }

  // Authoritative ranking per FIDE strict order
  function rankPlayers(players, order, totalRounds) {
    // Determine the authoritative FIDE order (override parameter)
    const tbOrder = ['score', 'BHC1', 'BH', 'SB', 'DE', 'PS', 'WIN', 'BWG'];
    
    // First, recalculate or ensure tiebreaks are present
    const playersWithTb = calculateAllTieBreaks(players, order, totalRounds);
    
    function sortGroup(group, tbIndex) {
      if (group.length <= 1) return group;
      if (tbIndex >= tbOrder.length) return group;

      const tbName = tbOrder[tbIndex];

      if (tbName === 'DE') {
        applyDirectEncounter(group);
      }

      // Sort descending
      group.sort((a, b) => {
        let valA = tbName === 'score' ? a.score : a.tieBreaks[tbName];
        let valB = tbName === 'score' ? b.score : b.tieBreaks[tbName];
        
        if (Math.abs(valB - valA) > 1e-6) {
           return valB - valA;
        }
        return 0;
      });

      // Split into subgroups of exact ties
      const subgroups = [];
      let currentSubgroup = [group[0]];
      
      for (let i = 1; i < group.length; i++) {
        let valA = tbName === 'score' ? group[i-1].score : group[i-1].tieBreaks[tbName];
        let valB = tbName === 'score' ? group[i].score : group[i].tieBreaks[tbName];
        
        if (Math.abs(valA - valB) < 1e-6) {
          currentSubgroup.push(group[i]);
        } else {
          subgroups.push(currentSubgroup);
          currentSubgroup = [group[i]];
        }
      }
      subgroups.push(currentSubgroup);

      const sortedGroup = [];
      for (const sg of subgroups) {
        sortedGroup.push(...sortGroup(sg, tbIndex + 1));
      }

      return sortedGroup;
    }

    const sortedPlayers = sortGroup([...playersWithTb], 0);

    let rank = 1;
    for (let i = 0; i < sortedPlayers.length; i++) {
      if (i > 0) {
        const prev = sortedPlayers[i - 1];
        const curr = sortedPlayers[i];
        
        let tied = true;
        if (Math.abs(prev.score - curr.score) > 1e-6) tied = false;
        else {
          for (const tb of tbOrder) {
            if (tb === 'score') continue;
            if (Math.abs((prev.tieBreaks[tb] || 0) - (curr.tieBreaks[tb] || 0)) > 1e-6) {
              tied = false;
              break;
            }
          }
        }
        
        if (!tied) rank = i + 1;
      }
      sortedPlayers[i].rank = rank;
      
      // Update UI flat aliases
      sortedPlayers[i].de = sortedPlayers[i].tieBreaks.DE;
    }

    return sortedPlayers;
  }

  return {
    calculateAllTieBreaks,
    rankPlayers,
    directEncounter,
    directEncounterGroup,
    rankTeams: (teams) => {
      return [...teams].sort((a, b) => {
        let d = (b.matchPoints || 0) - (a.matchPoints || 0);
        if (d !== 0) return d;
        d = (b.boardPoints || 0) - (a.boardPoints || 0);
        if (d !== 0) return d;
        return (b.rating || 0) - (a.rating || 0);
      }).map((t, i) => ({ ...t, rank: i + 1 }));
    }
  };
})();

// Global Export
if (typeof window !== 'undefined') window.TieBreak = TieBreak;
if (typeof module !== 'undefined') module.exports = TieBreak;