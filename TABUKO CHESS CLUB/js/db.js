/**
 * db.js — Firestore Database Operations
 * CRUD operations for all collections with real-time listeners.
 */
const DB = (() => {

  // ── CLUB MEMBERS (New Permanent Profiles) ──
  /**
   * createClubMember: Automates the creation of a full digital member profile.
   * Merges raw UI input with a strict "Starter Pack" schema.
   */
  async function createClubMember(rawFormData) {
    const ref = db.collection('members').doc();
    const id = ref.id;

    const member = {
      id: id,
      name: rawFormData.name || 'Unknown',
      fideId: rawFormData.fideId || null,
      ratings: {
        club: 1200,
        fide: parseInt(rawFormData.fideRating) || 0,
        national: 0
      },
      status: 'active',
      isMember: true,
      isArchived: false,
      tournamentsPlayed: 0,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    await ref.set(member);
    console.log('[DB] Digital Profile Initialized:', id);
    return member;
  }

  async function getClubMember(id) {
    const doc = await db.collection('members').doc(id).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : null;
  }

  // ── PLAYERS (Legacy / Tournament Context) ──
  async function createPlayer(data) {
    const ref = db.collection('players').doc();
    const player = sanitizeForFirestore({
      id: ref.id, name: data.name,
      ratings: { fide: data.fideRating || null, ncfp: data.ncfpRating || null, club: data.clubRating || null },
      estimatedRating: data.estimatedRating || null,
      isArchived: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      ...data, id: ref.id
    });
    await ref.set(player);
    return player;
  }

  async function getPlayer(id) {
    const doc = await db.collection('players').doc(id).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : null;
  }

  /**
   * Fetch all active players on the 30-Day Radar, but cross-reference
   * the Club Roster to ensure the MEMBER tag is 100% accurate.
   */
  async function getAllPlayers() {
    try {
      // 1. Fetch the Active 30-Day Radar (The Registry)
      const registrySnap = await db.collection('playerRegistry').get();
      const activePlayers = registrySnap.docs.map(d => d.data());

      // 2. Fetch the VIP Vault (Official Club Roster)
      const membersSnap = await db.collection('members').get();
      const officialMemberIds = new Set(membersSnap.docs.map(d => d.id));

      // 3. Cross-Reference & Enforce the Truth
      // If their ID is in the VIP Vault, they are a MEMBER, regardless of what the radar originally said.
      return activePlayers.map(p => ({
        ...p,
        isMember: officialMemberIds.has(p.id)
      })).sort((a, b) => a.name.localeCompare(b.name));

    } catch (err) {
      console.error("[DB] Error fetching players:", err);
      return [];
    }
  }

  /**
   * ── LIFETIME MATCH HISTORY ENGINE ──
   * Sweeps a completed tournament and permanently archives every match 
   * so it can be queried instantly for Head-to-Head records.
   */
  /**
   * buildTournamentMatchHistory: The Enterprise Idempotent Engine.
   * Uses an atomic lock to prevent race conditions and parallelized batches for speed.
   */
  /**
   * buildTournamentMatchHistory: Universal Archival Engine.
   * Supports Individual Swiss, Round Robin, and Team Matches.
   */
  async function buildTournamentMatchHistory(tournamentId) {
    const tRef = db.collection('tournaments').doc(tournamentId);

    const shouldAbort = await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(tRef);
      const status = doc.data().isArchived;
      if (status === true || status === 'processing') return true;
      transaction.update(tRef, { isArchived: 'processing' });
      return false;
    });

    if (shouldAbort) return;

    try {
      const tDoc = await tRef.get();
      const tData = tDoc.data();
      const roundsSnap = await tRef.collection('rounds').get();

      const batches = [db.batch()];
      let bIdx = 0, writeCount = 0;

      const dateStamp = tData.completedAt || tData.createdAt || firebase.firestore.FieldValue.serverTimestamp();
      const baseData = {
        tournamentId, tournamentName: tData.name,
        tournamentDate: dateStamp, timestamp: dateStamp
      };

      const pushMatch = (p, rdNum) => {
        if (!p.result || p.isBye) return;
        const wRef = db.collection('match_history').doc();
        const bRef = db.collection('match_history').doc();

        batches[bIdx].set(wRef, { ...baseData, round: rdNum, ownerId: p.whiteId, opponentId: p.blackId, opponentName: p.blackName, color: 'White', result: p.result });
        batches[bIdx].set(bRef, { ...baseData, round: rdNum, ownerId: p.blackId, opponentId: p.whiteId, opponentName: p.whiteName, color: 'Black', result: p.result });

        writeCount += 2;
        if (writeCount % 400 === 0) { batches.push(db.batch()); bIdx++; }
      };

      roundsSnap.docs.forEach(doc => {
        const rd = doc.data();
        // 1. Handle Individual Pairings
        if (rd.pairings) {
          rd.pairings.forEach(p => pushMatch(p, rd.roundNumber));
        }
        // 2. Handle Team Matches (Nested Boards)
        const teamMatches = rd.teamMatches || rd.matches || [];
        teamMatches.forEach(tm => {
          (tm.boards || []).forEach(b => pushMatch(b, rd.roundNumber));
        });
      });

      await Promise.all(batches.map(b => b.commit()));
      await tRef.update({ isArchived: true });
      console.log(`[History] Archived ${writeCount} records for ${tData.name}`);

    } catch (err) {
      console.error('[History] Archive Error:', err);
      await tRef.update({ isArchived: false });
      throw err;
    }
  }

  /**
   * syncAllFinishedTournaments: The "One-Click" Database Recovery Tool.
   * Scans all 'completed' tournaments and forces them through the history engine.
   */
  async function syncAllFinishedTournaments() {
    console.log('[Sync] Scanning for unarchived completed tournaments...');
    const snap = await db.collection('tournaments')
      .where('status', '==', 'completed')
      .get();

    let count = 0;
    for (const doc of snap.docs) {
      if (!doc.data().isArchived) {
        await buildTournamentMatchHistory(doc.id);
        count++;
      }
    }
    console.log(`[Sync] Successfully synced ${count} tournaments to Match History.`);
    return count;
  }

  async function getFullMemberHistory(memberId) {
    if (!memberId) return [];
    try {
      // Use the correct collection 'match_history' and field 'ownerId'
      const snap = await db.collection('match_history')
        .where('ownerId', '==', memberId)
        .orderBy('timestamp', 'desc')
        .get();

      if (snap.empty) return [];

      return snap.docs.map(doc => {
        const data = doc.data();
        const isWhite = data.color === 'White';

        // Robust Result Parsing
        let resStr = data.result || 'Pending';
        let status = 'pending';

        if (typeof data.result === 'object' && data.result !== null) {
          resStr = `${data.result.whiteScore}-${data.result.blackScore}`;
          if (isWhite) {
            status = data.result.whiteScore > data.result.blackScore ? 'win' : (data.result.whiteScore < data.result.blackScore ? 'loss' : 'draw');
          } else {
            status = data.result.blackScore > data.result.whiteScore ? 'win' : (data.result.blackScore < data.result.whiteScore ? 'loss' : 'draw');
          }
        } else if (typeof resStr === 'string') {
          if (resStr.includes('1-0')) status = isWhite ? 'win' : 'loss';
          else if (resStr.includes('0-1')) status = isWhite ? 'loss' : 'win';
          else if (resStr.includes('0.5') || resStr.includes('1/2')) status = 'draw';
        }

        return {
          id: doc.id,
          date: data.timestamp ? new Date(data.timestamp.toDate()).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : 'Archive',
          tournamentName: data.tournamentName || 'Tournament',
          round: data.round || '-',
          color: (data.color || 'White').toLowerCase(),
          opponentName: data.opponentName || 'Unknown',
          resultStr: resStr,
          status: status, // 'win', 'loss', 'draw', 'pending'
          ratingChange: parseFloat(data.ratingChange) || 0
        };
      });
    } catch (err) {
      console.error('[DB] History Fetch Error:', err);
      return [];
    }
  }

  /**
   * ── FETCH PLAYER HISTORY ──
   * Used by the UI Member Portal to build the Head-to-Head analytics.
   */
  async function getPlayerHistory(playerId) {
    try {
      const snap = await db.collection('match_history')
        .where('ownerId', '==', playerId)
        .orderBy('timestamp', 'desc')
        .get();

      return snap.docs.map(doc => doc.data());
    } catch (err) {
      console.error("[DB] Failed to fetch history:", err);
      return [];
    }
  }

  async function updatePlayer(id, data) {
    await db.collection('players').doc(id).update(sanitizeForFirestore(data));
  }

  // ── TOURNAMENTS ──
  async function createTournament(data) {
    const ref = db.collection('tournaments').doc();
    const tournament = sanitizeForFirestore({
      id: ref.id, name: data.name, type: data.type || 'swiss',
      status: data.status || 'registration', // draft | registration_open | active | completed | archived
      currentRound: 0, totalRounds: data.totalRounds || 7,
      ratingType: data.ratingType || 'club',
      startDate: data.startDate || null,
      endDate: data.endDate || null,
      location: data.location || '',
      entryFee: data.entryFee || 0,
      maxPlayers: data.maxPlayers || 100,
      eventType: data.eventType || 'Standard Swiss',
      playerIds: [], teamIds: [],
      isArchived: false,
      createdBy: Auth.getUser()?.uid || null,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      ...data, id: ref.id
    });
    await ref.set(tournament);
    return tournament;
  }

  /**
   * Fetch all upcoming events for scheduling/registration.
   */
  async function fetchUpcomingEvents() {
    const snap = await db.collection('tournaments')
      .where('status', '==', 'registration_open')
      .orderBy('startDate', 'asc')
      .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  /**
   * Pre-register a player for an upcoming event.
   */
  async function registerForEvent(tournamentId, playerId) {
    const tRef = db.collection('tournaments').doc(tournamentId);

    return await db.runTransaction(async (transaction) => {
      const tDoc = await transaction.get(tRef);

      // >>> FIX: Check if tournament exists before reading data
      if (!tDoc.exists) throw new Error('Tournament not found');

      const tData = tDoc.data();

      const preregRef = tRef.collection('preregistered_players');
      const preregSnap = await transaction.get(preregRef);

      if (preregSnap.size >= (tData.maxPlayers || 100)) {
        throw new Error('Tournament Full');
      }

      // Check if already registered
      const existing = await transaction.get(preregRef.doc(playerId));
      if (existing.exists) throw new Error('Already registered');

      // Fetch player info for the RSVP record
      const playerSnap = await transaction.get(db.collection('members').doc(playerId));
      let player = playerSnap.data();
      if (!player) {
        const guestSnap = await transaction.get(db.collection('playerRegistry').doc(playerId));
        player = guestSnap.data();
      }

      if (!player) throw new Error('Player not found');

      transaction.set(preregRef.doc(playerId), {
        playerId,
        name: player.name,
        registrationDate: firebase.firestore.FieldValue.serverTimestamp()
      });
    });
  }

  /**
   * Convert RSVPs to Active Participants (Admin day-of-event logic)
   */
  async function convertRsvpToActive(tournamentId) {
    const tRef = db.collection('tournaments').doc(tournamentId);
    const preregSnap = await tRef.collection('preregistered_players').get();
    const players = preregSnap.docs.map(d => d.data());

    if (players.length === 0) throw new Error('No pre-registered players found.');

    const playerIds = players.map(p => p.playerId);

    await tRef.update({
      status: 'active',
      currentRound: 0,
      playerIds: playerIds
    });

    return players.length;
  }

  async function getTournament(id) {
    const doc = await db.collection('tournaments').doc(id).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : null;
  }

  async function getAllTournaments() {
    const snap = await db.collection('tournaments')
      .where('status', 'in', ['registration', 'active', 'completed', 'finished'])
      .where('isArchived', '!=', true)
      .get();

    // Sort manually as Firestore != query prevents simple orderBy on createdAt
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  }

  async function updateTournament(id, data) {
    await db.collection('tournaments').doc(id).update(sanitizeForFirestore(data));
  }

  async function registerPlayerToTournament(tournamentId, playerId) {
    await db.collection('tournaments').doc(tournamentId).update({
      playerIds: firebase.firestore.FieldValue.arrayUnion(playerId)
    });
  }

  /**
   * MID-TOURNAMENT ADJUSTMENT: Safely increases total rounds.
   */
  async function addTournamentRound(tournamentId, additionalRounds = 1) {
    const ref = db.collection('tournaments').doc(tournamentId);
    const snap = await ref.get();
    const data = snap.data();

    const updates = {
      totalRounds: firebase.firestore.FieldValue.increment(additionalRounds)
    };

    // If the tournament was already completed, re-open it for the new rounds
    if (data.status === 'completed') {
      updates.status = 'active';
      updates.isArchived = false;
    }

    await ref.update(updates);
  }

  /**
   * FIDE-COMPLIANT LATE ENTRY: Mathematical injection for missed rounds.
   */
  async function processLateEntry(tournamentId, playerId, currentRound, missedRoundScore = 0) {
    const tRef = db.collection('tournaments').doc(tournamentId);
    return await db.runTransaction(async (transaction) => {
      const tDoc = await transaction.get(tRef);
      if (!tDoc.exists) throw new Error('Tournament not found');
      const tData = tDoc.data();

      // 1. Add to tournament roster
      transaction.update(tRef, {
        playerIds: firebase.firestore.FieldValue.arrayUnion(playerId)
      });

      // 2. Resolve Player Source
      let playerSnap = await transaction.get(db.collection('members').doc(playerId));
      let pData = playerSnap.data();
      if (!pData) {
        playerSnap = await transaction.get(db.collection('playerRegistry').doc(playerId));
        pData = playerSnap.data();
      }
      if (!pData) throw new Error('Player not found in club registry');

      // 3. Inject Virtual Missed Rounds (FIDE-Compliant)
      const results = [];
      const score = parseFloat(missedRoundScore);
      for (let i = 1; i < currentRound; i++) {
        results.push({
          round: i,
          opponentId: null,
          result: score,
          isBye: true,
          color: null,
          isLateEntry: true
        });
      }

      const tpRef = tRef.collection('playerData').doc(playerId);
      transaction.set(tpRef, {
        id: playerId,
        name: pData.name,
        title: pData.title || '',
        selectedRating: pData.ratings?.[tData.ratingType || 'club'] || pData.ratings?.club || 1200,
        score: results.reduce((sum, res) => sum + res.result, 0),
        results,
        withdrawn: false,
        joinedRound: currentRound,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    });
    await DB.refreshRosterHash(tournamentId);
  }

  /**
   * FIDE-COMPLIANT DATA MASKING: Toggle withdrawal status.
   */
  async function togglePlayerWithdrawal(tournamentId, playerId, isWithdrawn) {
    const tpRef = db.collection('tournaments').doc(tournamentId).collection('playerData').doc(playerId);
    await tpRef.update({
      withdrawn: isWithdrawn,
      withdrawnAt: isWithdrawn ? firebase.firestore.FieldValue.serverTimestamp() : null
    });
  }

  // ── ROUNDS ──
  async function createRound(tournamentId, roundNumber, pairingsData, byeData) {
    const ref = db.collection('tournaments').doc(tournamentId).collection('rounds').doc(`round_${roundNumber}`);
    const round = {
      roundNumber, status: 'active',
      pairings: pairingsData.map((p, i) => ({
        board: p.board || i + 1,
        whiteId: p.white?.id || p.whiteId,
        blackId: p.black?.id || p.blackId,
        whiteName: p.white?.name || p.whiteName || '',
        blackName: p.black?.name || p.blackName || '',
        result: null // { whiteScore, blackScore }
      })),
      bye: byeData ? { playerId: byeData.id || byeData.playerId, playerName: byeData.name || byeData.playerName } : null,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    await ref.set(round);
    return round;
  }

  async function getRound(tournamentId, roundNumber) {
    const doc = await db.collection('tournaments').doc(tournamentId).collection('rounds').doc(`round_${roundNumber}`).get();
    return doc.exists ? doc.data() : null;
  }

  async function updateRoundStatus(tournamentId, roundNumber, status) {
    const validStates = ['pending', 'active', 'completed', 'locked'];
    if (!validStates.includes(status)) throw new Error('Invalid round state');
    await db.collection('tournaments').doc(tournamentId).collection('rounds').doc(`round_${roundNumber}`).update({ status });
  }

  /**
   * Submit match result using a transaction to prevent race conditions.
   * Ensures that multiple arbiters updating different boards concurrently
   * do not overwrite each other's data.
   */
  async function submitResult(tournamentId, roundNumber, board, whiteScore, blackScore, isForfeit = false, pgn = null) {
    const roundRef = db.collection('tournaments').doc(tournamentId).collection('rounds').doc(`round_${roundNumber}`);

    await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(roundRef);
      if (!doc.exists) throw new Error('Round not found');

      const data = doc.data();
      const pairingIndex = data.pairings.findIndex(p => p.board === board);
      if (pairingIndex === -1) throw new Error(`Board ${board} not found in Round ${roundNumber}`);

      // Update the pairing with result and optional PGN
      data.pairings[pairingIndex].result = { whiteScore, blackScore, isForfeit };
      if (pgn) data.pairings[pairingIndex].pgn = pgn;

      transaction.update(roundRef, { pairings: data.pairings });
    });

    // Standings calculation decoupled from real-time submission to improve performance.
    // Use Tournament.finalizeRound() to trigger official FIDE tie-break updates.
  }

  async function saveMatchResult(tournamentId, roundNumber, board, whiteScore, blackScore, pgn = null) {
    // Basic validation
    const valid = [0, 0.5, 1];
    if (!valid.includes(whiteScore) || !valid.includes(blackScore)) {
      throw new Error('Invalid scores. Must be 0, 0.5, or 1');
    }

    return await submitResult(tournamentId, roundNumber, board, whiteScore, blackScore, false, pgn);
  }

  /**
   * PLAYER REGISTRY TRACKER
   * Upserts a player into the active registry pool when they join a tournament.
   * If they are inactive for 30 days, they get purged from here (but NOT from the Club Roster).
   */
  async function updateRegistryActivity(player) {
    if (!player.id) return;

    const ref = db.collection('playerRegistry').doc(player.id);
    await ref.set({
      id: player.id,
      name: player.name || 'Unknown',
      ratings: player.ratings || { club: 1200 },
      isMember: player.isMember === true, // Strict boolean check
      lastActiveDate: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }

  /**
   * saveTeamMatchResult: Atomic Transaction with ServerTimestamp fix
   */
  async function saveTeamMatchResult(tournamentId, roundNum, matchNumber, boardResults, team1BP, team2BP) {
    const roundRef = db.collection('tournaments').doc(tournamentId).collection('rounds').doc(`round_${roundNum}`);

    await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(roundRef);
      if (!doc.exists) throw new Error(`Round document not found.`);

      const data = doc.data();
      const matchField = data.teamMatches ? 'teamMatches' : 'matches';
      const matches = data[matchField] || [];

      const mIdx = matches.findIndex(m => String(m.matchNumber) === String(matchNumber));
      if (mIdx === -1) throw new Error('Match not found.');

      // Prepare updated nested boards without illegal timestamps
      const targetMatch = matches[mIdx];
      const updatedBoards = (targetMatch.boards || []).map(orig => {
        const entry = boardResults.find(r => r.boardNum === orig.boardNumber);
        if (!entry) return orig;

        const res = entry.result;
        let w = 0, b = 0;
        if (res === '1-0' || res === '1-0F') w = 1;
        else if (res === '0-1' || res === '0-1F') b = 1;
        else if (res === '0.5-0.5') { w = 0.5; b = 0.5; }
        else if (res === '0-0F') { w = 0; b = 0; }

        return {
          ...orig,
          result: { whiteScore: w, blackScore: b, isForfeit: res.includes('F') },
          rawResult: res
        };
      });

      // MATCH POINT RULE: Win = 2, Draw = 1, Loss = 0
      const homeMP = team1BP > team2BP ? 2 : (team1BP === team2BP ? 1 : 0);
      const awayMP = team2BP > team1BP ? 2 : (team2BP === team1BP ? 1 : 0);

      matches[mIdx] = {
        ...targetMatch,
        team1BP: team1BP,
        team2BP: team2BP,
        homeMP: homeMP,
        awayMP: awayMP,
        isResolved: true,
        boards: updatedBoards,
        lastModified: Date.now()
      };

      // Apply the server timestamp to the PARENT document, not inside the array
      transaction.update(roundRef, {
        [matchField]: matches,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    });

    // Standings calculation decoupled from real-time submission to improve performance.
    // Use Tournament.finalizeRound() to trigger official FIDE tie-break updates.
  }

  /**
   * Deep cleans an object for Firestore by converting 'undefined' to 'null'
   * and ensuring numeric consistency.
   */
  function sanitizeForFirestore(obj) {
    if (obj === null || typeof obj !== 'object') {
      return obj === undefined ? null : obj;
    }

    // 🔥 FIREBASE GUARD CLAUSE: Prevent destruction of special Firestore prototypes
    if (obj instanceof firebase.firestore.FieldValue ||
      obj instanceof firebase.firestore.Timestamp ||
      (obj.constructor && obj.constructor.name === 'FieldValue')) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(v => sanitizeForFirestore(v));
    }

    const clean = {};
    for (const key in obj) {
      const val = obj[key];
      if (typeof val === 'number') {
        clean[key] = isNaN(val) ? 0 : val;
      } else if (val === undefined) {
        clean[key] = null;
      } else if (val && typeof val === 'object') {
        clean[key] = sanitizeForFirestore(val);
      } else {
        clean[key] = val;
      }
    }
    return clean;
  }

  // ── STANDINGS CACHE ──
  async function saveStandingsCache(tournamentId, standingsData) {
    const cleanData = sanitizeForFirestore(standingsData);
    // FIX: Firestore .set() requires an object. Wrapping the array payload.
    await db.collection('tournaments').doc(tournamentId).collection('standings_cache').doc('current').set({
      data: cleanData,
      updatedAt: new Date().toISOString()
    });
  }

  async function getStandingsCache(tournamentId) {
    const doc = await db.collection('tournaments').doc(tournamentId).collection('standings_cache').doc('current').get();
    // FIX: Accessing the .data property of the wrapper object
    return doc.exists ? doc.data().data : null;
  }

  // ── TEAMS ──
  /**
   * createTeam: Add a new team document to the tournament subcollection.
   * @param {string} tournamentId
   * @param {object} teamData { name, playerIds, avgRating }
   */
  async function createTeam(tournamentId, teamData) {
    const ref = db.collection('tournaments').doc(tournamentId).collection('teams').doc();
    const team = sanitizeForFirestore({
      id: ref.id,
      name: teamData.name,
      playerIds: teamData.playerIds || [],
      players: teamData.players || [], // [{id, name, boardNumber}]
      avgRating: teamData.avgRating || 0,
      mp: 0,
      bp: 0,
      tiebreaks: { tb: 0, tsb: 0 },
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await ref.set(team);
    return team;
  }

  /**
   * getTournamentTeams: Fetch all teams for a specific tournament from subcollection.
   * @param {string} tournamentId 
   */
  async function getTournamentTeams(tournamentId) {
    const snap = await db.collection('tournaments').doc(tournamentId).collection('teams').get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  /**
   * getTournamentPlayers: Fetch all player documents from the tournament's playerData subcollection.
   * @param {string} tournamentId 
   */
  async function getTournamentPlayers(tournamentId) {
    const snap = await db.collection('tournaments').doc(tournamentId).collection('playerData').get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  /**
   * getTeam: Fetch a specific team document from a tournament's subcollection.
   * @param {string} tournamentId - Required context for subcollection targeting.
   * @param {string} teamId - The specific team document ID.
   */
  async function getTeam(tournamentId, teamId) {
    if (!tournamentId || !teamId) return null;
    try {
      const doc = await db.collection('tournaments').doc(tournamentId).collection('teams').doc(teamId).get();
      return doc.exists ? { id: doc.id, ...doc.data() } : null;
    } catch (err) {
      console.error(`[DB] getTeam Error:`, err);
      return null;
    }
  }

  /**
   * updateTeam: Update team metadata (name, roster) in the nested subcollection.
   */
  async function updateTeam(tournamentId, teamId, data) {
    if (!tournamentId || !teamId) throw new Error("Missing Tournament or Team ID");
    try {
      await db.collection('tournaments').doc(tournamentId).collection('teams').doc(teamId).update(data);
      return true;
    } catch (err) {
      console.error(`[DB] updateTeam Error:`, err);
      throw err;
    }
  }

  async function getAllTeams(tournamentId) {
    return getTournamentTeams(tournamentId);
  }

  // ── DELETION (Soft) ──
  async function deleteTournament(id) {
    await db.collection('tournaments').doc(id).update({
      isArchived: true,
      deletedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  async function archivePlayer(id) {
    await db.collection('players').doc(id).update({
      isArchived: true,
      deletedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  // ── REAL-TIME LISTENERS ──
  function listenTournament(id, callback) {
    return db.collection('tournaments').doc(id).onSnapshot(doc => {
      callback(doc.exists ? { id: doc.id, ...doc.data() } : null);
    });
  }

  function listenStandings(tournamentId, callback) {
    return db.collection('tournaments').doc(tournamentId).collection('standings_cache').doc('current')
      .onSnapshot(doc => { callback(doc.exists ? doc.data() : null); });
  }

  function listenRound(tournamentId, roundNumber, callback) {
    return db.collection('tournaments').doc(tournamentId).collection('rounds').doc(`round_${roundNumber}`)
      .onSnapshot(doc => { callback(doc.exists ? doc.data() : null); });
  }

  function listenTournamentPlayers(tournamentId, callback) {
    return db.collection('tournaments').doc(tournamentId).collection('playerData')
      .onSnapshot(snap => {
        callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });
  }

  function listenMembers(callback) {
    return db.collection('members').where('status', '==', 'active').where('isArchived', '!=', true).orderBy('name')
      .onSnapshot(snap => {
        callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });
  }

  /**
   * AGGREGATE PLAYER HISTORY: Fetches all career matches for a player.
   * Scans all tournaments where the player participated and extracts matches
   * dynamically to avoid 1MB document limits on a single profile document.
   */
  async function getPlayerHistory(memberId) {
    try {
      if (!memberId) return [];

      // Query tournaments where the player was registered
      const q = db.collection('tournaments').where('playerIds', 'array-contains', memberId);
      const tournamentsSnap = await q.get({ source: 'server' });

      if (tournamentsSnap.empty) return [];

      const tournaments = tournamentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const history = [];

      for (const t of tournaments) {
        if (!Array.isArray(t.playerIds)) continue;

        // Fetch all rounds for this specific tournament
        const roundsSnap = await db.collection('tournaments').doc(t.id).collection('rounds').get({ source: 'server' });
        const rounds = roundsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        for (const rd of rounds) {
          if (rd.isTeamRound) {
            for (const match of (rd.matches || [])) {
              for (const b of (match.boards || [])) {
                if (b.whiteId === memberId || b.blackId === memberId) {
                  const isWhite = b.whiteId === memberId;
                  history.push({
                    tournamentName: t.name,
                    tournamentDate: t.createdAt,
                    round: rd.roundNumber,
                    color: isWhite ? 'White' : 'Black',
                    opponentName: isWhite ? b.blackName : b.whiteName,
                    result: b.result ? `${b.result.whiteScore}-${b.result.blackScore}` : 'Pending'
                  });
                }
              }
            }
          } else {
            // Check individual pairings
            const p = (rd.pairings || []).find(p => p.whiteId === memberId || p.blackId === memberId);
            if (p) {
              const isWhite = p.whiteId === memberId;
              history.push({
                tournamentName: t.name,
                tournamentDate: t.createdAt,
                round: rd.roundNumber,
                color: isWhite ? 'White' : 'Black',
                opponentName: isWhite ? p.blackName : p.whiteName,
                result: p.result ? `${p.result.whiteScore}-${p.result.blackScore}` : 'Pending'
              });
            }
          }
          // Handle Byes
          if (rd.bye && (rd.bye.playerId === memberId || rd.bye.id === memberId)) {
            history.push({
              tournamentName: t.name,
              tournamentDate: t.createdAt,
              round: rd.roundNumber,
              color: '-',
              opponentName: 'BYE',
              result: '1-0'
            });
          }
        }
      }

      // Sort results explicitly by date and round descending
      return history.sort((a, b) => {
        const timeA = a.tournamentDate?.toMillis ? a.tournamentDate.toMillis() : 0;
        const timeB = b.tournamentDate?.toMillis ? b.tournamentDate.toMillis() : 0;
        if (timeA !== timeB) return timeB - timeA;
        return b.round - a.round;
      });
    } catch (err) {
      console.error('[DB] getPlayerHistory fatal error:', err);
      return [];
    }
  }

  /**
   * DATABASE SANITIZER (Admin Only)
   * Fixes malformed playerIds to prevent IndexedDB crashes.
   * Run via console: await DB.sanitizeAllTournaments();
   */
  async function sanitizeAllTournaments() {
    console.log('[Sanitizer] Starting deep scan of all tournaments...');
    const snap = await db.collection('tournaments').get();
    const batch = db.batch();
    let fixCount = 0;

    snap.docs.forEach(doc => {
      const data = doc.data();
      if (!Array.isArray(data.playerIds)) {
        console.warn(`[Sanitizer] Fixing malformed playerIds in tournament: ${doc.id}`);
        batch.update(doc.ref, { playerIds: [] });
        fixCount++;
      }
    });

    if (fixCount > 0) {
      await batch.commit();
      console.log(`[Sanitizer] Successfully repaired ${fixCount} documents.`);
    } else {
      console.log('[Sanitizer] No malformed documents found. Database is clean.');
    }
    return fixCount;
  }

  /**
   * Fetch full career history. 
   * Upgraded to use the new 'match_history' engine for instant loading.
   */
  async function getFullMemberHistory(memberId) {
    if (!memberId) return [];

    try {
      // Point directly to our newly indexed, public collection
      const snap = await db.collection('match_history')
        .where('ownerId', '==', memberId)
        .orderBy('timestamp', 'desc')
        .get();

      if (!snap.empty) {
        return snap.docs.map(doc => doc.data());
      }

      return []; // Return empty if they haven't played since the update

    } catch (err) {
      console.error('[DB] getFullMemberHistory Error:', err);
      // Failsafe: Return empty array instead of crashing the UI
      return [];
    }
  }

  /**
   * Fetch a specific member's digital profile from the official VIP Vault.
   */
  async function getClubMember(memberId) {
    if (!memberId) throw new Error("Missing member ID.");
    try {
      // FIX: Pointing to 'members' instead of 'club_members'
      const doc = await db.collection('members').doc(memberId).get();

      if (!doc.exists) {
        // Fallback: If they aren't an official member, check the active radar
        const radarDoc = await db.collection('playerRegistry').doc(memberId).get();
        if (radarDoc.exists) return { id: radarDoc.id, ...radarDoc.data() };
        throw new Error("Profile not found in database.");
      }

      return { id: doc.id, ...doc.data() };
    } catch (err) {
      console.error('[DB] getClubMember Hardened Error:', err);
      throw err;
    }
  }

  /**
   * checkDatabaseIntegrity: Self-healing mechanism for fresh databases.
   * Ensures a 'Sample Profile' exists to define the schema on first run.
   */
  async function checkDatabaseIntegrity() {
    try {
      const snap = await db.collection('members').limit(1).get();
      if (snap.empty) {
        console.log('[Integrity Guard] Database is blank. Injecting template profile...');
        await DB.createClubMember({
          name: 'Sample Profile',
          fideId: '000000',
          fideRating: 1200,
          title: 'Guest'
        });
        console.log('[Integrity Guard] Template profile successfully injected.');
      }
    } catch (err) {
      console.error('[Integrity Guard] Critical error checking database:', err);
    }
  }

  /**
   * updateTeam: Atomically update team metadata and roster in the nested subcollection.
   */
  async function updateTeam(tournamentId, teamId, data) {
    if (!tournamentId || !teamId) throw new Error("Missing Tournament or Team ID");
    try {
      await db.collection('tournaments').doc(tournamentId).collection('teams').doc(teamId).update(data);
      return true;
    } catch (err) {
      console.error(`[DB] updateTeam Error:`, err);
      throw err;
    }
  }

  async function refreshRosterHash(tournamentId) {
    const tRef = db.collection('tournaments').doc(tournamentId);
    const snap = await tRef.collection('playerData').get();
    const ids = snap.docs.map(d => d.id).sort().join('|');
    let hash = 0;
    for (let i = 0; i < ids.length; i++) {
      hash = ((hash << 5) - hash) + ids.charCodeAt(i);
      hash |= 0;
    }
    const hashStr = Math.abs(hash).toString(16);
    await tRef.update({ rosterHash: hashStr });
    return hashStr;
  }

  return {
    checkDatabaseIntegrity, getClubMember,
    createClubMember, createPlayer, getPlayer, getAllPlayers, updatePlayer,
    createTournament, getTournament, getAllTournaments, updateTournament,
    fetchUpcomingEvents, registerForEvent, convertRsvpToActive,
    registerPlayerToTournament, togglePlayerWithdrawal, addTournamentRound, processLateEntry,
    createRound, getRound, updateRoundStatus, submitResult, saveMatchResult,
    saveStandingsCache, getStandingsCache,
    createTeam, getTeam, getTournamentTeams, getTournamentPlayers, getAllTeams, updateTeam,
    saveTeamMatchResult,
    aggregateMatchResult: saveTeamMatchResult,
    deleteTournament, archivePlayer, listenTournament, listenStandings,
    listenRound, listenTournamentPlayers, listenMembers, getPlayerHistory,
    getFullMemberHistory, sanitizeAllTournaments, syncAllFinishedTournaments,
    buildTournamentMatchHistory,
    updateRegistryActivity,
    refreshRosterHash
  };
})();

// Global Export
window.DB = DB;