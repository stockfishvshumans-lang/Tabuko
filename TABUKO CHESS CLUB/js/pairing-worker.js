/**
 * pairing-worker.js — Background Thread for FIDE Swiss & Team Pairing
 * Pillar 2: The Pairing Guardrail (Roster Integrity)
 */

// --- Deterministic Seeding Utility ---
const Seeder = {
  seed: 0,
  init(tournamentId, roundNumber, rosterHash = '') {
    let str = (tournamentId || 'tabuko') + roundNumber + rosterHash;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    this.seed = Math.abs(hash);
  },
  random() {
    this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
    return this.seed / 4294967296;
  }
};

/**
 * ROSTER HASH UTILITY
 */
function computeRosterHash(players) {
  if (!players) return '0';
  const ids = players.map(p => p.id).sort().join('|');
  let hash = 0;
  for (let i = 0; i < ids.length; i++) {
    hash = ((hash << 5) - hash) + ids.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}

self.onmessage = function (e) {
  const { type, payload } = e.data;
  
  // PILLAR 2: Roster-Sensitive Seeding
  const localHash = computeRosterHash(payload.players || payload.teams);
  Seeder.init(payload.config?.tournamentId, payload.roundNumber, localHash);

  try {
    if (payload.cloudRosterHash && localHash !== payload.cloudRosterHash) {
      throw new Error(`ROSTER_DESYNC: Local hash (${localHash}) != Cloud hash (${payload.cloudRosterHash}). Please sync roster first.`);
    }

    let result;
    if (type === 'GENERATE_SWISS') {
      // Try Strict Pairing
      result = SwissEngine.generatePairings(payload.players, payload.roundNumber, payload.config, false);
      
      // If failed and population is > 1, try Relaxed (allow repeats)
      if (result.pairings.length === 0 && payload.players.filter(p => !p.withdrawn).length > 1) {
        result = SwissEngine.generatePairings(payload.players, payload.roundNumber, payload.config, true);
      }
    } else if (type === 'GENERATE_TEAM') {
      // Try Strict Pairing
      result = TeamEngine.generateTeamPairings(payload.teams, payload.roundNumber, payload.config, false);

      // If failed and population is > 1, try Relaxed (allow repeats)
      if (result.pairings.length === 0 && payload.teams.filter(t => !t.withdrawn).length > 1) {
        result = TeamEngine.generateTeamPairings(payload.teams, payload.roundNumber, payload.config, true);
      }
    } else {
      throw new Error(`Unknown pairing type: ${type}`);
    }

    self.postMessage({ type: 'SUCCESS', result });
  } catch (err) {
    self.postMessage({ type: 'ERROR', error: err.message });
  }
};

/**
 * SWISS ENGINE
 */
const SwissEngine = (() => {
  let recursionCount = 0;
  const MAX_RECURSION = 5000;

  function generatePairings(players, round, config = {}, allowRepeats = false) {
    recursionCount = 0;
    const activePool = players.filter(p => !p.withdrawn);
    if (round === 1) return generateRound1(activePool, config.seedingStrategy);
    return generateSwiss(activePool, allowRepeats);
  }

  function generateRound1(players, strategy = 'top_vs_bottom') {
    const sorted = [...players].sort((a, b) =>
      (b.selectedRating || 0) - (a.selectedRating || 0) ||
      (a.name.localeCompare(b.name))
    );
    let pool = [...sorted];
    let bye = null;
    if (pool.length % 2 !== 0) bye = pool.pop();
    const half = pool.length / 2;
    const pairings = [];
    for (let i = 0; i < half; i++) {
      pairings.push(assignColors(pool[i], pool[half + i], i + 1));
    }
    return { pairings, bye };
  }

  function generateSwiss(players, allowRepeats = false) {
    const activePool = players.filter(p => !p.withdrawn);
    const sorted = [...activePool].sort((a, b) =>
      (b.score || 0) - (a.score || 0) ||
      (b.selectedRating || 0) - (a.selectedRating || 0) ||
      (a.name.localeCompare(b.name))
    );

    let pool = [...sorted];
    let bye = null;
    if (pool.length % 2 !== 0) {
      bye = selectByePlayer(pool);
      pool = pool.filter(p => p.id !== bye.id);
    }

    const brackets = groupByScore(pool);
    let pairings = [];
    let downFloaters = [];

    for (const bracket of brackets) {
      let candidates = [...downFloaters, ...bracket];
      candidates.sort((a, b) => (b.score - a.score) || (b.selectedRating - a.selectedRating) || (a.id.localeCompare(b.id)));
      const result = pairBracket(candidates, allowRepeats);
      pairings.push(...result.pairs);
      downFloaters = result.floaters;
    }

    if (downFloaters.length > 1) {
      for (let i = 0; i < downFloaters.length - 1; i += 2) {
        pairings.push(assignColors(downFloaters[i], downFloaters[i + 1], pairings.length + 1));
      }
    }

    pairings.forEach((p, i) => p.board = i + 1);
    return { pairings, bye };
  }

  function pairBracket(players, allowRepeats = false) {
    if (players.length < 2) return { pairs: [], floaters: players };
    const sorted = [...players].sort((a, b) =>
      (b.score - a.score) || (b.selectedRating - a.selectedRating) || (a.id.localeCompare(b.id))
    );
    const maxS1 = Math.floor(sorted.length / 2);
    for (let s1Size = maxS1; s1Size >= 1; s1Size--) {
      const match = backtrackPair(sorted.slice(0, s1Size), sorted.slice(s1Size), [], allowRepeats);
      if (match) {
        const pairedIds = new Set(match.flatMap(p => [p.p1.id, p.p2.id]));
        return {
          pairs: match.map(m => assignColors(m.p1, m.p2, 0)),
          floaters: sorted.filter(p => !pairedIds.has(p.id))
        };
      }
    }
    return { pairs: [], floaters: sorted };
  }

  function backtrackPair(S1, S2, currentPairs, allowRepeats = false) {
    recursionCount++;
    if (recursionCount > MAX_RECURSION) return null; // Graceful failure instead of throw
    if (S1.length === 0) return currentPairs;
    const p1 = S1[0];
    for (let i = 0; i < S2.length; i++) {
      if (canPair(p1, S2[i], allowRepeats)) {
        const result = backtrackPair(S1.slice(1), [...S2.slice(0, i), ...S2.slice(i + 1)], [...currentPairs, { p1, p2: S2[i] }], allowRepeats);
        if (result) return result;
      }
    }
    return null;
  }

  function canPair(p1, p2, allowRepeats = false) {
    if (!allowRepeats && (p1.opponents || []).includes(p2.id)) return false;
    const canP1W = checkColorConstraint(p1, 'white');
    const canP2B = checkColorConstraint(p2, 'black');
    const canP1B = checkColorConstraint(p1, 'black');
    const canP2W = checkColorConstraint(p2, 'white');
    return (canP1W && canP2B) || (canP1B && canP2W);
  }

  function checkColorConstraint(p, color) {
    const colors = p.colors || [];
    const diff = colors.reduce((acc, c) => acc + (c === 'white' ? 1 : -1), 0);
    if (color === 'white' && diff >= 2) return false;
    if (color === 'black' && diff <= -2) return false;
    const last2 = colors.slice(-2);
    return !(last2.length === 2 && last2[0] === color && last2[1] === color);
  }

  function getColorPreference(p) {
    const colors = p.colors || [];
    const last2 = colors.slice(-2);
    const diff = colors.reduce((acc, c) => acc + (c === 'white' ? 1 : -1), 0);
    if (last2.length === 2 && last2[0] === last2[1]) return { color: last2[0] === 'white' ? 'black' : 'white', must: true };
    if (Math.abs(diff) >= 2) return { color: diff > 0 ? 'black' : 'white', must: true };
    return { color: colors[colors.length - 1] === 'white' ? 'black' : 'white', must: false };
  }

  function assignColors(p1, p2, board) {
    const pref1 = getColorPreference(p1);
    const pref2 = getColorPreference(p2);
    if (pref1.must && pref1.color === 'white') return { white: p1, black: p2, board };
    if (pref2.must && pref2.color === 'white') return { white: p2, black: p1, board };
    if (pref1.color === 'white' && pref2.color === 'black') return { white: p1, black: p2, board };
    if (pref1.color === 'black' && pref2.color === 'white') return { white: p2, black: p1, board };
    return p1.id.localeCompare(p2.id) < 0 ? { white: p1, black: p2, board } : { white: p2, black: p1, board };
  }

  function selectByePlayer(players) {
    const eligible = players.filter(p => !p.hadBye).sort((a, b) => 
        (a.score - b.score) || (a.selectedRating - b.selectedRating) || (a.id.localeCompare(b.id))
    );
    return eligible[0] || players[players.length - 1];
  }

  function groupByScore(players) {
    const groups = [];
    let current = [];
    let lastScore = null;
    players.forEach(p => {
      if (p.score !== lastScore) {
        if (current.length) groups.push(current);
        current = [p]; lastScore = p.score;
      } else current.push(p);
    });
    if (current.length) groups.push(current);
    return groups;
  }

  return { generatePairings };
})();

/**
 * TEAM ENGINE
 */
const TeamEngine = (() => {
  function generateTeamPairings(teams, roundNumber, config = {}, allowRepeats = false) {
    const pool = teams.filter(t => !t.withdrawn).sort((a, b) => 
        (b.mp - a.mp) || (b.bp - a.bp) || (a.id.localeCompare(b.id))
    );
    let bye = null;
    if (pool.length % 2 !== 0) {
      const idx = pool.findIndex(t => !t.hadBye);
      bye = (idx !== -1) ? pool.splice(idx, 1)[0] : pool.pop();
    }
    const pairings = [];
    const pairedIds = new Set();
    function findPairings(index) {
      if (index >= pool.length) return true;
      if (pairedIds.has(pool[index].id)) return findPairings(index + 1);
      const teamA = pool[index];
      for (let j = index + 1; j < pool.length; j++) {
        const teamB = pool[j];
        if (!pairedIds.has(teamB.id) && (allowRepeats || !(teamA.opponents || []).includes(teamB.id))) {
          pairings.push(createTeamMatch(teamA, teamB, pairings.length + 1, roundNumber));
          pairedIds.add(teamA.id); pairedIds.add(teamB.id);
          if (findPairings(index + 1)) return true;
          pairings.pop(); pairedIds.delete(teamA.id); pairedIds.delete(teamB.id);
        }
      }
      return false;
    }
    findPairings(0);
    return { pairings, bye };
  }

  function createTeamMatch(teamA, teamB, matchNumber, roundNumber) {
    const isTeamAWhiteOnB1 = Seeder.random() > 0.5;
    const boards = [];
    const teamSize = teamA.playerIds?.length || 4;
    for (let i = 0; i < teamSize; i++) {
      const isWhite = (i % 2 === 0) ? isTeamAWhiteOnB1 : !isTeamAWhiteOnB1;
      boards.push({
        boardNumber: i + 1,
        whiteId: isWhite ? teamA.playerIds[i] : teamB.playerIds[i],
        blackId: isWhite ? teamB.playerIds[i] : teamA.playerIds[i],
        whiteName: isWhite ? (teamA.players?.[i]?.name || 'Vacant') : (teamB.players?.[i]?.name || 'Vacant'),
        blackName: isWhite ? (teamB.players?.[i]?.name || 'Vacant') : (teamA.players?.[i]?.name || 'Vacant'),
        result: null
      });
    }
    return { matchNumber, homeTeamId: teamA.id, awayTeamId: teamB.id, homeTeamName: teamA.name, awayTeamName: teamB.name, boards, isResolved: false };
  }

  return { generateTeamPairings };
})();
