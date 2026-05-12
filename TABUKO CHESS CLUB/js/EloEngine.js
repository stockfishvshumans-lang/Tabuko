// js/EloEngine.js — Dynamic Rating Evolution
const EloEngine = (() => {

  /**
   * processMatchResult: Updates Global Passport and Ratings.
   */
  async function processMatchResult(pId, oppId, score, tournamentId) {
    if (!pId || pId.toString().startsWith('temp_')) return;

    await db.runTransaction(async (transaction) => {
      const pRef = db.collection('members').doc(pId);
      const pDoc = await transaction.get(pRef);
      if (!pDoc.exists) return;

      const pData = pDoc.data();
      const oppDoc = await db.collection('members').doc(oppId).get();
      const oppRating = oppDoc.exists ? (oppDoc.data().ratings?.club || 1200) : 1200;

      const currentRating = pData.ratings?.club || 1200;
      const kFactor = (pData.passport?.tournamentsPlayed || 0) < 5 ? 40 : 20;
      
      const change = RatingSystem.calculateEloChange(currentRating, oppRating, score, kFactor);
      
      transaction.update(pRef, {
        'ratings.club': currentRating + change,
        'passport.tournamentsPlayed': (pData.passport?.tournamentsPlayed || 0) + 1,
        'metadata.lastMatch': Date.now()
      });
    });
  }

  return { processMatchResult };
})();

window.EloEngine = EloEngine;
