/**
 * tv.js — Enterprise TV Broadcast Module
 * Features: Smart Grids, Living Leaderboards, and Team/Individual Dual-Mode
 */
const TV = (() => {
  let tournamentId = null;
  let standingsInitialized = false;

  // ── 1. INJECT BROADCAST STYLES (No CSS file needed) ──
  function injectTVStyles() {
    if (document.getElementById('tabuko-tv-styles')) return;
    const style = document.createElement('style');
    style.id = 'tabuko-tv-styles';
    style.innerHTML = `
      /* Smart Grid Pairings */
      .tv-pairing-row {
        display: flex;
        align-items: center;
        background: rgba(15, 23, 42, 0.8);
        border: 1px solid var(--border-color, #334155);
        border-radius: 8px;
        padding: 0 15px;
        color: #fff;
        font-weight: 700;
        box-shadow: 0 4px 6px rgba(0,0,0,0.3);
      }
      .tv-pairing-row .board { min-width: 40px; color: var(--accent-primary, #a855f7); font-weight: 900; }
      .tv-pairing-row .player { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .tv-pairing-row .white-player { text-align: right; padding-right: 15px; }
      .tv-pairing-row .black-player { text-align: left; padding-left: 15px; }
      .tv-pairing-row .score { 
        min-width: 80px; 
        text-align: center; 
        background: rgba(0,0,0,0.4); 
        padding: 5px 10px; 
        border-radius: 4px;
        color: var(--accent-success, #22c55e);
      }
      .tv-rtg { color: #64748b; font-size: 0.7em; margin: 0 5px; }
      
      /* Living Leaderboard (GPU Accelerated) */
      #standings-body { position: relative; height: 420px; width: 100%; overflow: hidden; }
      .living-row {
        position: absolute;
        width: 100%;
        height: 70px;
        display: flex;
        align-items: center;
        background: linear-gradient(90deg, rgba(30,41,59,0.9) 0%, rgba(15,23,42,0.9) 100%);
        border-left: 4px solid var(--accent-primary, #a855f7);
        border-radius: 6px;
        margin-bottom: 10px;
        padding: 0 20px;
        box-sizing: border-box;
        transition: transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
        color: white;
        font-size: 1.5rem;
        font-weight: 800;
      }
      .living-row .rank { width: 50px; color: var(--accent-primary, #a855f7); }
      .living-row .name { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .living-row .pts { width: 80px; text-align: right; color: var(--accent-success, #22c55e); font-size: 1.8rem; }
      
      /* Staggered Entrance Animation */
      @keyframes slideInRight {
        from { opacity: 0; transform: translateX(100px); }
        to { opacity: 1; transform: translateX(0); }
      }
      .stagger-1 { animation: slideInRight 0.5s ease forwards 0.1s; opacity: 0; }
      .stagger-2 { animation: slideInRight 0.5s ease forwards 0.2s; opacity: 0; }
      .stagger-3 { animation: slideInRight 0.5s ease forwards 0.3s; opacity: 0; }
      .stagger-4 { animation: slideInRight 0.5s ease forwards 0.4s; opacity: 0; }
      .stagger-5 { animation: slideInRight 0.5s ease forwards 0.5s; opacity: 0; }
      
      /* Pulse Indicator */
      .pulse-dot {
        height: 8px; width: 8px; background-color: #22c55e;
        border-radius: 50%; display: inline-block; margin-right: 8px;
        box-shadow: 0 0 0 0 rgba(34, 197, 144, 0.7);
        animation: pulse 2s infinite;
      }
      @keyframes pulse {
        0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(34, 197, 144, 0.7); }
        70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(34, 197, 144, 0); }
        100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(34, 197, 144, 0); }
      }
      #tv-sync-time {
        font-size: 0.75rem; color: #64748b; font-weight: 800;
        text-transform: uppercase; letter-spacing: 1px;
        display: flex; align-items: center;
      }
    `;
    document.head.appendChild(style);
  }

  // ── 2. INITIALIZATION & ROUTING ──
  async function init() {
    injectTVStyles();

    let id = window.location.hash.substring(1);
    if (!id) id = localStorage.getItem('tabuko_active_tv_id');

    tournamentId = id;

    if (tournamentId) {
      window.history.replaceState(null, null, '#' + tournamentId);
      loadBroadcast();
    } else {
      document.body.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #020617; color: #fff;">
          <h2 style="font-size: 2.5rem; margin-bottom: 10px;">Live Broadcast Setup</h2>
          <p style="color: #94a3b8; margin-bottom: 30px;">Enter Tournament ID to begin the live broadcast.</p>
          <div style="display: flex; gap: 10px; width: 100%; max-width: 400px;">
            <input type="text" id="manual-tv-id" placeholder="Tournament ID" style="flex: 1; padding: 12px; border-radius: 6px; background: #1e293b; color: white; border: 1px solid #334155;">
            <button class="btn btn-primary" onclick="window.location.hash = document.getElementById('manual-tv-id').value; window.location.reload();">Connect</button>
          </div>
        </div>
      `;
    }
  }

  let activeRoundListener = null;

  async function loadBroadcast() {
    try {
      // 1. Master Tournament Listener (Detects Round Changes, Status Changes, etc.)
      window.db.collection('tournaments').doc(tournamentId).onSnapshot(doc => {
        if (!doc.exists) {
          document.body.innerHTML = '<h1 style="color:white; text-align:center; margin-top: 20%;">Tournament Deleted or Offline</h1>';
          return;
        }

        const tData = doc.data();
        const currentRd = tData.currentRound || 0;

        // Update Header & UI Metadata
        const titleEl = document.getElementById('tv-tournament-name');
        if (titleEl) titleEl.innerText = tData.name;

        // Dynamic Round Switching: If the round advances, swap the pairing listener
        setupRoundListener(tournamentId, currentRd, tData.isTeamEvent);

        // Initial Standings Fetch
        if (!standingsInitialized) {
          updateStandings(tData);
          standingsInitialized = true;
        }

        updateSyncTime();
      });

      // 2. Continuous Clock (1s interval)
      setInterval(() => {
        const clockEl = document.getElementById('tv-clock');
        if (clockEl) {
          clockEl.innerText = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        }
      }, 1000);

      // 3. Resilience Heartbeat (Ensures the page stays "Alive" and doesn't sleep)
      setInterval(() => {
        console.log("💓 [TV] Heartbeat: Syncing broadcast state...");
        updateSyncTime();
      }, 60000);

    } catch (err) {
      console.error("[TV] Broadcast Error:", err);
    }
  }

  /**
   * setupRoundListener: Swaps the pairing data feed when the tournament round advances.
   */
  function setupRoundListener(tId, rdNum, isTeam) {
    // Prevent redundant listeners if we are already on this round
    const listenerKey = `round_${rdNum}`;
    if (window.currentActiveTvRound === listenerKey) return;
    window.currentActiveTvRound = listenerKey;

    // Unsubscribe from old round if it exists
    if (activeRoundListener) {
      console.log(`🔌 [TV] Disconnecting from Round Feed...`);
      activeRoundListener();
    }

    console.log(`📡 [TV] Connecting to Round ${rdNum} Feed...`);
    activeRoundListener = window.db.collection('tournaments').doc(tId)
      .collection('rounds').doc(`round_${rdNum}`)
      .onSnapshot(doc => {
        if (doc.exists) {
          updatePairings(doc.data(), isTeam);
          updateSyncTime();
        }
      });
  }

  function updateSyncTime() {
    const syncEl = document.getElementById('tv-sync-time');
    if (syncEl) {
      syncEl.innerHTML = `<span class="pulse-dot"></span> LIVE • SYNC: ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
  }

  // ── 3. SMART MULTI-COLUMN GRID (Pairings) ──
  function updatePairings(roundData, isTeamEvent) {
    const container = document.getElementById('tv-pairings') || document.getElementById('tv-pairings-list');
    if (!container) return;

    // Unify Team Matches vs Individual Pairings
    let matches = [];
    if (isTeamEvent && roundData.teamMatches) matches = roundData.teamMatches;
    else if (!isTeamEvent && roundData.pairings) matches = roundData.pairings;

    const totalBoards = matches.length + (roundData.bye ? 1 : 0);

    // SAFETY: Handle Empty/Corrupted Round Gracefully
    if (totalBoards === 0) {
      container.innerHTML = '<div style="color: #64748b; text-align: center; width: 100%; font-size: 2rem; margin-top: 50px;">Waiting for pairings...</div>';
      return;
    }

    // Mathematical Layout Engine
    let columns = 1;
    if (totalBoards > 12 && totalBoards <= 26) columns = 2;
    else if (totalBoards > 26) columns = 3;

    const rowsPerColumn = Math.ceil(totalBoards / columns);
    const dynamicHeight = `calc((75vh / ${rowsPerColumn}) - 10px)`;

    container.style.display = 'grid';
    container.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;
    container.style.gap = '15px';

    let html = matches.map(m => {
      if (isTeamEvent) {
        const score = m.isResolved ? `${m.team1BP ?? m.homeBoardPoints ?? 0} - ${m.team2BP ?? m.awayBoardPoints ?? 0}` : 'vs';
        return `
          <div class="tv-pairing-row" style="height: ${dynamicHeight}; font-size: clamp(14px, 2vh, 32px);">
            <div class="board">${m.matchNumber}</div>
            <div class="player white-player">${m.homeTeamName || 'Unknown'}</div>
            <div class="score" style="color: ${m.isResolved ? 'var(--accent-success)' : '#fff'};">${score}</div>
            <div class="player black-player">${m.awayTeamName || 'Unknown'}</div>
          </div>
        `;
      } else {
        const score = m.result ? `${m.result.whiteScore} - ${m.result.blackScore}` : 'vs';
        return `
          <div class="tv-pairing-row" style="height: ${dynamicHeight}; font-size: clamp(14px, 2vh, 32px);">
            <div class="board">${m.board}</div>
            <div class="player white-player">${m.whiteName} <span class="tv-rtg">${m.whiteRating || ''}</span></div>
            <div class="score" style="color: ${m.result ? 'var(--accent-success)' : '#fff'};">${score}</div>
            <div class="player black-player"><span class="tv-rtg">${m.blackRating || ''}</span> ${m.blackName}</div>
          </div>
        `;
      }
    }).join('');

    // Render BYE if it exists
    if (roundData.bye) {
      const byeName = isTeamEvent ? (roundData.bye.teamName || 'Unknown') : (roundData.bye.playerName || 'Unknown');
      html += `
        <div class="tv-pairing-row" style="height: ${dynamicHeight}; font-size: clamp(14px, 2vh, 32px); opacity: 0.7;">
          <div class="board">BYE</div>
          <div class="player white-player">${byeName}</div>
          <div class="score">1 - 0</div>
          <div class="player black-player" style="color: #64748b;">---</div>
        </div>
      `;
    }

    const newHtml = `
      <div id="${container.id}" class="${container.className}" style="${container.style.cssText}">
        ${html}
      </div>
    `;
    morphdom(container, newHtml);
  }

  // ── 4. LIVING LEADERBOARD (Top 5 GPU Accelerated) ──
  function updateStandings(tournament) {
    // Branch logic based on Team vs Individual
    if (tournament.isTeamEvent) {
      window.db.collection('tournaments').doc(tournamentId).collection('teams')
        .onSnapshot(snap => {
          let teams = snap.docs.map(d => d.data());
          // FIDE Sorting: MP -> BP -> TB -> TSB
          teams.sort((a, b) => (b.mp || 0) - (a.mp || 0) || (b.bp || 0) - (a.bp || 0) || (b.tb || 0) - (a.tb || 0));

          const mappedStandings = teams.map((t, i) => ({ id: t.id || t.teamId, rank: i + 1, name: t.name, score: t.mp }));
          renderLivingLeaderboard(mappedStandings.slice(0, 5));
        });
    } else {
      window.db.collection('tournaments').doc(tournamentId).collection('playerData')
        .onSnapshot(snap => {
          let players = snap.docs.map(d => d.data());
          players.sort((a, b) => (b.score || 0) - (a.score || 0));

          const mappedStandings = players.map((p, i) => ({ id: p.id, rank: i + 1, name: p.name, score: p.score }));
          renderLivingLeaderboard(mappedStandings.slice(0, 5));
        });
    }
  }

  function renderLivingLeaderboard(standings) {
    const body = document.getElementById('standings-body');
    if (!body) return;

    // 1. Build the entire leaderboard HTML atomically
    // This prevents 'piling' or partial rendering issues
    const leaderboardHtml = standings.map((player, index) => {
      const rank = index + 1;
      return `
        <div class="tv-standings-row fade-in">
          <div class="standings-rank">${rank}</div>
          <div class="standings-name">${player.name || 'Unknown Player'}</div>
          <div class="standings-pts">${parseFloat(player.score || 0).toFixed(1)}</div>
        </div>
      `;
    }).join('');

    // 2. Inject using morphdom for smooth transitions
    const newHtml = `<div id="standings-body">${leaderboardHtml}</div>`;
    morphdom(body, newHtml);
    standingsInitialized = true;
  }

  return { init };
})();

// Auto-Initialize on page load
document.addEventListener('DOMContentLoaded', TV.init);