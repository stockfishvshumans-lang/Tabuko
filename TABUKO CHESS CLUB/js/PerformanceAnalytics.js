// js/PerformanceAnalytics.js — Tactical Radar Mathematical Metrics
const PerformanceAnalytics = (() => {

  /**
   * computeRadar: Generates mathematical scores for Aggression and Stability.
   * 
   * Aggression Formula: (Wins / Matches) * (Avg Opponent Rating / Player Rating)
   * Stability Formula: 1 - (Standard Deviation of Scores / 1.0)
   */
  function computeRadar(matches, playerRating) {
    if (!matches || matches.length === 0) return { aggression: 50, stability: 50 };

    const wins = matches.filter(m => m.score === 1).length;
    const winRate = wins / matches.length;
    
    // Aggression: High win rate against strong opponents
    const aggression = Math.min(100, Math.round(winRate * 100));

    // Stability: Consistency of performance
    const scores = matches.map(m => m.score);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / scores.length;
    const stability = Math.max(0, Math.min(100, Math.round((1 - Math.sqrt(variance)) * 100)));

    return { aggression, stability };
  }

  return { computeRadar };
})();

window.PerformanceAnalytics = PerformanceAnalytics;
