/**
 * IdentityResolution.js
 * Centralized identity mapping service for the Tabuko Tournament Engine.
 * Implements a 3-tier fail-safe resolution: Registry -> Tournament Roster -> Snapshot
 */
const IdentityResolution = (() => {
  
  /**
   * resolvePlayer: Returns the most accurate player name and rating.
   */
  async function resolvePlayer(tournamentId, teamId, pId, pName, boardNum, playerMap = null, teamObject = null) {
    const bNum = Number(boardNum);
    
    // Tier 1: Local or Global Registry (Direct ID Match)
    if (pId && !pId.toString().startsWith('temp_')) {
      // Check local tournament map first (Primary Authority)
      if (playerMap && playerMap[pId]) {
        return { 
          name: playerMap[pId].name, 
          rating: playerMap[pId].selectedRating || playerMap[pId].ratings?.club || playerMap[pId].rating || 1200 
        };
      }
      
      // Fallback: Global Registry (if db is available)
      try {
        const doc = await db.collection('members').doc(pId).get();
        if (doc.exists) {
          const d = doc.data();
          return { name: d.name, rating: d.ratings?.club || 1200 };
        }
      } catch (e) {}
    }

    // Tier 2: Team Roster (Lookup by Board Number or ID)
    let team = teamObject;
    if (!team && teamId && tournamentId) {
      try {
        const doc = await db.collection('tournaments').doc(tournamentId).collection('teams').doc(teamId).get();
        team = doc.exists ? doc.data() : null;
      } catch (e) { console.error("IdentityResolution: Team fetch failed", e); }
    }

    if (team && team.players) {
      // Find by ID, then by Board Number (normalize for both board and boardNumber keys)
      const p = team.players.find(x => 
        (pId && x.id === pId) || 
        (x.boardNumber == bNum) || 
        (x.board == bNum)
      );

      if (p && p.name && p.name.trim() !== '' && p.name.toLowerCase() !== 'vacant') {
        return { 
          name: p.name, 
          rating: parseInt(p.rating || p.selectedRating) || 0 
        };
      }
      
      // Fallback: If we have the team object but no specific board match, 
      // check if this board is within the team's registered size
      if (bNum <= team.players.length) {
         const bp = team.players[bNum - 1];
         if (bp && bp.name && bp.name.trim() !== '' && bp.name.toLowerCase() !== 'vacant') {
            return { name: bp.name, rating: parseInt(bp.rating || bp.selectedRating) || 0 };
         }
      }
    }

    // Tier 3: Snapshot Fallback (The pairing itself)
    return { 
      name: (pName && pName.toLowerCase() !== 'vacant' && pName.trim() !== '') ? pName : 'Vacant', 
      rating: 0 
    };
  }

  /**
   * resolveTeam: Returns the most accurate team name.
   */
  async function resolveTeam(tournamentId, teamId, snapshotName, teamMap = null) {
    if (teamId && teamMap && teamMap[teamId]) return teamMap[teamId].name;
    
    if (teamId) {
      const doc = await db.collection('tournaments').doc(tournamentId).collection('teams').doc(teamId).get();
      if (doc.exists) return doc.data().name;
    }

    return snapshotName || 'Unknown Team';
  }

  return { resolvePlayer, resolveTeam };
})();

window.IdentityResolution = IdentityResolution;
