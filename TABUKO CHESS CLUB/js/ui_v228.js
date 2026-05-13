/**
 * ui.js — Professional Admin UI Rendering
 * Handles the sidebar layout, navigation, and view rendering.
 */
const UI = (() => {
  let currentPlayers = [];
  let currentMatches = [];
  let tournamentUnsubscribe = []; // To prevent memory leaks on navigation
  const root = () => document.getElementById('app');
  let scrollRequest;
  let isScrolling = false;
  let lastTime;
  const SCROLL_SPEED = 40; // px/sec

  // ── CONSTANTS ──
  const TB_LABELS = {
    buchholzFull: 'Buchholz', buchholzCut1: 'Buch. C1', buchholzCut2: 'Buch. C2',
    buchholzMedian: 'Med. Buch.', sonnebornBerger: 'SB', wins: 'Wins',
    progressiveScore: 'Prog.', performanceRating: 'Perf.', koya: 'Koya',
    rating: 'Rtg', blackGames: 'Blk', directEncounter: 'DE'
  };

  const TB_ABBR = {
    buchholzFull: 'BH', buchholzCut1: 'BHC1', buchholzCut2: 'BHC2',
    buchholzMedian: 'BH-M', sonnebornBerger: 'SB', wins: 'WIN',
    progressiveScore: 'PROG', performanceRating: 'PRF', koya: 'KOYA',
    rating: 'RTG', blackGames: 'BLK', directEncounter: 'DE'
  };

  // ── CORE UTILS ──
  function showToast(msg, type = 'info') {
    const toast = document.createElement('div');
    toast.className = 'toast fade-in';
    toast.style.cssText = `position: fixed; bottom: 2rem; right: 2rem; padding: 1rem 1.5rem; border-radius: 0.5rem; background: ${type === 'error' ? 'var(--accent-danger)' : 'var(--accent-success)'}; color: white; font-weight: 700; box-shadow: var(--shadow-lg); z-index: 10000; transition: all 0.3s;`;
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(20px)';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  function printPairings() {
    document.body.classList.add('printing-pairings');
    window.print();
    document.body.classList.remove('printing-pairings');
  }

  function printStandings() {
    document.body.classList.add('printing-standings');
    window.print();
    document.body.classList.remove('printing-standings');
  }

  function showLoading() { document.getElementById('loading-overlay').classList.add('active'); }
  function hideLoading() { document.getElementById('loading-overlay').classList.remove('active'); }

  function setBtnState(id, isLoading, text) {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.disabled = isLoading;
    if (text) btn.textContent = text;
  }

  // ── LAYOUT WRAPPER ──
  window.activeListeners = window.activeListeners || [];

  function renderLayout(title, contentHtml, activeNav = 'dashboard') {
    // MEMORY LEAK CLEANUP
    if (window.activeListeners.length > 0) {
      window.activeListeners.forEach(unsub => { if (typeof unsub === 'function') unsub(); });
      window.activeListeners = [];
    }

    const user = Auth.getUserData();
    const isOnline = navigator.onLine;
    
    // Pillar 5: Tactical Amber Mode
    if (!isOnline) {
      document.body.classList.add('offline-tactical');
    } else {
      document.body.classList.remove('offline-tactical');
    }

    const navLinks = `
      <span class="nav-label">Management</span>
      <div class="nav-item ${activeNav === 'dashboard' ? 'active' : ''}" onclick="App.navigateTo('dashboard')">
        <span>📊</span> Dashboard
      </div>
      <div class="nav-item ${activeNav === 'roster' ? 'active' : ''}" onclick="App.navigateTo('roster')">
        <span>📋</span> Club Roster
      </div>
      <div class="nav-item ${activeNav === 'players' ? 'active' : ''}" onclick="App.navigateTo('players')">
        <span>👤</span> Players
      </div>
      <div class="nav-item ${activeNav === 'archive' ? 'active' : ''}" onclick="App.navigateTo('archive')">
        <span>🏛️</span> Archive Room
      </div>
      ${!Auth.isGuest() ? `
        <span class="nav-label" style="margin-top: 1.5rem;">Tournament</span>
        <div class="nav-item" onclick="UI.renderCreateTournament()">
          <span>➕</span> New Event
        </div>
      ` : ''}
    `;

    root().style.display = 'block';
    root().className = 'app-viewport';
    root().innerHTML = `
      <div id="scroll-progress-container"><div id="scroll-progress-bar"></div></div>
      <div class="app-layout-grid">
        <aside class="sidebar">
          <div class="sidebar-top">
            <div class="brand"><span class="brand-icon">♞</span> TABUKO</div>
            <div class="header-sub-brand">Console</div>
          </div>
          <nav class="sidebar-mid">${navLinks}</nav>
          <div class="sidebar-bottom" style="padding: 1.5rem; background: var(--bg-sidebar); border-top: 1px solid var(--border-color);">
            
            <!-- SMART STATUS & IDENTITY ROW -->
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem;">
              
              <!-- SMART STATUS ORB -->
              <div class="status-orb-wrap" style="position: relative; cursor: help;">
                <div id="system-status-orb" class="system-status-orb" style="width: 12px; height: 12px; border-radius: 50%; background: #475569; transition: 0.3s; box-shadow: 0 0 10px rgba(0,0,0,0.5);"></div>
                
                <!-- GLASSMORPHIC TOOLTIP -->
                <div id="status-tooltip" style="position: absolute; bottom: 30px; left: 0; background: rgba(30, 41, 59, 0.9); border: 1px solid rgba(255,255,255,0.1); padding: 0.75rem; border-radius: 12px; width: 220px; font-size: 0.7rem; backdrop-filter: blur(12px); visibility: hidden; opacity: 0; transition: 0.2s; z-index: 1000; box-shadow: var(--shadow-lg);">
                   <div style="font-weight: 800; color: #fff; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 1px;">System Health</div>
                   <div id="tooltip-sync-text" style="color: var(--text-secondary);">Initializing system...</div>
                   <div id="tooltip-auth-text" style="color: var(--accent-sapphire); margin-top: 2px;">Authority: Resolving...</div>
                </div>
              </div>

              <!-- LIVE BADGE & MONOGRAM MERGE -->
              <div style="display: flex; align-items: center; gap: 0.75rem;">
                <span id="live-indicator-mini" style="font-size: 0.6rem; font-weight: 900; color: var(--accent-success); border: 1px solid var(--accent-success); padding: 2px 6px; border-radius: 4px; letter-spacing: 1px; display: none;">LIVE</span>
                <div class="user-monogram-avatar" style="width: 28px; height: 28px; border-radius: 50%; background: var(--bg-tertiary); border: 1px solid var(--border-color); display: flex; align-items: center; justify-content: center; font-weight: 900; color: var(--accent-primary); font-size: 0.75rem;">
                   ${(user?.email || 'G').charAt(0).toUpperCase()}
                </div>
              </div>
            </div>

            <!-- USER PROFILE PILL -->
            <div class="user-profile-pill" style="margin-bottom: 1.25rem;">
              <div style="font-size: 0.85rem; font-weight: 700; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                ${Auth.isGuest() ? 'Guest Spectator' : (user?.email?.split('@')[0] || 'Arbiter')}
              </div>
              <div style="font-size: 0.65rem; font-weight: 600; color: var(--text-muted); text-transform: lowercase;">
                ${user?.email || 'unauthenticated session'}
              </div>
            </div>

            <div id="btn-signout" class="nav-item signout-item" onclick="Auth.signOut()" style="padding: 0.6rem; font-size: 0.75rem; justify-content: center; border-radius: 8px;">🚪 Sign Out</div>
            
            <style>
              .status-orb-wrap:hover #status-tooltip { visibility: visible; opacity: 1; bottom: 35px; }
              .orb-pulse-green { animation: orb-pulse 2s infinite; background: var(--accent-success) !important; box-shadow: 0 0 15px var(--accent-success) !important; }
              .orb-solid-amber { background: var(--accent-warning) !important; box-shadow: 0 0 10px var(--accent-warning) !important; }
              .orb-blink-red { animation: orb-blink 1s infinite; background: var(--accent-danger) !important; }
              @keyframes orb-pulse { 0% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(1.2); } 100% { opacity: 1; transform: scale(1); } }
              @keyframes orb-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
            </style>
          </div>
        </aside>

        <main class="main-viewport">
          <div class="content-viewport">
            ${contentHtml}
          </div>
        </main>
      </div>
      <button id="btn-back-to-top" onclick="window.scrollTo({top:0, behavior:'smooth'})">↑</button>
    `;
  }

  // ── AUTH PAGES ──
  function renderLogin() {
    root().style.display = 'block';
    root().innerHTML = `
      <div class="auth-gateway fade-in">
        <div class="auth-card">
          <!-- BRAND HEADER -->
          <div class="auth-header">
            <div class="auth-icon-wrap">
              <span class="auth-knight-symbol">♞</span>
            </div>
            <h2 class="auth-title">Tabuko Console</h2>
            <p class="auth-subtext">Secure Arbiter Access</p>
          </div>

          <!-- LOGIN FORM -->
          <form id="login-form" class="auth-form">
            <div class="form-group">
              <label class="auth-label">Admin Identity</label>
              <input type="email" id="login-email" class="auth-input" placeholder="name@tabuko.pro" required>
            </div>
            
            <div class="form-group">
              <label class="auth-label">Security Key</label>
              <input type="password" id="login-password" class="auth-input" placeholder="••••••••" required>
            </div>

            <div class="auth-actions">
              <button type="submit" class="btn btn-auth-primary">Initialize Session</button>
              <div class="auth-divider">
                <span>OR</span>
              </div>
              <button type="button" id="btn-guest-login" class="btn btn-auth-ghost">
                Continue as Guest Spectator →
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value;
      const pass = document.getElementById('login-password').value;
      try {
        showLoading();
        await Auth.signIn(email, pass);
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        hideLoading();
      }
    });

    document.getElementById('btn-guest-login').addEventListener('click', async () => {
      try {
        showLoading();
        await Auth.loginAsGuest();
        App.navigateTo('dashboard');
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        hideLoading();
      }
    });
  }

  // ── DASHBOARD ──
  function renderDashboard(tournaments) {
    const activeTournaments = tournaments.filter(t => t.status === 'active');
    const pendingTournaments = tournaments.filter(t => t.status === 'registration');
    const totalPlayers = tournaments.reduce((acc, t) => acc + (t.playerIds?.length || 0), 0);

    const content = `
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-label">Active Events</div>
          <div class="stat-value" style="color: var(--accent-primary);">${activeTournaments.length}</div>
          <p class="text-muted text-xs">Currently in progress</p>
        </div>
        <div class="stat-card">
          <div class="stat-label">Upcoming</div>
          <div class="stat-value" style="color: var(--accent-sapphire);">${pendingTournaments.length}</div>
          <p class="text-muted text-xs">In registration phase</p>
        </div>
        <div class="stat-card">
          <div class="stat-label">Total Participants</div>
          <div class="stat-value">${totalPlayers}</div>
          <p class="text-muted text-xs">Across all events</p>
        </div>
        <div class="stat-card">
          <div class="stat-label">System Health</div>
          <div id="dashboard-health-score" class="stat-value" style="font-size: 1.5rem; color: var(--accent-success);">100%</div>
          <p class="text-muted text-xs">Local vs Cloud Parity</p>
        </div>
      </div>

      <div class="card">
        <div class="flex justify-between items-center mb-6">
          <div>
            <h2 class="card-title" style="margin: 0;">Recent Tournaments</h2>
            <p class="text-muted text-sm">Manage and monitor live club events.</p>
          </div>
          ${!Auth.isGuest() ? '<button class="btn btn-primary" onclick="UI.renderCreateTournament()">+ CREATE TOURNAMENT</button>' : ''}
        </div>
        
        <div class="tournament-grid">
          ${tournaments.length === 0 ? `
            <div style="grid-column: 1 / -1; text-align:center; padding: 6rem; background: var(--bg-card); border-radius: 12px; border: 1px solid var(--border-color); color: var(--text-muted);">
              No active tournaments found. Initialize your first event to get started.
            </div>
          ` : tournaments.map(t => `
            <div class="tournament-card fade-in">
              <div class="card-status-flag ${t.status}">${t.status.toUpperCase()}</div>
              
              <div class="card-header-main">
                <h2 class="tournament-title">${t.name}</h2>
                <div class="card-badge-row">
                  <span class="badge-pill">${t.type?.toUpperCase() || 'SWISS'}</span>
                  <span class="badge-pill">RD ${t.currentRound || 0}/${t.totalRounds || 0}</span>
                  <span class="badge-pill">${t.ratingType?.toUpperCase()}</span>
                </div>
              </div>

              <div class="card-progress-zone">
                <div class="progress-labels">
                  <span>Tournament Completion</span>
                  <span class="tabular-data">${Math.round((t.currentRound / t.totalRounds) * 100) || 0}%</span>
                </div>
                <div class="progress-bar-bg">
                  <div class="progress-bar-fill" style="width: ${(t.currentRound / t.totalRounds) * 100}%"></div>
                </div>
              </div>

              <div class="card-footer-actions">
                <button class="btn btn-primary btn-manage" onclick="App.navigateTo('tournament', '${t.id}')">
                  ${(Auth.isGuest() || t.status === 'archived' || t.status === 'completed' || t.status === 'finished') ? 'View Archive' : 'Manage Event'}
                </button>
                ${!Auth.isGuest() ? `
                  <div class="admin-group">
                    <button class="btn btn-secondary-ghost" onclick="UI.renderEditTournamentModal('${t.id}')">
                      Edit
                    </button>
                    <button class="btn btn-danger-ghost" onclick="UI.confirmDeleteTournament('${t.id}')">
                      Archive
                    </button>
                  </div>
                ` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    renderLayout('Dashboard', content, 'dashboard');
  }

  // ── TOURNAMENT VIEW ──
  function renderTournamentView(tournament) {
    window.activeTournament = tournament;
    const isLocked = tournament.status === 'archived' || tournament.status === 'completed' || tournament.status === 'finished';

    const content = `
      <div class="tournament-header-rail">
        <div class="header-rail-left">
          <button class="btn-back-square" onclick="App.navigateTo('dashboard')">←</button>
          <div class="header-context">
            <h1 class="header-name">${tournament.name}</h1>
            <div class="header-metadata">
              <span class="meta-pill">${tournament.ratingType?.toUpperCase()}</span>
              <span class="meta-separator">/</span>
              <span class="meta-label">RD ${tournament.currentRound || 0}/${tournament.totalRounds}</span>
              ${isLocked ? '<span class="status-badge-locked">READ ONLY</span>' : '<span class="status-badge-active">ACTIVE</span>'}
            </div>
          </div>
        </div>

        <div class="header-rail-mid">
          <div class="segmented-control-rail">
            <button class="segmented-item active" data-tab="pairings">Pairings</button>
            <button class="segmented-item" data-tab="standings">Standings</button>
            <button class="segmented-item" data-tab="players">Players</button>
            ${tournament.isTeamEvent ? '<button class="segmented-item" data-tab="teams">Teams</button>' : ''}
          </div>
        </div>

        <div class="header-rail-right">
          <div id="tournament-header-actions"></div>
          
          <!-- OVERFLOW DROPDOWN -->
          <div class="overflow-dropdown">
            <button class="btn-icon-overflow" onclick="this.nextElementSibling.classList.toggle('active')">⋮</button>
            <div class="dropdown-menu">
              <button onclick="UI.copyTVLink('${tournament.id}')">🔗 Copy Public Link</button>
              <div class="dropdown-divider"></div>
              ${!isLocked ? `
                <button onclick="UI.renderEditTournamentModal('${tournament.id}')">✏️ Edit Settings</button>
                <button onclick="Tournament.completeTournament('${tournament.id}')" class="text-success">🏁 Finalize Tournament</button>
                <button onclick="UI.confirmDeleteTournament('${tournament.id}')" class="text-danger">🏛️ Archive Event</button>
              ` : ''}
            </div>
          </div>
        </div>
      </div>

      <div id="tournament-tab-content" class="tournament-viewport-fill fade-in"></div>
    `;

    renderLayout(tournament.name, content, 'dashboard');
    if (!isLocked) renderTournamentHeaderActions(tournament);
    initTournamentListeners(tournament.id);

    const tabs = document.querySelectorAll('.segmented-item');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        renderTournamentTab(tab.dataset.tab, tournament);
      });
    });

    renderTournamentTab('pairings', tournament);
  }

  function renderTournamentHeaderActions(tournament) {
    const container = document.getElementById('tournament-header-actions');
    if (!container) return;
    container.innerHTML = '';
    const currentRd = parseInt(tournament.currentRound || 0, 10);
    const totalRds = parseInt(tournament.totalRounds || 0, 10);
    const isFinalRound = (currentRd === totalRds && totalRds > 0);

    // 1. Live TV (Primary)
    const btnTV = document.createElement('button');
    btnTV.className = 'btn btn-secondary';
    btnTV.style.padding = '8px 12px';
    btnTV.innerHTML = '📺 TV';
    btnTV.onclick = () => UI.openTVTab(tournament.id);
    container.appendChild(btnTV);

    // 2. Tournament Progression Logic
    if (currentRd === 0) {
      const btnStart = document.createElement('button');
      btnStart.className = 'btn btn-primary';
      btnStart.textContent = 'START EVENT';
      btnStart.onclick = async () => {
        try {
          UI.showLoading();
          await Tournament.startTournamentAndPairR1(tournament.id);
          const t = await DB.getTournament(tournament.id);
          UI.renderTournamentView(t);
        } catch (err) { UI.showToast(err.message, 'error'); }
        finally { UI.hideLoading(); }
      };
      container.appendChild(btnStart);
    } else if (currentRd <= totalRds) {
      const btnNext = document.createElement('button');
      btnNext.className = isFinalRound ? 'btn btn-success' : 'btn btn-primary';
      btnNext.textContent = isFinalRound ? '🏁 FINALIZE TOURNAMENT' : 'NEXT ROUND →';

      btnNext.onclick = async () => {
        if (isFinalRound) {
          if (!confirm('Are you sure you want to FINALIZE this tournament?\n\nThis will:\n1. Lock all results permanently.\n2. Move the tournament to the Archive Room.\n3. Update official Club Ratings for all players.')) return;
          try {
            UI.showLoading();
            await Tournament.finalizeTournament(tournament.id);
            const t = await DB.getTournament(tournament.id);
            UI.renderTournamentView(t);
          } catch (err) { UI.showToast(err.message, 'error'); }
          finally { UI.hideLoading(); }
        } else {
          try {
            UI.showLoading();
            await Tournament.startNextRound(tournament.id);
            const t = await DB.getTournament(tournament.id);
            UI.renderTournamentView(t);
          } catch (err) { UI.showToast(err.message, 'error'); }
          finally { UI.hideLoading(); }
        }
      };
      container.appendChild(btnNext);
    }
  }

  async function renderArchiveRoom() {
    const container = document.getElementById('app-main-content');

    // 1. Initial UI Setup
    container.innerHTML = `
      <div class="fade-in">
        <h1 style="font-size: 2.5rem; font-weight: 900; margin-bottom: 0.5rem;">Tournament Archive</h1>
        <p class="text-muted" style="margin-bottom: 2rem;">Historical records of all finalized Tabuko events.</p>
        <div id="archive-grid" class="stats-grid">
          <div class="text-muted">Loading archive...</div>
        </div>
      </div>
    `;

    try {
      // 2. Fetch strictly completed tournaments
      const snap = await db.collection('tournaments')
        .where('status', '==', 'completed')
        .orderBy('completedAt', 'desc')
        .get();

      const grid = document.getElementById('archive-grid');

      if (snap.empty) {
        grid.innerHTML = '<div class="card" style="grid-column: 1 / -1; text-align: center; padding: 3rem;"><p class="text-muted">No completed tournaments found.</p></div>';
        return;
      }

      grid.innerHTML = '';

      // 3. Render Archive Cards
      snap.forEach(doc => {
        const t = doc.data();
        const dateStr = t.completedAt ? new Date(t.completedAt).toLocaleDateString() : 'Unknown Date';

        const card = document.createElement('div');
        card.className = 'card stat-card'; // Reuse your excellent CSS classes
        card.innerHTML = `
          <div style="font-size: 0.8rem; color: var(--text-muted); font-weight: 800; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 0.5rem;">${dateStr}</div>
          <h3 style="font-size: 1.25rem; font-weight: 800; color: #fff; margin-bottom: 0.5rem;">${t.name}</h3>
          <p class="text-muted" style="font-size: 0.85rem; margin-bottom: 1.5rem;">${t.isTeamEvent ? 'Team Event' : 'Individual Swiss'} • ${t.totalRounds} Rounds</p>
          <button class="btn btn-secondary btn-sm" style="width: 100%;" onclick="UI.viewArchiveDetails('${doc.id}')">View Final Standings</button>
        `;
        grid.appendChild(card);
      });

    } catch (err) {
      console.error("Archive fetch error:", err);
      document.getElementById('archive-grid').innerHTML = `<p style="color: var(--accent-danger);">Error loading archive: ${err.message}</p>`;
    }
  }

  /**
   * ── LIVE BROADCAST VIEW ──
   * A read-only, real-time spectator view.
   */
  async function renderLiveView(tournamentId) {
    showLoading();

    // 1. Initial Render Shell
    root().style.display = 'block'; // Hide sidebar
    root().innerHTML = `
      <div class="broadcast-container">
        <header class="broadcast-header">
          <div class="flex items-center gap-4">
            <span class="brand-icon">♞</span>
            <div>
              <h1 id="live-title">Loading Tournament...</h1>
              <div id="live-meta" class="text-muted text-xs uppercase font-bold"></div>
            </div>
          </div>
          <div class="flex gap-4 items-center">
            <div class="flex items-center gap-2" style="background: rgba(255,255,255,0.05); padding: 4px 12px; border-radius: 50px; border: 1px solid var(--border-color);">
              <span class="text-xs font-bold">TV MODE</span>
              <label class="switch">
                <input type="checkbox" id="tv-mode-toggle">
                <span class="slider round"></span>
              </label>
            </div>
            <div class="live-indicator">
              <span class="pulse"></span> LIVE
            </div>
            <button class="btn btn-secondary btn-sm" onclick="location.reload()">Refresh</button>
          </div>
        </header>

        <div class="broadcast-content">
          <div class="segmented-control mb-8" style="max-width: 400px; margin: 0 auto 2rem;">
            <button class="segmented-item active" data-tab="live-pairings">Current Pairings</button>
            <button class="segmented-item" data-tab="live-standings">Standings</button>
          </div>
          <div id="live-content-area" class="fade-in"></div>
        </div>
      </div>
    `;

    let currentTab = 'live-pairings';
    let tournament = null;
    let standings = null;

    const refreshUI = () => {
      if (!tournament) return;
      document.getElementById('live-title').textContent = tournament.name;
      document.getElementById('live-meta').textContent = `${tournament.type} • Round ${tournament.currentRound}/${tournament.totalRounds} • ${tournament.status}`;

      const area = document.getElementById('live-content-area');
      if (currentTab === 'live-pairings') {
        renderLivePairings(area, tournament);
      } else {
        renderLiveStandings(area, tournament, standings);
      }
    };

    // 2. Listen for Real-Time Updates
    const unsubTournament = DB.listenTournament(tournamentId, data => {
      tournament = data;
      hideLoading();
      refreshUI();
    });

    const unsubStandings = DB.listenStandings(tournamentId, data => {
      standings = data;
      refreshUI();
    });

    // 3. Tab Switching
    const tabs = root().querySelectorAll('.segmented-item');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentTab = tab.dataset.tab;
        refreshUI();
      });
    });

    // 4. TV Mode Toggle
    document.getElementById('tv-mode-toggle').addEventListener('change', e => {
      if (e.target.checked) startAutoscroll();
      else stopAutoscroll();
    });

    // Handle cleanup
    window.addEventListener('popstate', () => {
      stopAutoscroll();
      unsubTournament();
      unsubStandings();
    }, { once: true });
  }

  function startAutoscroll() {
    if (isScrolling) return;
    isScrolling = true;
    document.body.classList.add('tv-mode-active');
    lastTime = performance.now();

    function scroll(time) {
      if (!isScrolling) return;

      const delta = (time - lastTime) / 1000;
      lastTime = time;

      const container = document.documentElement;
      const maxScroll = container.scrollHeight - window.innerHeight;

      if (maxScroll <= 0) {
        scrollRequest = requestAnimationFrame(scroll);
        return;
      }

      if (container.scrollTop < maxScroll) {
        container.scrollTop += SCROLL_SPEED * delta;
        scrollRequest = requestAnimationFrame(scroll);
      } else {
        // Pause at end
        isScrolling = false;
        setTimeout(() => {
          document.documentElement.scrollTo({ top: 0, behavior: 'smooth' });
          setTimeout(() => {
            isScrolling = true;
            lastTime = performance.now();
            scrollRequest = requestAnimationFrame(scroll);
          }, 3000); // 3s pause at top
        }, 8000); // 8s pause at end
      }
    }
    scrollRequest = requestAnimationFrame(scroll);
  }

  function stopAutoscroll() {
    isScrolling = false;
    cancelAnimationFrame(scrollRequest);
    document.body.classList.remove('tv-mode-active');
    document.documentElement.scrollTop = 0;
    const toggle = document.getElementById('tv-mode-toggle');
    if (toggle) toggle.checked = false;
  }

  function renderLivePairings(el, tournament) {
    const rd = tournament.currentRound || 0;
    if (rd === 0) {
      el.innerHTML = '<div class="card text-center p-12"><p class="text-muted">Tournament has not started yet.</p></div>';
      return;
    }

    DB.getRound(tournament.id, rd).then(async roundData => {
      if (!roundData) {
        el.innerHTML = '<div class="card text-center p-12"><p class="text-muted">Round data pending...</p></div>';
        return;
      }

      // Fetch players for global map
      const pSnap = await db.collection('tournaments').doc(tournament.id).collection('playerData').get();
      const pMap = {};
      pSnap.docs.forEach(doc => pMap[doc.id] = doc.data());

      const isTeam = tournament.isTeamEvent;

      if (!isTeam) {
        // --- INDIVIDUAL BROADCAST ---
        el.innerHTML = `
          <div class="card pairing-card">
            <div class="card-header flex justify-between">
              <h2 class="card-title">Round ${rd} Pairings</h2>
              <span class="text-muted text-sm">${roundData.pairings.filter(p => p.result).length} / ${roundData.pairings.length} Results In</span>
            </div>
            <div class="table-wrap">
              <table class="broadcast-table">
                <thead>
                  <tr>
                    <th style="width: 40px;">Brd</th>
                    <th style="text-align: right;">White</th>
                    <th style="text-align: center; width: 100px;">Result</th>
                    <th style="text-align: left;">Black</th>
                  </tr>
                </thead>
                <tbody>
                  ${await (async () => {
                     const rows = [];
                     for (const p of roundData.pairings) {
                       const white = await IdentityResolution.resolvePlayer(tournament.id, null, p.whiteId, p.whiteName, p.board, pMap);
                       const black = await IdentityResolution.resolvePlayer(tournament.id, null, p.blackId, p.blackName, p.board, pMap);
                       rows.push(`
                        <tr class="${!p.result ? 'pending-row' : ''}">
                          <td class="board-num">${p.board}</td>
                          <td style="text-align: right; font-weight: 700;">${white.name} <br/><span class="text-muted text-xs">${p.whiteRating || white.rating || 0}</span></td>
                          <td style="text-align: center;">
                            ${p.result ? `<div class="live-result-pill">${p.result.whiteScore} - ${p.result.blackScore}</div>` : '<span class="text-muted text-xs italic">vs</span>'}
                          </td>
                          <td style="text-align: left; font-weight: 700;">${black.name} <br/><span class="text-muted text-xs">${p.blackRating || black.rating || 0}</span></td>
                        </tr>
                       `);
                     }
                     return rows.join('');
                   })()}
                </tbody>
              </table>
            </div>
          </div>
        `;
      } else {
        // --- TEAM BROADCAST (HIERARCHICAL) ---
        const teamMatches = roundData.teamMatches || [];
        const teamSnap = await db.collection('tournaments').doc(tournament.id).collection('teams').get();
        const fullTeams = {};
        teamSnap.docs.forEach(doc => fullTeams[doc.id] = doc.data());
        
        // Fetch players for global map
        const pSnap = await db.collection('tournaments').doc(tournament.id).collection('playerData').get();
        const pMap = {};
        pSnap.docs.forEach(doc => pMap[doc.id] = doc.data());

        el.innerHTML = `
          <div class="card pairing-card">
            <div class="card-header flex justify-between">
              <h2 class="card-title">Round ${rd} Team Matches</h2>
              <span class="text-muted text-sm">${teamMatches.filter(m => m.team1BP !== undefined).length} / ${teamMatches.length} Match Totals</span>
            </div>
            <div class="table-wrap">
              <table class="broadcast-table team-broadcast">
                <tbody>
                  ${await (async () => {
                    const matchRows = [];
                    for (const m of teamMatches) {
                      const hasRes = m.team1BP !== undefined;
                      const hTeam = fullTeams[m.homeTeamId];
                      const aTeam = fullTeams[m.awayTeamId];
                      
                      let boardsHtml = '';
                      for (const b of (m.boards || [])) {
                        const white = await IdentityResolution.resolvePlayer(tournament.id, m.homeTeamId, b.whiteId, b.whiteName, b.boardNumber, pMap, hTeam);
                        const black = await IdentityResolution.resolvePlayer(tournament.id, m.awayTeamId, b.blackId, b.blackName, b.boardNumber, pMap, aTeam);
                        
                        boardsHtml += `
                          <tr class="board-detail-row" style="background: rgba(15, 23, 42, 0.4); opacity: 0.85; border-bottom: 1px solid #1e293b;">
                            <td style="text-align: center; font-size: 0.7rem; color: #64748b;">Bd ${b.boardNumber}</td>
                            <td style="text-align: right; font-size: 0.85rem;">${white.name}</td>
                            <td style="text-align: center; font-family: monospace; font-weight: 700; color: #10b981;">${b.rawResult || (b.result ? `${b.result.whiteScore}-${b.result.blackScore}` : '...')}</td>
                            <td style="text-align: left; font-size: 0.85rem;">${black.name}</td>
                          </tr>
                        `;
                      }

                      matchRows.push(`
                        <tr class="team-match-header" style="background: #1e293b; border-top: 2px solid #334155;">
                          <td style="width: 40px; text-align: center; font-weight: 900; color: #94a3b8;">${m.matchNumber || '?'}</td>
                          <td style="text-align: right; font-weight: 800; color: #f8fafc; font-size: 1.1rem;">${hTeam?.name || m.homeTeamName}</td>
                          <td style="text-align: center; width: 140px;">
                            ${hasRes ? `<div class="live-result-pill team-pts">${m.team1BP} - ${m.team2BP}</div>` : '<div class="live-result-pill pending">VS</div>'}
                          </td>
                          <td style="text-align: left; font-weight: 800; color: #f8fafc; font-size: 1.1rem;">${aTeam?.name || m.awayTeamName}</td>
                        </tr>
                        ${boardsHtml}
                      `);
                    }
                    return matchRows.join('');
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        `;
      }
    });
  }

  function renderLiveStandings(el, tournament, standings) {
    if (!standings || (!standings.players && !standings.teams)) {
      el.innerHTML = '<div class="card text-center p-12"><p class="text-muted">Standings will appear after Round 1.</p></div>';
      return;
    }

    const isTeam = tournament.isTeamEvent;

    if (!isTeam) {
      // --- INDIVIDUAL STANDINGS ---
      const tbs = tournament.tieBreaks || [];
      el.innerHTML = `
        <div class="card">
          <h2 class="card-title mb-6">Current Standings</h2>
          <div class="table-wrap">
            <table class="broadcast-table">
              <thead>
                <tr>
                  <th style="width: 40px;">#</th>
                  <th>Player</th>
                  <th style="text-align: center;">Score</th>
                  ${tbs.map(tb => `<th class="hide-mobile" style="text-align: center;">${TB_ABBR[tb] || tb}</th>`).join('')}
                </tr>
              </thead>
              <tbody>
                ${standings.players.map(p => `
                  <tr style="${p.withdrawn ? 'opacity: 0.5; background: rgba(244, 63, 94, 0.05);' : ''}">
                    <td style="font-weight: 800; ${p.withdrawn ? 'text-decoration: line-through;' : ''}">${p.rank}</td>
                    <td>
                      <div style="font-weight: 700; ${p.withdrawn ? 'text-decoration: line-through;' : ''}">${p.name}</div>
                      <div class="text-muted text-xs">${p.rating} ${p.withdrawn ? '(WD)' : ''}</div>
                    </td>
                    <td style="text-align: center; font-weight: 800; font-size: 1.1rem; color: ${p.withdrawn ? 'var(--accent-danger)' : 'var(--accent-primary)'};">${p.score}</td>
                    ${tbs.map(tb => `<td class="hide-mobile" style="text-align: center;">${p.tieBreaks[tb] || 0}</td>`).join('')}
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } else {
      // --- TEAM STANDINGS ---
      el.innerHTML = `
        <div class="card">
          <h2 class="card-title mb-6">Team Standings</h2>
          <div class="table-wrap">
            <table class="broadcast-table">
              <thead>
                <tr>
                  <th style="width: 50px;">Rank</th>
                  <th class="text-left">Team</th>
                  <th style="text-align: center;">MP</th>
                  <th style="text-align: center;">BP</th>
                  <th style="text-align: center;" class="hide-mobile">TB</th>
                  <th style="text-align: center;" class="hide-mobile">TSB</th>
                </tr>
              </thead>
              <tbody>
                ${(standings.teams || []).map(t => `
                  <tr>
                    <td style="font-weight: 900; text-align: center; color: #94a3b8;">${t.rank}</td>
                    <td style="font-weight: 700; font-size: 1.05rem;">${t.name}</td>
                    <td style="text-align: center; font-weight: 900; font-size: 1.2rem; color: var(--accent-primary);">${t.mp}</td>
                    <td style="text-align: center; font-weight: 600;">${t.bp}</td>
                    <td style="text-align: center; color: #64748b;" class="hide-mobile">${t.tb}</td>
                    <td style="text-align: center; color: #64748b;" class="hide-mobile">${t.tsb.toFixed(1)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }
  }

  async function renderTournamentTab(tabName, tournament) {
    const el = document.getElementById('tournament-tab-content');
    el.innerHTML = '<div style="text-align:center; padding: 3rem;"><div class="spinner" style="margin: 0 auto 1rem;"></div><p class="text-muted">Loading data...</p></div>';

    try {
      switch (tabName) {
        case 'pairings': await renderPairingsTab(el, tournament); break;
        case 'standings':
          // FORCE REFRESH: Ensure standings are fresh when clicking the tab
          await Tournament.recalculateStandings(tournament.id);
          await renderStandingsTab(el, tournament);
          break;
        case 'players': await renderPlayersTab(el, tournament); break;
        case 'teams': await renderTeamsTab(el, tournament); break;
      }
    } catch (err) {
      el.innerHTML = `<div class="badge badge-danger" style="margin: 2rem;">Error: ${err.message}</div>`;
    }

    // Inside your tab rendering logic:
    const isLocked = tournament.status === 'completed';

    if (isLocked) {
      // Hide management buttons
      document.getElementById('btn-save-all')?.remove();
      document.getElementById('btn-start-next-round')?.remove();
      // Disable all result dropdowns/inputs
      document.querySelectorAll('.result-select').forEach(el => el.disabled = true);
    }
  }

  // --- FEATURE 1: ROUND SELECTOR GENERATOR ---
  function renderRoundSelector(currentRound, selectedRound, tabName) {
    if (currentRound === 0) return '';
    return `
      <div class="flex items-center gap-2 no-print">
        <label class="text-xs font-bold uppercase text-muted" style="margin:0;">Round:</label>
        <select class="history-round-selector form-input" data-tab="${tabName}" style="width: 100px; height: 32px; font-size: 0.85rem; padding: 0 10px; background: var(--bg-secondary); color: #fff;">
          ${Array.from({ length: currentRound }, (_, i) => i + 1).map(r => `
            <option value="${r}" ${r === selectedRound ? 'selected' : ''}>Round ${r}</option>
          `).join('')}
        </select>
      </div>
    `;
  }




  async function renderPairingsTab(el, tournament, targetRound = null) {
    const rd = targetRound || tournament.currentRound || 0;
    // REPAIRED: Round 0 Empty State Guard
    if (rd === 0) {
      el.innerHTML = `
        <div class="card" style="padding: 4rem; text-align: center; border: 2px dashed var(--border-color); background: rgba(0,0,0,0.1);">
          <div style="font-size: 3rem; margin-bottom: 1.5rem; opacity: 0.5;">📋</div>
          <p class="text-muted" style="margin-bottom: 2rem;">Tournament hasn't started yet. Register participants then start the first round.</p>
          <button class="btn btn-primary btn-lg" 
            onclick="const btn = document.getElementById('btn-start-tournament'); if(btn) { btn.click(); } else { UI.showToast('Please click START TOURNAMENT in the top right header.', 'info'); }">
            Start Round 1
          </button>
        </div>`;
      return;
    }

    // Inside your tab rendering logic:
    // Pillar 3: Locking Architecture
    const isLocked = tournament.status === 'completed' || tournament.status === 'archived' || tournament.status === 'finished';

    if (isLocked) {
      // Ensure all results are view-only
      setTimeout(() => {
        document.getElementById('btn-save-all')?.remove();
        document.getElementById('btn-finalize-round')?.remove();
        document.getElementById('btn-start-next-round')?.remove();
        document.getElementById('btn-repair-round')?.remove();
        document.getElementById('btn-rollback-round')?.remove();
        document.querySelectorAll('.result-select').forEach(el => el.disabled = true);
        document.querySelectorAll('.btn-manage-score').forEach(el => el.style.display = 'none');
      }, 0);
    }

    const roundData = await DB.getRound(tournament.id, rd);
    if (!roundData) { el.innerHTML = '<p>Round data not found.</p>'; return; }

    // Fetch players to build name map
    const playerSnap = await db.collection('tournaments').doc(tournament.id).collection('playerData').get();
    const playerMap = {};
    playerSnap.docs.forEach(doc => playerMap[doc.id] = doc.data());

    // HIERARCHICAL BRANCH: Redirect to Team-Specific UI if tournament is a Team Event
    if (tournament.isTeamEvent) {
      return UI.renderTeamPairings(el, tournament, rd, roundData, playerMap);
    }

    const isAdmin = Auth.isAdmin() || Auth.isArbiter();
    const isPastRound = rd < tournament.currentRound;

    el.innerHTML = `
      <div class="flex justify-between items-center mb-4">
        <div class="flex gap-4 items-center">
          <h3 class="card-title">Round ${rd} Pairing & Results</h3>
          ${renderRoundSelector(tournament.currentRound, rd, 'pairings')}
        </div>
        <div class="flex gap-2 no-print">
          ${!isPastRound && isAdmin && !isLocked ? `
            <button class="btn btn-secondary btn-sm" onclick="UI.renderLateEntryModal('${tournament.id}', ${rd})">+ Late Entry</button>
            <button class="btn btn-secondary btn-sm" onclick="UI.addTournamentRoundPrompt('${tournament.id}')">+ Add Round</button>
          ` : ''}
          <button class="btn btn-secondary btn-sm" onclick="UI.printPairings()">Print Pairings</button>
          ${!isPastRound && isAdmin ? `
            <button class="btn btn-success btn-sm" id="btn-save-all">Save All Results</button>
            <!-- ALL CARDSIDE FINALIZE BUTTONS REMOVED FOR CACHE VALIDATION -->
            ${roundData.pairings.every(p => !p.result) ?
          `<button class="btn btn-warning btn-sm" id="btn-repair-round">Delete & Repair Pairings</button>` :
          (rd > 1 ? `<button class="btn btn-danger btn-sm" id="btn-rollback-round">Delete Round ${rd} & Rollback</button>` : '')
        }
          ` : ''}
        </div>
      </div>
      
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th style="width: 50px;">Bd</th>
                <th style="text-align: right;">White (Rtg)</th>
                <th style="width: 60px; text-align: center;">PTS</th>
                <th style="width: 140px; text-align: center;">Result</th>
                <th style="width: 60px; text-align: center;">PTS</th>
                <th style="text-align: left;">Black (Rtg)</th>
                ${isAdmin && !isPastRound ? '<th style="width: 80px; text-align: right;">Action</th>' : ''}
              </tr>
            </thead>
            <tbody>
              ${roundData.pairings.map(p => {
          // 🔄 LIVE SCORE INJECTION
          const liveWhiteScore = window.liveStandingsMap ? (window.liveStandingsMap[p.whiteId]?.score ?? p.whiteScore ?? 0) : (p.whiteScore ?? 0);
          const liveBlackScore = window.liveStandingsMap ? (window.liveStandingsMap[p.blackId]?.score ?? p.blackScore ?? 0) : (p.blackScore ?? 0);

          return `
                <tr class="${!p.result ? 'missing-result' : ''}">
                  <td class="board-num">${p.board}</td>
                  <td style="text-align: right;">
                    <div style="font-weight: 700; cursor: pointer; color: var(--accent-primary);" onclick="UI.openMemberPortal('${p.whiteId}')">${p.white?.title ? p.white.title + ' ' : ''}${playerMap[p.whiteId]?.name || p.whiteName || 'Vacant'}</div>
                    <div class="text-muted text-xs">${p.whiteRating || 0}</div>
                  </td>
                  <td style="text-align: center; font-weight: 900; color: var(--accent-primary); font-size: 1.1rem;">${parseFloat(liveWhiteScore).toFixed(1).replace('.0', '')}</td>
                  <td style="text-align: center;">
                    ${p.result ?
              `<span style="font-size: 1.1rem; font-weight: 900; color: #fff;">${p.result.whiteScore} - ${p.result.blackScore}</span> ${p.pgn ? `<button class="btn btn-xs btn-secondary ml-2 replay-match" data-pgn="${p.pgn.replace(/"/g, '&quot;')}" style="padding: 2px 4px;">👁️</button>` : ''}` :
              (isPastRound ? `<span class="text-muted">Pending</span>` :
                `<select class="result-select" data-board="${p.board}" style="width: 100%; height: 34px; background: var(--bg-tertiary); border: 1px solid var(--border-color); color: white; border-radius: 4px;">
                        <option value="">Pending</option>
                        <option value="1-0">1 - 0</option>
                        <option value="0.5-0.5">½ - ½</option>
                        <option value="0-1">0 - 1</option>
                        <option value="1-0F">1 - 0 (F)</option>
                        <option value="0-1F">0 - 1 (F)</option>
                        <option value="0-0F">0 - 0 (F)</option>
                      </select>`)
            }
                  </td>
                  <td style="text-align: center; font-weight: 900; color: var(--accent-primary); font-size: 1.1rem;">${parseFloat(liveBlackScore).toFixed(1).replace('.0', '')}</td>
                  <td style="text-align: left;">
                    <div style="font-weight: 700; cursor: pointer; color: var(--accent-primary);" onclick="UI.openMemberPortal('${p.blackId}')">${p.black?.title ? p.black.title + ' ' : ''}${playerMap[p.blackId]?.name || p.blackName || 'Vacant'}</div>
                    <div class="text-muted text-xs">${p.blackRating || 0}</div>
                  </td>
                  ${isAdmin && !isPastRound ? `
                    <td style="text-align: right;">
                      ${p.result ? `<button class="btn btn-secondary btn-xs edit-result" data-board="${p.board}">Edit</button>` : ''}
                    </td>
                  ` : ''}
                </tr>
              `}).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    // Bind Round Selector
    el.querySelector('.history-round-selector')?.addEventListener('change', (e) => {
      renderPairingsTab(el, tournament, parseInt(e.target.value));
    });

    el.querySelectorAll('.replay-match').forEach(btn => {
      btn.addEventListener('click', () => {
        UI.renderMatchReplayModal(btn.dataset.pgn);
      });
    });

    el.querySelector('#btn-save-all')?.addEventListener('click', () => {
      UI.saveAllResults(tournament.id, rd);
    });

    el.querySelector('#btn-lock-round')?.addEventListener('click', async () => {
      if (confirm(`Lock results for Round ${rd}? This will update standings and prepare for the next round.`)) {
        try {
          UI.showLoading();
          await Tournament.lockRoundResults(tournament.id, rd);
          const fresh = await DB.getTournament(tournament.id);
          UI.renderTournamentView(fresh);
        } catch (err) { UI.showToast(err.message, 'error'); }
        finally { UI.hideLoading(); }
      }
    });

    el.querySelector('#btn-finalize-tournament-last')?.addEventListener('click', async () => {
      if (confirm(`Are you sure you want to FINALIZE this tournament? This will lock all results permanently.`)) {
        try {
          UI.showLoading();
          await Tournament.finalizeTournament(tournament.id);
          const fresh = await DB.getTournament(tournament.id);
          UI.renderTournamentView(fresh);
        } catch (err) { UI.showToast(err.message, 'error'); }
        finally { UI.hideLoading(); }
      }
    });

    if (!isPastRound) {
      el.querySelectorAll('.edit-result').forEach(btn => {
        btn.addEventListener('click', async () => {
          const board = parseInt(btn.dataset.board);
          if (confirm(`Clear result for Board ${board} and edit?`)) {
            try {
              showLoading();
              await Tournament.clearResult(tournament.id, rd, board);
              showToast(`Board ${board} result cleared`, 'info');
              renderTournamentTab('pairings', tournament);
            } catch (err) { showToast(err.message, 'error'); }
            finally { hideLoading(); }
          }
        });
      });

      document.getElementById('btn-repair-round')?.addEventListener('click', async () => {
        if (confirm(`WARNING: This will delete Round ${rd} pairings so you can generate them again. \n\nNo results have been recorded yet, so this is safe. Proceed?`)) {
          try {
            showLoading();
            await Tournament.deleteAndRepairCurrentRound(tournament.id);
            showToast(`Round ${rd} deleted. You can now re-pair or edit the roster.`, 'info');
            const freshTournament = await DB.getTournament(tournament.id);
            UI.renderTournamentView(freshTournament);
          } catch (err) { showToast(err.message, 'error'); }
          finally { hideLoading(); }
        }
      });

      document.getElementById('btn-rollback-round')?.addEventListener('click', async () => {
        if (confirm(`WARNING: This will permanently delete all pairings and results for Round ${rd}. \n\nThis action is required if you need to edit results from the previous round (Round ${rd - 1}). \n\nProceed?`)) {
          try {
            showLoading();
            await Tournament.deleteCurrentRound(tournament.id);
            await Tournament.recalculateStandings(tournament.id);
            showToast(`Round ${rd} deleted. Reverted to Round ${rd - 1}.`, 'info');
            const freshTournament = await DB.getTournament(tournament.id);
            UI.renderTournamentView(freshTournament);
          } catch (err) { showToast(err.message, 'error'); }
          finally { hideLoading(); }
        }
      });
    }
  }

  /**
   * renderTeamPairings: Hierarchical Team Match Dashboard
   */
  async function renderTeamPairings(el, tournament, targetRound, roundData, existingPlayerMap = null) {
    const rd = parseInt(targetRound);
    const isAdmin = Auth.isAdmin() || Auth.isArbiter();
    const isLocked = tournament.status === 'completed' || tournament.status === 'archived' || tournament.status === 'finished';
    const isPastRound = rd < tournament.currentRound;
    const matches = roundData.teamMatches || roundData.matches || [];

    // 1. DATA HYDRATION LAYER (Lead Engineer Fix)
    let playerMap = existingPlayerMap;
    if (!playerMap) {
      const snap = await db.collection('tournaments').doc(tournament.id).collection('playerData').get();
      playerMap = {};
      snap.docs.forEach(doc => playerMap[doc.id] = { id: doc.id, ...doc.data() });
    }

    const teamSnap = await db.collection('tournaments').doc(tournament.id).collection('teams').get();
    const fullTeams = {};
    teamSnap.docs.forEach(doc => fullTeams[doc.id] = { id: doc.id, ...doc.data() });

    const styles = `
      <style>
        .team-match-row { background: #1e293b; border-bottom: 2px solid #0f172a; transition: all 0.2s; }
        .team-match-row:hover { background: #243147 !important; }
        .team-name-cell { font-size: 1rem; font-weight: 800; color: #f8fafc; width: 30%; }
        .bp-score-cell { background: #0f172a; border-radius: 8px; padding: 0.5rem 1.5rem; font-weight: 900; color: #fbbf24; font-size: 1.2rem; min-width: 120px; text-align: center; border: 1px solid #334155; }
        .board-table { width: 100%; background: #0f172a; border-collapse: collapse; margin-top: 0.5rem; font-size: 0.85rem; }
        .board-table th { color: #64748b; font-size: 0.65rem; text-transform: uppercase; padding: 0.75rem; border-bottom: 1px solid #1e293b; }
        .board-table td { padding: 0.75rem; border-bottom: 1px solid #1e293b; }
        .result-pill { font-family: 'JetBrains Mono', monospace; font-weight: 800; padding: 4px 12px; border-radius: 20px; font-size: 0.75rem; }
        .result-win { background: rgba(34, 197, 94, 0.1); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.2); }
        .result-draw { background: rgba(59, 130, 246, 0.1); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.2); }
        .result-loss { background: rgba(239, 68, 68, 0.1); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.2); }
        .result-pending { background: #1a1917; color: #64748b; border: 1px solid #334155; }
      </style>
    `;

    el.innerHTML = `
      ${styles}
      <div class="flex justify-between items-center mb-6">
        <div class="flex gap-4 items-center">
          <h3 class="card-title" style="font-size: 1.5rem;">Round ${rd} Team Pairings</h3>
          ${renderRoundSelector(tournament.currentRound, rd, 'pairings')}
        </div>
        <div class="flex gap-2 items-center no-print">
          <button class="btn btn-secondary btn-sm" onclick="UI.printPairings()">Print Report</button>
        </div>
      </div>

      <div class="card" style="padding: 0; overflow: hidden; border: 1px solid #334155;">
        <div class="flex justify-between items-center p-4 bg-slate-900/50 border-b border-slate-700 no-print">
          <div class="flex gap-2">
            ${!isPastRound && isAdmin && !isLocked ? `
              <button class="btn btn-secondary btn-sm" onclick="UI.addTournamentRoundPrompt('${tournament.id}')">+ Add Round</button>
              ${matches.length === 0 || matches.every(m => !m.isResolved) ? 
                `<button class="btn btn-warning btn-sm" id="btn-repair-round-team">Delete & Repair Pairings</button>` : ''
              }
              ${rd > 1 ? `<button class="btn btn-danger btn-sm" id="btn-rollback-round-team">Rollback Round ${rd}</button>` : ''}
            ` : ''}
          </div>
          <div class="flex gap-2">
             <!-- ALL CARDSIDE FINALIZE BUTTONS REMOVED FOR CACHE VALIDATION -->
          </div>
        </div>
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background: #0f172a; color: #64748b; text-transform: uppercase; font-size: 0.7rem; letter-spacing: 1px;">
              <th style="padding: 1rem; width: 60px;">#</th>
              <th style="padding: 1rem; text-align: right;">White Team</th>
              <th style="padding: 1rem; text-align: center;">BP Score</th>
              <th style="padding: 1rem; text-align: left;">Black Team</th>
              <th style="padding: 1rem; text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${matches.length === 0 ? `
              <tr>
                <td colspan="5" style="padding: 3rem; text-align: center; color: var(--text-muted);">
                  <div class="flex flex-col items-center gap-2">
                    <span style="font-size: 2rem;">⚠️</span>
                    <p>No valid pairings found for this round.</p>
                  </div>
                </td>
              </tr>
            ` : ''}
            ${(await Promise.all(matches.map(async (m, idx) => {
              const isResolved = m.isResolved || false;
              
              // Pre-calculate board rows HTML
              const boardRows = [];
              for (const b of (m.boards || [])) {
                const white = await IdentityResolution.resolvePlayer(tournament.id, m.homeTeamId, b.whiteId, b.whiteName, b.boardNumber, playerMap, fullTeams[m.homeTeamId]);
                const black = await IdentityResolution.resolvePlayer(tournament.id, m.awayTeamId, b.blackId, b.blackName, b.boardNumber, playerMap, fullTeams[m.awayTeamId]);
                
                let resText = b.result || b.rawResult || '-';
                if (resText === '0.5-0.5') resText = '½ - ½';

                boardRows.push(`
                  <tr>
                    <td class="text-center" style="font-weight: 800; color: #475569;">${b.boardNumber}</td>
                    <td class="text-right" style="width: 35%; color: #f8fafc; font-weight: 600;">${white.name}</td>
                    <td class="text-center"><span class="result-pill ${resText !== '-' ? 'result-win' : 'result-pending'}">${resText}</span></td>
                    <td class="text-left" style="width: 35%; color: #f8fafc; font-weight: 600;">${black.name}</td>
                  </tr>
                `);
              }

              return `
                <tr class="team-match-row">
                  <td style="padding: 1rem; color: #64748b; font-weight: 800;">${m.matchNumber || idx + 1}</td>
                  <td class="team-name-cell" style="text-align: right;">${fullTeams[m.homeTeamId]?.name || m.homeTeamName}</td>
                  <td style="padding: 1rem; display: flex; justify-content: center;">
                    <div class="bp-score-cell">${isResolved ? `${m.team1BP ?? m.homeBoardPoints ?? 0} - ${m.team2BP ?? m.awayBoardPoints ?? 0}` : 'Pending'}</div>
                  </td>
                  <td class="team-name-cell" style="text-align: left;">${fullTeams[m.awayTeamId]?.name || m.awayTeamName}</td>
                  <td style="padding: 1rem; text-align: right;">
                    <div class="flex gap-2 justify-end">
                      ${!isPastRound && isAdmin && !isLocked ? `
                        <button class="btn btn-primary btn-sm" onclick="UI.renderTeamResultModal('${tournament.id}', ${rd}, '${m.matchNumber}')">Result</button>
                      ` : ''}
                      <button class="btn btn-secondary btn-sm" onclick="const row = document.getElementById('boards-${idx}'); row.style.display = row.style.display === 'none' ? 'table-row' : 'none';">Boards</button>
                    </div>
                  </td>
                </tr>
                <tr id="boards-${idx}" style="display: none;">
                  <td colspan="5" style="padding: 0; background: #0f172a;">
                    <table class="board-table">
                      <thead>
                        <tr><th>Bd</th><th class="text-right">White Player</th><th class="text-center">Result</th><th class="text-left">Black Player</th></tr>
                      </thead>
                      <tbody>
                        ${boardRows.join('')}
                      </tbody>
                    </table>
                  </td>
                </tr>
              `;
            }))).join('')}
          </tbody>
        </table>
      </div>
    `;

    // Bind Round Selector
    el.querySelector('.history-round-selector')?.addEventListener('change', (e) => {
      renderPairingsTab(el, tournament, parseInt(e.target.value));
    });

    // --- EVENT HANDLERS ---
    const btnLock = el.querySelector('#btn-lock-round-team');
    if (btnLock) {
      btnLock.onclick = async () => {
        if (!confirm(`Are you sure you want to LOCK results for Round ${rd}? This will update official standings but will NOT end the tournament.`)) return;
        try {
          UI.showLoading();
          await Tournament.lockRoundResults(tournament.id, rd);
          showToast(`Round ${rd} results locked.`, 'success');
          const fresh = await DB.getTournament(tournament.id);
          UI.renderTournamentView(fresh);
        } catch (err) { showToast(err.message, 'error'); }
        finally { UI.hideLoading(); }
      };
    }

    const btnFinalize = el.querySelector('#btn-finalize-tournament-team');
    if (btnFinalize) {
      btnFinalize.onclick = async () => {
        if (!confirm(`Are you sure you want to FINALIZE this tournament? This will lock all results permanently.`)) return;
        try {
          UI.showLoading();
          await Tournament.finalizeTournament(tournament.id);
          const fresh = await DB.getTournament(tournament.id);
          UI.renderTournamentView(fresh);
        } catch (err) { showToast(err.message, 'error'); }
        finally { UI.hideLoading(); }
      };
    }

    el.querySelector('#btn-repair-round-team')?.addEventListener('click', async () => {
      if (confirm('Delete current Team pairings and regenerate them? This will clear all entered results for this round.')) {
        try {
          showLoading();
          await Tournament.deleteAndRepairCurrentRound(tournament.id);
          showToast('Round pairings regenerated.', 'success');
          const fresh = await DB.getTournament(tournament.id);
          UI.renderTournamentView(fresh);
        } catch (err) { showToast(err.message, 'error'); }
        finally { hideLoading(); }
      }
    });

    el.querySelector('#btn-rollback-round-team')?.addEventListener('click', async () => {
      if (confirm(`Delete Round ${rd} and return to previous round? DATA WILL BE LOST.`)) {
        try {
          showLoading();
          await Tournament.deleteCurrentRound(tournament.id);
          showToast('Round deleted successfully.', 'success');
          const fresh = await DB.getTournament(tournament.id);
          UI.renderTournamentView(fresh);
        } catch (err) { showToast(err.message, 'error'); }
        finally { hideLoading(); }
      }
    });

    // ── GHOST REMOVAL: Explicitly kill any accidental 'Finalize Round' button ──
    setTimeout(() => {
      const ghost = document.getElementById('btn-finalize-round');
      if (ghost) {
        console.log('[UI] Ghost Finalize Button Detected & Purged');
        ghost.remove();
      }
      // Also search by text content if ID is missing
      document.querySelectorAll('button').forEach(btn => {
        if (btn.textContent.includes('FINALIZE ROUND')) btn.remove();
      });
    }, 100);
  }


  async function renderStandingsTab(el, tournament, targetRound = null) {
    const rd = parseInt(targetRound || tournament.currentRound || 0, 10);

    // Set global context for the data pipeline
    window.activeTournament = tournament;

    el.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
        <div class="flex gap-4 items-center">
          <h3 style="margin: 0; color: #0f172a; font-weight: 800;">Standings after Round ${rd}</h3>
          ${renderRoundSelector(tournament.currentRound, rd, 'standings')}
        </div>
        <div style="display: flex; gap: 0.75rem;">
          <button class="btn btn-secondary btn-sm" onclick="UI.printStandings()">Print Report</button>
          <button class="btn btn-secondary btn-sm" onclick="UI.exportTournamentTRF('${tournament.id}')">Export FIDE TRF</button>
          ${rd === tournament.currentRound ? `<button class="btn btn-secondary btn-sm" onclick="Tournament.recalculateStandings('${tournament.id}')">Recalculate Standings</button>` : ''}
        </div>
      </div>

      <div id="enterprise-table-root">
        <div class="loading-state" style="padding: 4rem; text-align: center;">
          <div class="spinner mb-4" style="margin: 0 auto;"></div>
          <p style="color: #64748b; font-size: 0.875rem;">Calculating FIDE Rankings...</p>
        </div>
      </div>
    `;

    // Bind Round Selector
    el.querySelector('.history-round-selector')?.addEventListener('change', (e) => {
      renderStandingsTab(el, tournament, parseInt(e.target.value, 10));
    });

    // Trigger the reactive data pipeline
    UI.updateStandingsView(rd);
  }

  async function renderPlayersTab(el, tournament) {
    const snap = await db.collection('tournaments').doc(tournament.id).collection('playerData').get();
    const players = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    const activeCount = players.filter(p => !p.withdrawn).length;

    el.innerHTML = `
      <div class="flex justify-between items-center mb-4">
        <div>
          <h3 class="card-title">Participating Players (${activeCount})</h3>
          <p class="text-muted text-sm">${players.length - activeCount} players withdrawn</p>
        </div>
        <div class="flex gap-2">
          ${tournament.status === 'registration' ? `
            <button class="btn btn-secondary btn-sm" id="btn-import-roster">Import from Roster</button>
            <button class="btn btn-primary btn-sm" id="btn-add-manual">+ Manual Entry</button>
          ` : ''}
        </div>
      </div>

      <div class="card">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Score</th>
                <th>Rating</th>
                <th>Status</th>
                <th style="text-align: right;">Action</th>
              </tr>
            </thead>
            <tbody>
              ${players.length === 0 ? '<tr><td colspan="5" style="text-align:center; padding: 2rem;">No players registered.</td></tr>' :
        players.map(p => {
          // 🔄 LIVE SCORE INJECTION
          const liveScore = window.liveStandingsMap ? (window.liveStandingsMap[p.id]?.score ?? p.score ?? 0) : (p.score ?? 0);
          return `
                <tr class="${p.withdrawn ? 'text-muted' : ''}">
                  <td style="padding: 0;">
                    <button class="player-history-trigger" data-id="${p.id}">
                      <span class="clickable-name" onclick="UI.openMemberPortal('${p.id}')" style="color: #fff;">${p.name}</span>
                      ${p.title ? `<span class="badge badge-warning" style="font-size: 0.6rem; margin-left: 5px;">${p.title}</span>` : ''}
                    </button>
                  </td>
                  <td style="font-weight: 900; color: var(--accent-primary); font-size: 1.1rem;">${parseFloat(liveScore).toFixed(1).replace('.0', '')}</td>
                  <td>${p.selectedRating || 0}</td>
                  <td><span class="badge ${p.withdrawn ? 'badge-danger' : 'badge-success'}">${p.withdrawn ? 'Withdrawn' : 'Active'}</span></td>
                  <td style="text-align: right;">
                    <div class="flex gap-2 justify-end">
                       <button class="btn btn-sm ${p.withdrawn ? 'badge-danger' : 'badge-success'}" onclick="UI.toggleWithdrawal('${tournament.id}', '${p.id}', ${!p.withdrawn})" style="font-size: 0.6rem; font-weight: 800; min-width: 80px;">
                        ${p.withdrawn ? 'WITHDRAWN' : 'ACTIVE'}
                       </button>
                      <button class="btn btn-secondary btn-sm edit-tp" data-id="${p.id}">Edit</button>
                      <button class="btn btn-secondary btn-sm delete-tp" data-id="${p.id}" style="border-color: rgba(244, 63, 94, 0.2); color: var(--accent-danger);">🗑️</button>
                    </div>
                  </td>
                </tr>
                <tr class="history-drawer" id="history-${p.id}" style="display: none; background: rgba(0,0,0,0.2);">
                  <td colspan="5" style="padding: 1.5rem 2rem;">
                    <div class="flex gap-4 items-center mb-3">
                      <span style="font-size: 0.75rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: var(--text-muted);">Tournament History</span>
                      <div style="height: 1px; flex: 1; background: var(--border-color);"></div>
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 1rem;">
                      ${(p.results || []).map(r => `
                        <div style="background: var(--bg-tertiary); padding: 0.75rem; border-radius: 6px; border: 1px solid var(--border-color);">
                          <div class="flex justify-between items-center mb-2">
                            <span class="text-xs font-bold uppercase">Round ${r.round}</span>
                            <span class="badge ${r.result >= 1 ? 'badge-success' : r.result > 0 ? 'badge-warning' : 'badge-danger'}" style="font-size: 0.65rem;">
                              ${r.result === 1 ? 'WIN' : r.result === 3 ? 'WIN' : r.result === 0.5 ? 'DRAW' : r.result === 1 && tournament.scoringType === '3point' ? 'DRAW' : 'LOSS'}
                            </span>
                          </div>
                          <div style="font-size: 0.85rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            ${r.isBye ? 'BYE' : `vs ${players.find(pl => pl.id === r.opponentId)?.name || 'Unknown'}`}
                          </div>
                        </div>
                      `).join('')}
                      ${(!p.results || p.results.length === 0) ? '<p class="text-muted text-sm">No games recorded yet.</p>' : ''}
                    </div>
                  </td>
                </tr>`}).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    document.getElementById('btn-import-roster')?.addEventListener('click', () => UI.renderImportModal(tournament));
    document.getElementById('btn-add-manual')?.addEventListener('click', () => UI.renderAddPlayerModal(tournament));

    el.querySelectorAll('.player-history-trigger').forEach(btn => {
      btn.addEventListener('click', () => {
        const drawer = document.getElementById(`history-${btn.dataset.id}`);
        const isHidden = drawer.style.display === 'none';
        drawer.style.display = isHidden ? 'table-row' : 'none';
      });
    });

    el.querySelectorAll('.edit-tp').forEach(btn => {
      btn.addEventListener('click', () => {
        const player = players.find(p => p.id === btn.dataset.id);
        UI.renderEditTournamentPlayerModal(tournament, player);
      });
    });

    for (const btn of el.querySelectorAll('.rejoin-player')) {
      btn.addEventListener('click', async () => {
        await db.collection('tournaments').doc(tournament.id).collection('playerData').doc(btn.dataset.id).update({ withdrawn: false });
        showToast('Player rejoined', 'success');
        renderTournamentTab('players', tournament);
      });
    }

    el.querySelectorAll('.delete-tp').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Are you sure you want to PERMANENTLY delete this player from the tournament? This will break past round pairings if they have played.')) return;
        try {
          showLoading();
          await db.collection('tournaments').doc(tournament.id).collection('playerData').doc(btn.dataset.id).delete();
          await db.collection('tournaments').doc(tournament.id).update({
            playerIds: firebase.firestore.FieldValue.arrayRemove(btn.dataset.id)
          });
          showToast('Player deleted from tournament', 'success');
          renderTournamentTab('players', tournament);
        } catch (err) { showToast(err.message, 'error'); }
        finally { hideLoading(); }
      });
    });
  }

  function renderEditTournamentPlayerModal(tournament, player) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay active';
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h2 class="card-title">Edit Participant: ${player.name}</h2>
          <button class="btn btn-secondary btn-sm" onclick="this.closest('.modal-overlay').remove()">✕</button>
        </div>
        <div class="modal-body">
          <form id="edit-tp-form">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
              <div class="form-group">
                <label>Current Score</label>
                <input type="number" id="etp-score" value="${player.score || 0}" step="0.5">
              </div>
              <div class="form-group">
                <label>Status</label>
                <select id="etp-withdrawn">
                  <option value="false" ${!player.withdrawn ? 'selected' : ''}>Active</option>
                  <option value="true" ${player.withdrawn ? 'selected' : ''}>Withdrawn</option>
                </select>
              </div>
            </div>
            <p class="text-muted text-sm mt-4">Manual overrides for tie-breaks (optional):</p>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
              <div class="form-group">
                <label>Buchholz</label>
                <input type="number" id="etp-bh" value="${player.manualBuchholz || ''}" placeholder="Auto">
              </div>
              <div class="form-group">
                <label>Sonneborn-Berger</label>
                <input type="number" id="etp-sb" value="${player.manualSB || ''}" placeholder="Auto">
              </div>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
          <button class="btn btn-primary" id="btn-save-tp">Update Participant</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    document.getElementById('btn-save-tp').addEventListener('click', async () => {
      try {
        showLoading();
        const data = {
          score: parseFloat(document.getElementById('etp-score').value),
          withdrawn: document.getElementById('etp-withdrawn').value === 'true',
          manualBuchholz: document.getElementById('etp-bh').value ? parseFloat(document.getElementById('etp-bh').value) : null,
          manualSB: document.getElementById('etp-sb').value ? parseFloat(document.getElementById('etp-sb').value) : null
        };
        await db.collection('tournaments').doc(tournament.id).collection('playerData').doc(player.id).update(data);
        overlay.remove();
        showToast('Participant updated', 'success');
        renderTournamentTab('players', tournament);
      } catch (err) { showToast(err.message, 'error'); }
      finally { hideLoading(); }
    });
  }

  // ── IMPORT FROM ROSTER MODAL ──
  async function renderImportModal(tournament) {
    showLoading();
    const [members, visitors] = await Promise.all([
      ClubMembers.getAllMembers(),
      db.collection('playerRegistry').where('isArchived', '!=', true).get().then(s => s.docs.map(d => ({ ...d.data(), id: d.id, isGuest: true })))
    ]);
    hideLoading();

    const snap = await db.collection('tournaments').doc(tournament.id).collection('playerData').get();
    const existingIds = new Set(snap.docs.map(d => d.id));

    const allAvailable = [...members, ...visitors]
      .filter(p => !existingIds.has(p.id))
      .sort((a, b) => a.name.localeCompare(b.name));

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay active';
    overlay.innerHTML = `
      <div class="modal" style="max-width: 600px;">
        <div class="modal-header">
          <h2 class="card-title">Import from Club Roster</h2>
          <button class="btn btn-secondary btn-sm" onclick="this.closest('.modal-overlay').remove()">✕</button>
        </div>
        <div class="modal-body">
          <input type="text" id="import-search" placeholder="Search members..." class="form-input mb-4" style="width: 100%;">
          <div style="max-height: 300px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: var(--radius-md);">
            <table style="width: 100%;">
              <tbody id="import-list">
                ${allAvailable.map(p => `
                  <tr class="import-row" data-id="${p.id}">
                    <td style="padding: 0.75rem 1rem;">
                      <div class="flex items-center gap-2">
                        <span style="font-weight: 600;">${p.name}</span>
                        <span class="badge ${p.isGuest ? '' : 'badge-success'}" style="font-size: 0.6rem; padding: 2px 6px; ${p.isGuest ? 'background: #475569; color: #fff;' : 'background: #1e3a8a; color: #fff;'}">
                          ${p.isGuest ? 'VISITOR' : 'OFFICIAL'}
                        </span>
                      </div>
                      <div class="text-muted text-sm">FIDE: ${p.ratings?.fide || '-'} | Club: ${p.ratings?.club || 1200}</div>
                    </td>
                    <td style="text-align: right; padding: 0.75rem 1rem;">
                      <button class="btn btn-primary btn-sm do-import" data-id="${p.id}">Select</button>
                    </td>
                  </tr>
                `).join('')}
                ${allAvailable.length === 0 ? '<tr><td colspan="2" style="padding: 2rem; text-align: center; color: var(--text-muted);">No players available to import.</td></tr>' : ''}
              </tbody>
            </table>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Close</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    // FIXED: Scope search to overlay to prevent targeting the background app
    document.getElementById('import-search').addEventListener('input', e => {
      const q = e.target.value.toLowerCase();
      overlay.querySelectorAll('.import-row').forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });

    overlay.querySelectorAll('.do-import').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          showLoading();
          const config = {
            ratingType: tournament.ratingType || 'club',
            defaultRating: tournament.defaultRating || 1200,
            unratedHandling: tournament.unratedHandling || 'fixed'
          };
          if (tournament.status === 'registration') {
            await ClubMembers.importToTournament(tournament.id, btn.dataset.id, config);
            showToast('Player imported successfully', 'success');
          } else {
            // Late Joiner Logic
            await Tournament.addLateJoiner(tournament.id, btn.dataset.id, tournament.currentRound);
            showToast('Late joiner added with 0-point byes', 'success');
          }
          btn.closest('.import-row').remove();
          renderTournamentTab('players', tournament);
        } catch (err) { showToast(err.message, 'error'); }
        finally { hideLoading(); }
      });
    });
  }

  // ── PLAYER REGISTRY PAGE ──
  async function renderPlayersPage() {
    showLoading();
    const players = await DB.getAllPlayers();
    hideLoading();

    const content = `
      <div class="flex justify-between items-center mb-4">
        <div>
          <h2 class="card-title">Active Player Registry</h2>
          <p class="text-muted text-sm">Auto-populated radar of all recent participants (30-Day Activity).</p>
        </div>
        </div>
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Name</th>
                <th>FIDE</th>
                <th>NCFP</th>
                <th>Club Rating</th>
                <th>Status</th>
                <th style="text-align: right;">Action</th>
              </tr>
            </thead>
            <tbody>
              ${players.map((p, i) => `
                <tr>
                  <td>${i + 1}</td>
                  <td style="font-weight: 600;">${p.name}</td>
                  <td>${p.ratings?.fide || '-'}</td>
                  <td>${p.ratings?.ncfp || '-'}</td>
                  <td>${p.ratings?.club || 1200}</td>
                  <td>
                    <span class="badge ${p.isMember ? 'badge-success' : 'badge-secondary'}" style="${!p.isMember ? 'background: #475569; color: #f8fafc;' : ''}">
                      ${p.isMember ? 'MEMBER' : 'NOT MEMBER'}
                    </span>
                  </td>
                  <td style="text-align: right;">
                    <div class="flex gap-2 justify-end">
                      ${!p.isMember ? `<button class="btn btn-secondary btn-sm promote-btn" data-id="${p.id}" style="color: var(--accent-primary); border-color: rgba(144, 202, 87, 0.2);">Promote to Member ⬆️</button>` : ''}
                       <button class="btn btn-secondary btn-sm" onclick="UI.openMemberPortal('${p.id}')" title="View Career History">📜 History</button>
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
    renderLayout('Player Registry', content, 'players');

    // Attach promote logic for the buttons we just rendered
    document.querySelectorAll('.promote-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Convert this visitor into a full Club Member? Their historical data will be preserved and they will be added to the permanent roster.')) return;
        try {
          showLoading();
          await ClubMembers.promoteVisitorToMember(btn.dataset.id);
          showToast('Visitor promoted to full member!', 'success');
          renderPlayersPage();
        } catch (err) { showToast(err.message, 'error'); }
        finally { hideLoading(); }
      });
    });
  }

  // ── MODALS ──
  function renderCreateTournament() {
    const container = document.getElementById('modal-container');
    container.innerHTML = ''; // ANTI-DUPLICATION: Clear any existing modals

    const overlay = document.createElement('div');
    overlay.id = 'tournament-modal-overlay';
    overlay.className = 'modal-overlay active';
    overlay.innerHTML = `
      <div class="modal fade-in">
        <div class="modal-header">
          <h2 class="card-title">Create New Tournament</h2>
          <button class="btn btn-secondary btn-sm" onclick="document.getElementById('modal-container').innerHTML = ''">✕</button>
        </div>
        <div class="modal-body" style="padding: 30px;">
          <form id="create-t-form" class="saas-form">
            
            <!-- SECTION: GENERAL -->
            <div class="form-section-group">
              <h3 class="form-section-header">Basic Parameters</h3>
              <div class="form-grid">
                <div class="form-group full-width">
                  <label>Tournament Name</label>
                  <input type="text" id="ct-name" class="form-input" placeholder="e.g. Tabuko Monthly Open" required>
                </div>
                <div class="form-group">
                  <label>System Type</label>
                  <select id="ct-type" class="form-input">
                    <option value="swiss">Swiss System (FIDE)</option>
                    <option value="round-robin">Round Robin</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>Total Rounds</label>
                  <input type="number" id="ct-rounds" class="form-input" value="5" min="1">
                </div>
              </div>
            </div>

            <!-- SECTION: SCORING & RATING -->
            <div class="form-section-group">
              <h3 class="form-section-header">Ranking & Scoring</h3>
              <div class="form-grid">
                <div class="form-group">
                  <label>Primary Rating System</label>
                  <select id="ct-rating" class="form-input">
                    <option value="fide">FIDE Standard</option>
                    <option value="ncfp">NCFP National</option>
                    <option value="club">Internal Club</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>Point Allocation</label>
                  <select id="ct-scoring" class="form-input">
                    <option value="standard">Standard (1, 0.5, 0)</option>
                    <option value="3point">3-Point (3, 1, 0)</option>
                  </select>
                </div>
              </div>
            </div>

            <div id="max-rating-container" style="display: none;" class="form-section-group">
              <div class="form-group full-width">
                <label>Max Team Average Rating (Cap)</label>
                <input type="number" id="ct-max-avg" class="form-input" value="2000" min="0">
              </div>
            </div>

            <!-- SECTION: EVENT MODE -->
            <div class="form-section-group">
              <div class="form-group">
                <div class="toggle-container" style="display: flex; align-items: center; justify-content: space-between; padding: 1.25rem; background: var(--bg-sidebar); border: 1px solid var(--border-color); border-radius: var(--radius-md);">
                  <div>
                    <span style="font-weight: 700; display: block;">Team-Based Event</span>
                    <span class="text-muted" style="font-size: 0.75rem;">Pair teams instead of individuals</span>
                  </div>
                  <label class="switch">
                    <input type="checkbox" id="ct-team">
                    <span class="slider round"></span>
                  </label>
                </div>
              </div>
            </div>

            <div id="team-settings-panel" style="max-height: 0; overflow: hidden; transition: all 0.4s ease-in-out; opacity: 0;">
              <div style="padding: 1.25rem; background: var(--bg-tertiary); border-radius: var(--radius-md); border: 1px solid var(--border-color); margin-top: 1rem;">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                  <div class="form-group">
                    <label>Team Format</label>
                    <select id="ct-team-size" class="form-input">
                      <option value="2">2v2</option>
                      <option value="3">3v3</option>
                      <option value="4" selected>4v4 (Standard)</option>
                      <option value="5">5v5</option>
                      <option value="10">10v10</option>
                      <option value="12">12v12</option>
                      <option value="15">15v15</option>
                    </select>
                  </div>
                  <div class="form-group">
                    <label>Team Seeding</label>
                    <select id="ct-team-calc" class="form-input">
                      <option value="average">Average Rating</option>
                      <option value="total">Total Aggregate</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="document.getElementById('modal-container').innerHTML = ''">Cancel</button>
          <button class="btn btn-primary" id="btn-do-create">Create Tournament</button>
        </div>
      </div>`;
    container.appendChild(overlay);

    const teamToggle = document.getElementById('ct-team');
    const teamPanel = document.getElementById('team-settings-panel');
    const maxRatingContainer = document.getElementById('max-rating-container');

    teamToggle.addEventListener('change', () => {
      if (teamToggle.checked) {
        teamPanel.style.maxHeight = '300px';
        teamPanel.style.opacity = '1';
        teamPanel.style.marginTop = '1rem';
        maxRatingContainer.style.display = 'block';
      } else {
        teamPanel.style.maxHeight = '0';
        teamPanel.style.opacity = '0';
        teamPanel.style.marginTop = '0';
        maxRatingContainer.style.display = 'none';
      }
    });

    document.getElementById('btn-do-create').addEventListener('click', async () => {
      const name = document.getElementById('ct-name').value;
      if (!name) return;

      try {
        setBtnState('btn-do-create', true, 'Creating...');
        showLoading();
        await DB.createTournament({
          name,
          type: document.getElementById('ct-type').value,
          totalRounds: parseInt(document.getElementById('ct-rounds').value),
          ratingType: document.getElementById('ct-rating').value,
          scoringType: document.getElementById('ct-scoring').value,
          maxTeamAvgRating: teamToggle.checked ? parseInt(document.getElementById('ct-max-avg').value) : 0,
          isTeamEvent: teamToggle.checked,
          teamSize: teamToggle.checked ? parseInt(document.getElementById('ct-team-size').value) : 0,
          teamRatingMethod: teamToggle.checked ? document.getElementById('ct-team-calc').value : 'average',
          status: 'registration'
        });
        document.getElementById('modal-container').innerHTML = '';
        showToast('Tournament created!', 'success');
        App.navigateTo('dashboard');
      } catch (err) { showToast(err.message, 'error'); }
      finally { hideLoading(); setBtnState('btn-do-create', false, 'Create Tournament'); }
    });
  }

  function renderMemberModal(member = null) {
    const container = document.getElementById('modal-container');
    container.innerHTML = '';

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay active';
    overlay.innerHTML = `
      <div class="modal fade-in">
        <div class="modal-header">
          <h2 class="card-title">${member ? 'Edit Member' : 'New Club Member'}</h2>
          <button class="btn btn-secondary btn-sm" onclick="document.getElementById('modal-container').innerHTML = ''">✕</button>
        </div>
        <div class="modal-body">
          <form id="member-form">
            <div class="form-group">
              <label>Full Name</label>
              <input type="text" id="m-name" class="form-input" value="${member?.name || ''}" required>
            </div>
            <div class="form-group">
              <label>FIDE ID (optional)</label>
              <input type="text" id="m-fide-id" class="form-input" value="${member?.fideId || ''}">
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
              <div class="form-group">
                <label>FIDE Rating</label>
                <input type="number" id="m-fide-rtg" class="form-input" value="${member?.ratings?.fide || 0}">
              </div>
              <div class="form-group">
                <label>Club Rating</label>
                <input type="number" id="m-club-rtg" class="form-input" value="${member?.ratings?.club || 1200}">
              </div>
            </div>
            ${member ? `
            <div style="margin-top: 1.5rem; padding: 1rem; background: rgba(255,255,255,0.03); border-radius: 8px; text-align: center;">
              <div style="font-size: 0.8rem; text-transform: uppercase; letter-spacing: 1px; color: var(--accent); margin-bottom: 0.5rem; font-weight: 700;">Digital Player Card</div>
              <div id="member-qr" style="display: flex; justify-content: center; background: white; padding: 10px; border-radius: 4px; margin: 0 auto; width: 128px;"></div>
              <div style="font-size: 0.7rem; color: var(--text-secondary); margin-top: 0.5rem;">Scan at venue for instant check-in</div>
            </div>
            ` : ''}
          </form>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="document.getElementById('modal-container').innerHTML = ''">Cancel</button>
          <button class="btn btn-primary" id="btn-save-member">Save Member</button>
        </div>
      </div>`;
    container.appendChild(overlay);

    if (member) {
      setTimeout(() => {
        new QRCode(document.getElementById("member-qr"), {
          text: JSON.stringify({ id: member.id, name: member.name, rtg: member.ratings?.club || 1200 }),
          width: 128,
          height: 128,
          colorDark: "#000000",
          colorLight: "#ffffff",
          correctLevel: QRCode.CorrectLevel.H
        });
      }, 100);
    }

    document.getElementById('btn-save-member').addEventListener('click', () => UI.handleSaveMember());
  }

  /**
   * handleSaveMember: Orchestrates the creation of a member profile.
   * Extracts form data and triggers the DB auto-initializer.
   */
  async function handleSaveMember(event) {
    if (event) event.preventDefault();

    // 1. Extract Form Data
    const formData = {
      name: document.getElementById('m-name').value,
      fideId: document.getElementById('m-fide-id').value,
      fideRating: document.getElementById('m-fide-rtg').value,
      title: 'Member' // Default title fallback
    };

    if (!formData.name) {
      UI.showToast('Player Name is required', 'error');
      return;
    }

    try {
      UI.showLoading();

      // Trigger Auto-Initializer in Database
      await DB.createClubMember(formData);

      UI.showToast('Digital Profile Created Successfully!', 'success');

      const form = document.getElementById('member-form');
      if (form) form.reset();

      const container = document.getElementById('modal-container');
      if (container) container.innerHTML = '';

      UI.hideLoading();

      // Refresh Roster Table
      if (typeof UI.renderRosterPage === 'function') {
        UI.renderRosterPage();
      }

    } catch (err) {
      UI.hideLoading();
      UI.showToast('Failed to initialize profile: ' + err.message, 'error');
      console.error('[UI] handleSaveMember Error:', err);
    }
  }

  /**
   * openHistoryModal: Generates a perfectly centered analytics pop-up.
   * Features a glassmorphic overlay, concurrent data fetching, and match analytics.
   */
  function openHistoryModal(member, historyArray) {
    const existing = document.getElementById('history-modal-overlay');
    if (existing) existing.remove();

    // 1. Calculate Summary Stats
    const stats = historyArray.reduce((acc, m) => {
      const isWin = (m.result === '1-0' && m.whiteId === member.id) || (m.result === '0-1' && m.blackId === member.id);
      if (isWin) acc.wins++;
      else if (m.result === '0.5-0.5') acc.draws++;
      else acc.losses++;
      return acc;
    }, { wins: 0, draws: 0, losses: 0 });

    // 2. Generate Centered Modal HTML
    const modalHtml = `
      <div id="history-modal-overlay" class="custom-modal-overlay" onclick="UI.closeHistoryModal()">
        <div class="custom-modal-content history-pop-up" onclick="event.stopPropagation()">
          <div class="modal-header">
            <h2 style="margin:0; font-size: 1.5rem; color: var(--accent-primary);">${member?.name || 'Unknown Player'}</h2>
            <span class="close-btn" onclick="UI.closeHistoryModal()">&times;</span>
          </div>

          <div class="history-grid">
            <div class="history-card">
              <span>Club Rating</span>
              <strong style="color: var(--accent-primary);">${member?.ratings?.club || 1200}</strong>
            </div>
            <div class="history-card">
              <span>Wins</span>
              <strong style="color: #10b981;">${stats.wins}</strong>
            </div>
            <div class="history-card">
              <span>Total Games</span>
              <strong style="color: #60a5fa;">${historyArray.length}</strong>
            </div>
          </div>

          <div class="scroll-container">
            <table class="history-log-table">
              <thead>
                <tr>
                  <th>Round</th>
                  <th>Opponent</th>
                  <th>Result</th>
                  <th>Color</th>
                </tr>
              </thead>
              <tbody>
                ${historyArray.length > 0 ? historyArray.map(m => `
                  <tr>
                    <td style="color: #64748b; font-weight: 700;">R${m.round || '?'}</td>
                    <td style="font-weight:600;">${m.color === 'White' ? m.opponentName : m.opponentName}</td>
                    <td>
                      <span style="color: ${((typeof m.result === 'object' ? `${m.result.whiteScore}-${m.result.blackScore}` : m.result) === '1-0' && m.color === 'White') || ((typeof m.result === 'object' ? `${m.result.whiteScore}-${m.result.blackScore}` : m.result) === '0-1' && m.color === 'Black') ? '#10b981' : ((typeof m.result === 'object' ? `${m.result.whiteScore}-${m.result.blackScore}` : m.result) === '0.5-0.5') ? '#94a3b8' : '#ef4444'}; font-weight:800;">
                        ${typeof m.result === 'object' ? `${m.result.whiteScore}-${m.result.blackScore}` : (m.result || 'Pending')}
                      </span>
                    </td>
                    <td style="color: #94a3b8;">${m.color}</td>
                  </tr>
                `).join('') : '<tr><td colspan="4" style="text-align:center; padding: 40px; color:#64748b; font-style: italic;">No match history found in records.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
  }

  /**
   * closeHistoryModal: Synchronously removes the modal overlay and its children.
   */
  function closeHistoryModal() {
    const modal = document.getElementById('history-modal-overlay');
    if (modal) modal.remove();
  }

  function renderAddPlayerModal(tournament) {
    if (!tournament) {
      UI.showToast("Walk-ins must be added directly from an active Tournament's Player tab.", "warning");
      return;
    }

    const container = document.getElementById('modal-container');
    container.innerHTML = '';

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay active';
    overlay.innerHTML = `
      <div class="modal fade-in" style="max-width: 650px;">
        <div class="modal-header">
          <h2 class="card-title">Add Walk-In Guest to Tournament</h2>
          <button class="btn btn-secondary btn-sm" onclick="document.getElementById('modal-container').innerHTML = ''">✕</button>
        </div>
        <div class="modal-body">
          <form id="temp-p-form">
            <div class="form-group">
              <label>Full Name</label>
              <input type="text" id="tp-name" class="form-input" required placeholder="Enter full name">
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-top: 1rem;">
              <div class="form-group">
                <label>Assigned Club Rating</label>
                <input type="number" id="tp-rating" class="form-input" value="${tournament.defaultRating || 1200}">
              </div>
              <div class="form-group">
                <label>FIDE ID (If known)</label>
                <input type="text" id="tp-fide-id" class="form-input" placeholder="Optional">
              </div>
            </div>
            
            <div style="margin-top: 1.5rem; padding: 1rem; background: rgba(56, 189, 248, 0.1); border-left: 4px solid var(--accent-sapphire); border-radius: 4px;">
              <p class="text-muted text-sm" style="margin: 0;">
                <strong>System Note:</strong> This player will be tagged as <code>NOT MEMBER</code> and added to the active tournament. They will automatically appear in the Player Registry for 30 days.
              </p>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="document.getElementById('modal-container').innerHTML = ''">Cancel</button>
          <button class="btn btn-primary" id="btn-save-temp">Inject Guest into Tournament</button>
        </div>
      </div>`;
    container.appendChild(overlay);

    document.getElementById('btn-save-temp').addEventListener('click', async () => {
      const name = document.getElementById('tp-name').value;
      const rating = parseInt(document.getElementById('tp-rating').value) || 1200;
      if (!name) return;

      const extraData = {
        name,
        rating,
        fideId: document.getElementById('tp-fide-id').value
      };

      try {
        showLoading();
        const config = { defaultRating: tournament.defaultRating };
        await ClubMembers.addTemporaryPlayer(tournament.id, extraData, config);

        showToast('Guest successfully added to tournament!', 'success');
        renderTournamentTab('players', tournament);
        document.getElementById('modal-container').innerHTML = '';
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        hideLoading();
      }
    });
  }

  /**
   * getTeamMonogram: Generates initials and a deterministic 'Identity Glow' color.
   */
  function getTeamMonogram(name) {
    const initials = name.split(' ').map(n => n[0]).join('').substr(0, 2).toUpperCase();
    const colors = ['#81b64c', '#38bdf8', '#fbbf24', '#f43f5e', '#a855f7', '#ec4899'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    const color = colors[Math.abs(hash) % colors.length];
    return { initials, color };
  }

  /**
   * renderTeamCard: Esports 'Intelligence Card' Panel
   */
  function renderTeamCard(team, tournament, rank) {
    const { initials, color } = getTeamMonogram(team.name);
    const isLive = tournament.status === 'ongoing' && tournament.currentRound > 0;
    
    return `
      <div class="intelligence-card ${isLive ? 'live-pulse-border' : ''}" style="--team-glow: ${color}">
        <div class="identity-glow"></div>
        
        <div class="card-main-header">
          <div class="team-brand-stack">
            <div class="brand-monogram" style="background: ${color}">${initials}</div>
            <div class="team-info">
              <div class="team-title-hub">${team.name}</div>
              <div style="font-size: 0.65rem; color: var(--hub-accent); font-weight: 800; letter-spacing: 1px; text-transform: uppercase;">
                RANK #${rank} <span style="margin: 0 4px; opacity: 0.3;">|</span> AVG ${team.avgRating || 'N/A'}
              </div>
            </div>
          </div>

          <div class="stat-badges-row">
            <div class="stat-badge mp-glow">
              <span class="badge-label">MATCH PTS</span>
              <span class="badge-value">${team.matchPoints || 0}</span>
            </div>
            <div class="stat-badge bp-outline">
              <span class="badge-label">BOARD PTS</span>
              <span class="badge-value">${team.boardPoints || 0}</span>
            </div>
          </div>
        </div>

        <div class="intelligence-roster">
          ${(team.players || []).slice(0, 4).map(p => {
            const rtg = parseInt(p.rating) || 0;
            const rtgClass = rtg >= 2200 ? 'rtg-elite' : (rtg >= 1800 ? 'rtg-pro' : 'rtg-club');
            return `
              <div class="mini-board-row">
                <span class="board-label-hub">B${p.boardNumber}</span>
                <span class="player-name-hub">${p.name || 'Vacant'}</span>
                <span class="player-rtg-hub ${rtgClass}">${rtg}</span>
              </div>
            `;
          }).join('')}
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 0.5rem; border-top: 1px solid rgba(255,255,255,0.05);">
          <div style="display: flex; gap: 0.75rem;">
            <div class="text-muted" style="font-size: 0.6rem; font-weight: 800; text-transform: uppercase;">TB: ${team.buchholz || 0}</div>
            <div class="text-muted" style="font-size: 0.6rem; font-weight: 800; text-transform: uppercase;">TSB: ${team.sonnebornBerger || 0}</div>
          </div>
          <button class="btn btn-secondary btn-xs" onclick="UI.renderTeamModal(null, ${JSON.stringify(team).replace(/"/g, '&quot;')})" style="border: none; background: rgba(255,255,255,0.05); font-size: 0.6rem; font-weight: 900;">INTEL ➔</button>
        </div>
      </div>
    `;
  }

  function renderTeamGrid(teams, tournament, playerMap) {
    if (teams.length === 0) {
      return '<div class="card" style="padding: 4rem; text-align: center; color: var(--text-muted); background: var(--hub-card-bg);">No squads detected in registry.</div>';
    }

    const sorted = [...teams].sort((a, b) => 
      (b.matchPoints || 0) - (a.matchPoints || 0) || 
      (b.boardPoints || 0) - (a.boardPoints || 0) ||
      (b.buchholz || 0) - (a.buchholz || 0)
    );

    return `
      <div class="team-grid">
        ${sorted.map((t, i) => renderTeamCard(t, tournament, i + 1)).join('')}
      </div>
    `;
  }

  async function renderTeamsTab(el, tournament) {
    const teams = await DB.getAllTeams(tournament.id);
    const snap = await db.collection('tournaments').doc(tournament.id).collection('playerData').get();
    const players = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const playerMap = Object.fromEntries(players.map(p => [p.id, p]));

    el.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
        <div>
          <h3 style="margin: 0; font-size: 1.5rem; font-weight: 900;">Team Battlefront</h3>
          <p class="text-muted" style="font-size: 0.8rem; letter-spacing: 0.5px; text-transform: uppercase;">${teams.length} Squads Registered</p>
        </div>
        <button class="btn btn-primary btn-sm glow-btn" id="btn-create-team" style="padding: 0.6rem 1.5rem;">+ Add New Team</button>
      </div>
      
      ${renderTeamGrid(teams, tournament, playerMap)}
    `;

    document.getElementById('btn-create-team')?.addEventListener('click', () => UI.renderTeamModal(tournament));
  }


  /**
   * renderTeamModal: Command Center Roster Builder
   * Concepts: Identity Branding, FIDE Board Lock, and SaaS Analytics.
   */
  async function renderTeamModal(tournament, existingTeam = null) {
    if (!tournament) tournament = window.activeTournament;
    const container = document.getElementById('modal-container');
    container.innerHTML = '';

    const maxLimit = tournament.maxTeamAvgRating || 9999;
    const teamSize = tournament.teamSize || 4;

    // ── ⚙️ Reactive Team State ──
    let state = {
      name: existingTeam?.name || '',
      seeding: existingTeam?.seeding || '',
      players: existingTeam ? [...existingTeam.players] : Array.from({ length: teamSize }).map((_, i) => ({
        boardNumber: i + 1, id: null, name: '', rating: 0, isReserve: false,
        mode: 'roster', source: 'manual'
      })),
      brand: getTeamMonogram(existingTeam?.name || 'New Squad')
    };

    // Hydrate state
    state.players.forEach(p => {
      if (!p.mode) p.mode = p.id?.startsWith('temp_') ? 'manual' : 'roster';
      if (!p.source) p.source = p.id?.startsWith('temp_') ? 'manual' : 'club';
    });

    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.innerHTML = `
      <div class="modal fade-in registration-hub-modal" style="width: 95%; max-width: 1000px; padding: 0; overflow: hidden;">
        
        <!-- 🛰️ Sticky Command Header -->
        <div class="hub-sticky-header">
          <div style="display: flex; align-items: center; gap: 1.5rem;">
            <div id="hub-branding-monogram" class="brand-monogram" style="background: ${state.brand.color}; width: 64px; height: 64px; font-size: 1.8rem;">
              ${state.brand.initials}
            </div>
            <div>
              <h2 id="hub-branding-title" class="team-title-hub" style="font-size: 1.6rem;">${state.name || 'UNNAMED SQUAD'}</h2>
              <div class="text-muted" style="font-size: 0.7rem; text-transform: uppercase; letter-spacing: 2px;">Roster Intel Synchronization</div>
            </div>
          </div>

          <div class="hub-analytics-grid">
            <div class="hub-metric">
              <span class="metric-label">TEAM AVG</span>
              <span id="hub-avg" class="metric-value">0</span>
            </div>
            <div class="hub-metric">
              <span class="metric-label">DENSITY</span>
              <span id="hub-density" class="metric-value">0 / ${teamSize}</span>
            </div>
            <div class="hub-metric">
              <span class="metric-label">CEILING</span>
              <span class="metric-value" style="opacity: 0.3;">${maxLimit}</span>
            </div>
          </div>

          <button class="btn btn-secondary btn-sm" onclick="document.getElementById('modal-container').innerHTML = ''" style="border-radius: 50%; width: 32px; height: 32px;">✕</button>
        </div>

        <div class="modal-body" style="padding: 0 2rem 2rem; max-height: 70vh; overflow-y: auto;">
          <form id="hub-registration-form">
            <div style="display: grid; grid-template-columns: 2.5fr 1fr; gap: 2rem; margin-bottom: 3rem;">
              <div class="form-group">
                <label class="metric-label">Squad Designation</label>
                <input type="text" id="hub-name-input" class="form-input" value="${state.name}" placeholder="Enter Team Name..." style="font-size: 1.2rem; font-weight: 800; background: rgba(255,255,255,0.03); border-color: rgba(255,255,255,0.1);">
              </div>
              <div class="form-group">
                <label class="metric-label">Initial Seeding</label>
                <input type="number" id="hub-seeding-input" class="form-input" value="${state.seeding}" placeholder="Rank #">
              </div>
            </div>

            <div class="flex justify-between items-center mb-6">
              <h4 style="margin: 0; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 4px; color: var(--hub-accent); font-weight: 900;">Tactical Assignments</h4>
              <button type="button" class="btn btn-secondary btn-xs" id="hub-add-reserve" style="border-style: dashed; padding: 0.5rem 1.5rem;">+ SUB-PLAYER</button>
            </div>

            <div id="hub-roster-list">
              <!-- Board Cards Injected Here -->
            </div>
          </form>
        </div>

        <div class="modal-footer" style="background: rgba(0,0,0,0.4); padding: 2rem; border-top: 1px solid rgba(255,255,255,0.05);">
          <div class="flex gap-6 items-center">
            <button class="btn btn-secondary" onclick="document.getElementById('modal-container').innerHTML = ''" style="font-weight: 800;">ABORT</button>
            <button class="finalize-command-btn" id="hub-save-btn">
              ${existingTeam ? 'UPDATE SQUAD' : 'DEPLOY SQUAD'}
            </button>
          </div>
        </div>
      </div>
    `;
    container.appendChild(modal);

    const rosterList = document.getElementById('hub-roster-list');
    const hubAvg = document.getElementById('hub-avg');
    const hubDensity = document.getElementById('hub-density');
    const brandingMonogram = document.getElementById('hub-branding-monogram');
    const brandingTitle = document.getElementById('hub-branding-title');

    function renderRoster() {
      rosterList.innerHTML = state.players.map((p, idx) => {
        // FIDE Board Lock Check: Is this player rated lower than the one below them?
        let orderLockError = false;
        if (!p.isReserve && idx < teamSize - 1) {
          const next = state.players[idx + 1];
          if (next && !next.isReserve && next.rating > p.rating && p.rating > 0) {
            orderLockError = true;
          }
        }

        return `
          <div class="board-card ${p.isReserve ? 'reserve-card' : ''} ${orderLockError ? 'fide-warning-glow' : ''}" draggable="true" data-index="${idx}">
            <div class="drag-handle">⠿</div>
            
            <div class="board-badge" style="background: rgba(0,0,0,0.3); border-color: ${orderLockError ? 'var(--hub-danger)' : 'rgba(255,255,255,0.1)'}">
              ${p.isReserve ? 'S' : p.boardNumber}
            </div>

            <div class="smart-hybrid-input" style="flex: 1;">
              <div class="ghost-mode-toggle">
                <button type="button" class="ghost-btn ${p.mode === 'roster' ? 'active' : ''}" data-mode="roster" data-index="${idx}">SEARCH</button>
                <button type="button" class="ghost-btn ${p.mode === 'manual' ? 'active manual' : ''}" data-mode="manual" data-index="${idx}">GUEST</button>
              </div>
              
              <div style="flex: 1; position: relative;">
                <input type="text" class="form-input p-name-hub" 
                  placeholder="${p.mode === 'roster' ? 'Roster DB Search...' : 'Guest Persona'}" 
                  value="${p.name}" data-index="${idx}" ${p.mode === 'roster' && p.id ? 'readonly' : ''}
                  style="background: none; border: none; font-weight: 700;">
                <div class="autocomplete-results" id="hub-results-${idx}"></div>
              </div>

              ${p.id && p.mode === 'roster' ? `<button type="button" class="btn btn-secondary btn-xs clear-player" data-index="${idx}" style="margin: 0 0.5rem; background: none; border: none;">✕</button>` : ''}
            </div>

            <div style="width: 100px;">
              <input type="number" class="form-input p-rating" value="${p.rating}" data-index="${idx}" 
                style="text-align: center; font-weight: 900; color: var(--hub-sapphire); background: rgba(0,0,0,0.2); border-color: rgba(255,255,255,0.1);">
            </div>

            <button type="button" class="btn btn-secondary btn-xs hub-remove-row" data-index="${idx}" style="color: var(--hub-danger); border: none; font-size: 1.2rem; background: none;">🗑️</button>
          </div>
        `;
      }).join('');
      updateAnalytics();
      attachEvents();
    }

    function updateAnalytics() {
      const active = state.players.filter(p => !p.isReserve && p.name);
      const totalRating = active.reduce((sum, p) => sum + (parseInt(p.rating) || 0), 0);
      const avg = active.length > 0 ? Math.round(totalRating / teamSize) : 0;

      hubAvg.innerText = avg;
      hubDensity.innerText = `${active.length} / ${teamSize}`;

      if (avg > maxLimit) hubAvg.style.color = 'var(--hub-danger)';
      else hubAvg.style.color = 'var(--hub-accent)';
    }

    function attachEvents() {
      // Identity & Branding Real-time
      document.getElementById('hub-name-input').addEventListener('input', (e) => {
        state.name = e.target.value;
        const brand = getTeamMonogram(state.name || 'New Squad');
        brandingMonogram.innerText = brand.initials;
        brandingMonogram.style.background = brand.color;
        brandingTitle.innerText = state.name || 'UNNAMED SQUAD';
      });

      // Hybrid Toggle
      rosterList.querySelectorAll('.ghost-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = btn.dataset.index;
          const newMode = btn.dataset.mode;
          if (state.players[idx].mode === newMode) return;

          state.players[idx] = {
            ...state.players[idx],
            id: null, name: '', rating: 0,
            mode: newMode, source: newMode === 'manual' ? 'manual' : 'club'
          };
          renderRoster();
        });
      });

      // Clear
      rosterList.querySelectorAll('.clear-player').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = btn.dataset.index;
          state.players[idx] = { ...state.players[idx], id: null, name: '', rating: 0 };
          renderRoster();
        });
      });

      // Name & Search
      rosterList.querySelectorAll('.p-name-hub').forEach(input => {
        input.addEventListener('input', async (e) => {
          const idx = e.target.dataset.index;
          const query = e.target.value;
          const resultsDiv = document.getElementById(`hub-results-${idx}`);
          
          if (state.players[idx].mode === 'manual') {
            state.players[idx].name = query;
            updateAnalytics();
            return;
          }

          if (query.length < 2) {
            resultsDiv.classList.remove('active');
            return;
          }

          const snap = await db.collection('members').get();
          const matches = snap.docs.map(d => ({ id: d.id, ...d.data() }))
            .filter(m => m.name.toLowerCase().includes(query.toLowerCase()))
            .slice(0, 5);

          if (matches.length > 0) {
            resultsDiv.innerHTML = matches.map(m => `
              <div class="result-item" data-mid="${m.id}" data-name="${m.name}" data-rtg="${m.ratings?.club || 1200}">
                <div class="name">${m.name}</div>
                <div class="meta">Rating: ${m.ratings?.club || 1200}</div>
              </div>
            `).join('');
            resultsDiv.classList.add('active');
          } else {
            resultsDiv.classList.remove('active');
          }
        });
      });

      // Selection
      rosterList.addEventListener('click', (e) => {
        const item = e.target.closest('.result-item');
        if (item) {
          const idx = item.closest('.board-card').dataset.index;
          const data = item.dataset;
          if (state.players.some((p, i) => i != idx && p.id === data.mid)) {
            return UI.showToast(`Tactical Conflict: Player already assigned.`, 'error');
          }
          state.players[idx] = { ...state.players[idx], id: data.mid, name: data.name, rating: parseInt(data.rtg), source: 'club' };
          renderRoster();
        }

        if (e.target.closest('.hub-remove-row')) {
          const idx = e.target.closest('.hub-remove-row').dataset.index;
          state.players.splice(idx, 1);
          let bNum = 0;
          state.players.forEach(p => { if (!p.isReserve) p.boardNumber = ++bNum; });
          renderRoster();
        }
      });

      // Rating
      rosterList.querySelectorAll('.p-rating').forEach(input => {
        input.addEventListener('change', (e) => {
          const idx = e.target.dataset.index;
          state.players[idx].rating = parseInt(e.target.value) || 0;
          renderRoster(); // Re-render for order lock check
        });
      });

      // Drag & Drop
      let draggedIdx = null;
      rosterList.querySelectorAll('.board-card').forEach(card => {
        card.addEventListener('dragstart', () => {
          draggedIdx = parseInt(card.dataset.index);
          card.classList.add('dragging');
        });
        card.addEventListener('dragend', () => card.classList.remove('dragging'));
        card.addEventListener('dragover', (e) => {
          e.preventDefault();
          const overCard = e.target.closest('.board-card');
          if (!overCard) return;
          const overIdx = parseInt(overCard.dataset.index);
          if (overIdx === draggedIdx) return;

          const temp = state.players[draggedIdx];
          state.players.splice(draggedIdx, 1);
          state.players.splice(overIdx, 0, temp);
          
          let bNum = 0;
          state.players.forEach(p => { if (!p.isReserve) p.boardNumber = ++bNum; });
          draggedIdx = overIdx;
          renderRoster();
        });
      });
    }

    document.getElementById('hub-add-reserve').addEventListener('click', () => {
      state.players.push({ boardNumber: 0, id: null, name: '', rating: 0, isReserve: true, mode: 'roster', source: 'manual' });
      renderRoster();
    });

    document.getElementById('hub-save-btn').addEventListener('click', async () => {
      if (!state.name) return UI.showToast("Squad designation required", "error");
      const activeCount = state.players.filter(p => p.name && !p.isReserve).length;
      if (activeCount < teamSize) return UI.showToast(`Minimum ${teamSize} tactical units required`, "error");

      UI.showLoading("Transmitting Tactical Registry...");
      try {
        const finalPlayers = state.players.map(p => {
          if (!p.id) p.id = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
          return p;
        });

        const teamData = {
          name: state.name,
          seeding: parseInt(document.getElementById('hub-seeding-input').value) || null,
          players: finalPlayers,
          playerIds: finalPlayers.map(p => p.id),
          avgRating: parseInt(hubAvg.innerText),
          updatedAt: Date.now()
        };

        if (existingTeam) await DB.updateTeam(tournament.id, existingTeam.id, teamData);
        else await DB.createTeam(tournament.id, teamData);

        UI.showToast("Command Registry Synchronized", "success");
        document.getElementById('modal-container').innerHTML = '';
        renderTournamentTab('teams', tournament);
      } catch (err) {
        UI.showToast("Registry Failure: " + err.message, "error");
      } finally {
        UI.hideLoading();
      }
    });

    renderRoster();
  }


        /**
         * Prevents players from joining multiple teams in the same tournament.
         */
        async function checkTeamConflicts(tournamentId, playerIds, currentTeamId = null) {
          const teams = await DB.getTournamentTeams(tournamentId);
          for (const team of teams) {
            if (currentTeamId && team.id === currentTeamId) continue;
            for (const pid of playerIds) {
              if (team.playerIds && team.playerIds.includes(pid)) {
                const players = await DB.getTournamentPlayers(tournamentId);
                const p = players.find(x => x.id === pid);
                return { playerName: p ? p.name : pid, teamName: team.name };
              }
            }
          }
          return null;
        }

        async function renderTeamEditModal(tournamentId, teamId) {
          const container = document.getElementById('modal-container');
          if (!container) return;
          container.innerHTML = '';

          try {
            showLoading();
            const tournament = await DB.getTournament(tournamentId);
            const team = await DB.getTeam(tournamentId, teamId);

            if (!team) {
              hideLoading();
              return showToast('Error: Team not found in database.', 'error');
            }

            const snap = await db.collection('tournaments').doc(tournamentId).collection('playerData').get();
            const players = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            const teamSize = tournament.teamSize || 4;

            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay active';
            overlay.innerHTML = `
        <div class="modal fade-in" style="max-width: 650px;">
          <div class="modal-header">
            <h2 class="card-title">Manage Team: ${team.name || 'Unnamed Team'}</h2>
            <button class="btn btn-secondary btn-sm" onclick="document.getElementById('modal-container').innerHTML = ''">✕</button>
          </div>
          <div class="modal-body" style="max-height: 70vh; overflow-y: auto;">
            <div class="form-group mb-6">
              <label>Team Name</label>
              <input type="text" id="tm-edit-name" class="form-input" value="${team.name || ''}" style="font-weight: 800;">
            </div>

            <div id="edit-warning" style="display: none; background: rgba(244, 63, 94, 0.1); border: 1px solid var(--accent-danger); color: var(--accent-danger); padding: 1rem; border-radius: var(--radius-sm); margin-bottom: 1.5rem; font-size: 0.8rem; font-weight: 700;">
              ⚠️ Warning
            </div>

            <div class="flex justify-between items-center mb-4">
              <h4 style="margin: 0; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; color: var(--accent-primary); font-weight: 900;">Board Assignments</h4>
              <button type="button" class="btn btn-secondary btn-xs" id="btn-edit-auto-sort">⚡ Auto-Sort</button>
            </div>
            
            <div id="board-assignments" style="display: grid; gap: 0.75rem; margin-bottom: 2rem;">
              ${Array.from({ length: teamSize }).map((_, i) => `
                <div style="display: flex; gap: 1rem; align-items: center;">
                  <span style="font-weight: 900; color: var(--accent-primary); width: 25px;">${i + 1}</span>
                  <select class="form-input board-p-select" data-board="${i + 1}" style="flex: 1;">
                    <option value="">-- Vacant --</option>
                    ${players.map(p => `<option value="${p.id}" ${team.playerIds?.[i] === p.id ? 'selected' : ''} data-rtg="${p.selectedRating || 0}">${p.name} (${p.selectedRating || 0})</option>`).join('')}
                  </select>
                </div>
              `).join('')}
            </div>

            <h4 style="margin: 0 0 1rem; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; color: #64748b; font-weight: 900;">Reserve Players</h4>
            <div id="reserve-assignments" style="display: grid; gap: 0.75rem;">
              ${Array.from({ length: 2 }).map((_, i) => `
                <div style="display: flex; gap: 1rem; align-items: center;">
                  <span style="font-weight: 900; color: #475569; width: 25px;">R${i + 1}</span>
                  <select class="form-input reserve-p-select" style="flex: 1;">
                    <option value="">-- Optional Substitute --</option>
                    ${players.map(p => `<option value="${p.id}" ${team.reserveIds?.[i] === p.id ? 'selected' : ''} data-rtg="${p.selectedRating || 0}">${p.name} (${p.selectedRating || 0})</option>`).join('')}
                  </select>
                </div>
              `).join('')}
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" onclick="document.getElementById('modal-container').innerHTML = ''">Cancel</button>
            <button class="btn btn-primary" id="btn-update-team">Save Changes</button>
          </div>
        </div>`;
            container.appendChild(overlay);

            const boardSelects = overlay.querySelectorAll('.board-p-select');
            const reserveSelects = overlay.querySelectorAll('.reserve-p-select');
            const warning = document.getElementById('edit-warning');
            const updateBtn = document.getElementById('btn-update-team');

            const validate = () => {
              const selectedIds = new Set();
              const boardRatings = [];
              let filled = 0;

              boardSelects.forEach(s => {
                if (s.value) {
                  filled++;
                  selectedIds.add(s.value);
                  boardRatings.push(parseInt(s.options[s.selectedIndex]?.dataset.rtg || 0));
                }
              });
              reserveSelects.forEach(s => { if (s.value) selectedIds.add(s.value); });

              const hasDuplicates = selectedIds.size < (filled + Array.from(reserveSelects).filter(s => s.value).length);
              let orderError = false;
              for (let i = 0; i < boardRatings.length - 1; i++) {
                if (boardRatings[i] < boardRatings[i + 1]) { orderError = true; break; }
              }

              warning.style.display = (hasDuplicates || orderError) ? 'block' : 'none';
              if (hasDuplicates) warning.innerText = `⚠️ Duplicate players detected!`;
              else if (orderError) warning.innerText = `⚠️ Board Order Lock: Sort the roster by rating.`;

              updateBtn.disabled = filled !== teamSize || hasDuplicates || orderError;
            };

            boardSelects.forEach(s => s.addEventListener('change', validate));
            reserveSelects.forEach(s => s.addEventListener('change', validate));

            document.getElementById('btn-edit-auto-sort').addEventListener('click', () => {
              const cur = Array.from(boardSelects).map(s => ({ id: s.value, rtg: parseInt(s.options[s.selectedIndex]?.dataset.rtg || 0) })).filter(x => x.id);
              cur.sort((a, b) => b.rtg - a.rtg);
              boardSelects.forEach((s, i) => { s.value = cur[i]?.id || ''; });
              validate();
            });

            updateBtn.addEventListener('click', async () => {
              const name = document.getElementById('tm-edit-name').value;
              const bIds = Array.from(boardSelects).map(s => s.value);
              const rIds = Array.from(reserveSelects).map(s => s.value).filter(v => v);

              try {
                showLoading();
                const cleanIds = [...bIds, ...rIds];
                const conflict = await checkTeamConflicts(tournamentId, cleanIds, teamId);
                if (conflict) {
                  showToast(`Conflict: ${conflict.playerName} is in ${conflict.teamName}`, 'error');
                  return;
                }

                const teamPlayers = [];
                bIds.forEach((pId, i) => {
                  const pObj = players.find(p => p.id === pId);
                  if (pObj) {
                    teamPlayers.push({
                      id: pId,
                      name: pObj.name,
                      boardNumber: i + 1,
                      rating: pObj.selectedRating || 0
                    });
                  }
                });

                await DB.updateTeam(tournamentId, teamId, {
                  name,
                  playerIds: bIds,
                  reserveIds: rIds,
                  players: teamPlayers,
                  avgRating: Math.round(teamPlayers.reduce((sum, p) => sum + p.rating, 0) / teamSize)
                });
                document.getElementById('modal-container').innerHTML = '';
                showToast('Team updated successfully', 'success');
                renderTournamentTab('teams', tournament);
              } catch (err) { showToast(err.message, 'error'); }
              finally { hideLoading(); }
            });
          } catch (err) {
            showToast('Critical error loading editor.', 'error');
          } finally {
            hideLoading();
          }
        }

        // ── CLUB ROSTER PAGE ──
        async function renderRosterPage() {
          showLoading();
          const members = await ClubMembers.getAllMembers();
          hideLoading();

          const content = `
      <div class="roster-toolbar">
        <div class="toolbar-search-group">
          <input type="text" id="roster-search" placeholder="Search members by name or ID..." class="roster-search-input">
        </div>
        <button class="btn btn-primary" id="btn-add-member">
          <span style="font-size: 1.2rem; margin-right: 8px;">+</span> Add Member
        </button>
      </div>

      <div class="roster-card">
        <div class="table-wrap">
          <table id="roster-table" class="roster-table">
            <thead>
              <tr>
                <th>Player Identity</th>
                <th>FIDE ID</th>
                <th>Club Elo</th>
                <th>Activity</th>
                <th>Status</th>
                <th style="text-align: right;">Management</th>
              </tr>
            </thead>
            <tbody id="roster-table-body">
              ${members.map(m => `
                <tr data-id="${m.id}" class="member-row">
                  <td>
                    <div class="player-identity-cell">
                      <div class="player-avatar">${m.name[0]}</div>
                      <div class="player-info">
                        <span class="player-name-link clickable-name" data-id="${m.id}">${m.name}</span>
                        <div class="rating-pill-group">
                          ${m.fideRating ? `<span class="rating-badge">FIDE: ${m.fideRating}</span>` : ''}
                          ${m.ncfpRating ? `<span class="rating-badge">NCFP: ${m.ncfpRating}</span>` : ''}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td class="mono-text">${m.fideId || '—'}</td>
                  <td class="mono-text score-hero">${m.ratings?.club || 1200}</td>
                  <td class="mono-text">${m.tournamentsPlayed || 0} Games</td>
                  <td>
                    <span class="status-pill ${m.status === 'active' ? 'active' : 'inactive'}">
                      ${m.status}
                    </span>
                  </td>
                  <td style="text-align: right;">
                    <div class="action-ghost-group">
                      <button class="btn-ghost-sm history-btn" data-id="${m.id}">History</button>
                      <button class="btn-ghost-sm edit-member" data-id="${m.id}">Edit</button>
                      <button class="btn-ghost-danger-sm delete-member" data-id="${m.id}">🗑️</button>
                    </div>
                  </td>
                </tr>`).join('')}
              ${members.length === 0 ? '<tr><td colspan="6" class="empty-state">No members found in database.</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      </div>
    `;
          renderLayout('Member Management', content, 'roster');

          document.getElementById('btn-add-member').addEventListener('click', () => UI.renderMemberModal());

          document.getElementById('roster-search').addEventListener('input', e => {
            const q = e.target.value.toLowerCase();
            document.querySelectorAll('.member-row').forEach(row => {
              row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
            });
          });

          // --- EVENT DELEGATION FOR ROSTER ACTIONS ---
          const tableBody = document.getElementById('roster-table-body');
          if (tableBody) {
            tableBody.onclick = async (e) => {
              const target = e.target;
              const id = target.getAttribute('data-id');

              // A. Handle History Button
              if (target.classList.contains('history-btn')) {
                e.preventDefault();

                // Diagnostic Log
                console.log("[Diagnostic] User clicked 'VIEW HISTORY' for Member ID: " + id);

                if (!id || id === 'undefined' || id === 'null') {
                  alert('DATABASE ERROR: No ID found for this member.');
                  return;
                }

                UI.showLoading();
                try {
                  const member = await DB.getClubMember(id);
                  const historyArray = await DB.getFullMemberHistory(id);
                  UI.openHistoryModal(member, historyArray);
                } catch (err) {
                  UI.showToast('Failed to load history', 'error');
                } finally {
                  UI.hideLoading();
                }
              }

              // B. Handle Clickable Name (Open Portal)
              if (target.classList.contains('clickable-name')) {
                if (id) UI.openMemberPortal(id);
              }
            };
          }

          for (const btn of document.querySelectorAll('.edit-member')) {
            btn.addEventListener('click', async () => {
              const m = await ClubMembers.getMember(btn.dataset.id);
              UI.renderMemberModal(m);
            });
          }

          for (const btn of document.querySelectorAll('.delete-member')) {
            btn.addEventListener('click', async () => {
              const m = await ClubMembers.getMember(btn.dataset.id);
              if (!confirm(`Are you sure you want to remove ${m.name}?`)) return;

              try {
                showLoading();
                const res = await ClubMembers.removeMember(m.id);
                showToast(res.action === 'deactivated' ? 'Member deactivated (history preserved)' : 'Member deleted', 'success');
                renderRosterPage();
              } catch (err) { showToast(err.message, 'error'); }
              finally { hideLoading(); }
            });
          }
        }

        // ── SETTINGS PAGE ──
        async function renderSettingsPage() {
          const user = Auth.getUser();
          const config = await db.collection('system').doc('config').get().then(d => d.data() || {});

          const content = `
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-label">System Arbiter</div>
          <div class="stat-value" style="font-size: 1.125rem;">${user?.email || 'Jesstergirado@admin'}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Subscription Status</div>
          <div class="stat-value"><span class="badge badge-success">Enterprise Active</span></div>
        </div>
      </div>

      <div class="grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;">
        <div class="card">
          <div class="card-header"><h3 class="card-title">Cloud Storage Backup</h3></div>
          <div class="modal-body">
            <p class="text-muted text-sm mb-4">Sync tournament PGNs and database snapshots to Google Drive.</p>
            <div class="form-group">
              <label>Google Drive API Key</label>
              <input type="password" id="s-drive-key" value="${config.driveKey || '••••••••••••••••'}" class="form-input">
            </div>
            <div class="form-group">
              <label>Backup Interval</label>
              <select id="s-backup-freq" class="form-input">
                <option value="daily">Every 24 Hours</option>
                <option value="round">After Every Round</option>
              </select>
            </div>
            <button class="btn btn-secondary btn-drive-sync" onclick="UI.showToast('Manual Sync Started...', 'info')">
              <span>🔄</span> Force Cloud Backup
            </button>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><h3 class="card-title">Admin Billing (GCash)</h3></div>
          <div class="modal-body">
            <p class="text-muted text-sm mb-4">Manage the $5.00 admin paywall and arbiter access fees.</p>
            <div class="form-group">
              <label>GCash Merchant ID</label>
              <input type="text" id="s-gcash-id" value="${config.gcashId || '9823-TABUKO-CHESS'}" class="form-input">
            </div>
            <div class="form-group">
              <label>Webhook Secret</label>
              <input type="password" id="s-gcash-secret" value="••••••••" class="form-input">
            </div>
            <div style="padding: 1rem; background: #fef2f2; border-radius: var(--radius-md); border: 1px solid #fecaca;">
              <p style="color: #991b1b; font-size: 0.75rem; font-weight: 600;">Next billing cycle: June 01, 2026</p>
            </div>
          </div>
        </div>
      </div>

      <div class="flex justify-end mt-4 gap-2">
        <button class="btn btn-secondary" onclick="UI.purgeGuestHistory()">Purge Guest History</button>
        <button class="btn btn-primary" id="btn-save-settings">Save System Configuration</button>
      </div>
    `;
          renderLayout('System Settings', content, 'settings');

          document.getElementById('btn-save-settings').addEventListener('click', async () => {
            try {
              showLoading();
              await db.collection('system').doc('config').set({
                driveKey: document.getElementById('s-drive-key').value,
                driveFreq: document.getElementById('s-backup-freq').value,
                gcashId: document.getElementById('s-gcash-id').value,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
              }, { merge: true });
              showToast('Settings saved successfully', 'success');
            } catch (err) { showToast(err.message, 'error'); }
            finally { hideLoading(); }
          });
        }

        async function purgeGuestHistory() {
          if (!confirm('This will permanently delete all guest players from the Visitor Registry who are older than 30 days. This action is part of the system retention policy. Continue?')) return;
          try {
            showLoading();
            const count = await ClubMembers.cleanupRegistry();
            showToast(`Cleaned up ${count} old visitor records`, 'success');
          } catch (err) { showToast(err.message, 'error'); }
          finally { hideLoading(); }
        }

        function renderEditTournamentModal(tournament) {
          const container = document.getElementById('modal-container');
          container.innerHTML = '';

          const overlay = document.createElement('div');
          overlay.className = 'modal-overlay active';
          overlay.innerHTML = `
      <div class="modal fade-in">
        <div class="modal-header">
          <h2 class="card-title">Edit Tournament</h2>
          <button class="btn btn-secondary btn-sm" onclick="document.getElementById('modal-container').innerHTML = ''">✕</button>
        </div>
        <div class="modal-body">
          <form id="edit-t-form">
            <div class="form-group">
              <label>Tournament Name</label>
              <input type="text" id="et-name" class="form-input" value="${tournament.name}" required>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
              <div class="form-group">
                <label>Total Rounds</label>
                <input type="number" id="et-rounds" class="form-input" value="${tournament.totalRounds}" min="1">
              </div>
              <div class="form-group">
                <label>Seeding Strategy</label>
                <select id="et-seeding" class="form-input">
                  <option value="top_vs_bottom" ${tournament.seedingStrategy === 'top_vs_bottom' ? 'selected' : ''}>Top vs Bottom</option>
                  <option value="top_vs_middle" ${tournament.seedingStrategy === 'top_vs_middle' ? 'selected' : ''}>Top vs Middle</option>
                </select>
              </div>
            </div>
            <div style="padding: 1rem; background: rgba(244, 63, 94, 0.1); border: 1px solid var(--accent-danger); border-radius: var(--radius-md); margin-top: 1rem;">
              <p style="color: var(--accent-danger); font-size: 0.75rem;"><strong>Warning:</strong> This action is irreversible.</p>
              <button type="button" class="btn btn-danger btn-sm mt-2" id="btn-delete-tournament">Delete Tournament</button>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="document.getElementById('modal-container').innerHTML = ''">Cancel</button>
          <button class="btn btn-primary" id="btn-save-edit-t">Save Changes</button>
        </div>
      </div>`;
          container.appendChild(overlay);

          document.getElementById('btn-save-edit-t').addEventListener('click', async () => {
            try {
              showLoading();
              await Tournament.editTournament(tournament.id, {
                name: document.getElementById('et-name').value,
                totalRounds: parseInt(document.getElementById('et-rounds').value),
                seedingStrategy: document.getElementById('et-seeding').value
              });
              overlay.remove();
              showToast('Tournament updated', 'success');
              App.navigateTo('tournament', tournament.id);
            } catch (err) { showToast(err.message, 'error'); }
            finally { hideLoading(); }
          });

          document.getElementById('btn-delete-tournament').addEventListener('click', async () => {
            UI.confirmDeleteTournament(tournament.id);
          });
        }

        // ── AUDIT LOG PAGE ──
        async function renderAuditLogPage() {
          showLoading();
          const logs = await AuditLog.getRecentLogs(100);
          hideLoading();

          const content = `
      <div class="flex justify-between items-center mb-4">
        <div>
          <h2 class="card-title">System Audit Trail</h2>
          <p class="text-muted text-sm">Immutable record of all arbiter actions.</p>
        </div>
        <div class="flex gap-2">
          <select id="log-filter-action" class="form-input" style="width: 200px;">
            <option value="">All Actions</option>
            ${Object.values(AuditLog.ACTIONS).map(a => `<option value="${a}">${a.replace(/_/g, ' ')}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="card">
        <div class="table-wrap">
          <table id="audit-table">
            <thead>
              <tr>
                <th style="width: 180px;">Timestamp</th>
                <th>Arbiter</th>
                <th>Action</th>
                <th>Tournament</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody id="audit-body">
              ${logs.map(l => {
            const isDelete = l.action === 'TOURNAMENT_DELETED' || l.action === 'CLUB_MEMBER_DELETED';
            const targetColl = l.action === 'TOURNAMENT_DELETED' ? 'tournaments' : 'players';
            const docId = l.details?.id || l.details?.docId || l.tournamentId;

            return `
                <tr class="log-row" data-action="${l.action}" data-tid="${l.tournamentId || ''}">
                  <td class="text-muted text-sm">${new Date(l.clientTimestamp).toLocaleString()}</td>
                  <td style="font-weight: 600;">${l.adminEmail}</td>
                  <td>
                    <div class="flex items-center gap-2">
                      <span class="badge ${l.action.includes('DELETED') ? 'badge-danger' : l.action.includes('CREATED') ? 'badge-success' : 'badge-info'}">${l.action}</span>
                      ${isDelete && docId ? `<button class="btn btn-secondary btn-sm undo-btn" data-coll="${targetColl}" data-id="${docId}" style="padding: 2px 8px; font-size: 0.7rem; color: var(--accent-warning); border-color: var(--accent-warning);">Undo ↩</button>` : ''}
                    </div>
                  </td>
                  <td class="text-sm">${l.tournamentId ? `<span class="badge badge-warning" style="font-size: 0.6rem;">${l.tournamentId.slice(-6)}</span>` : '-'}</td>
                  <td class="text-sm" style="max-width: 300px; white-space: normal;">
                    ${typeof l.details === 'string' ? l.details : JSON.stringify(l.details)}
                  </td>
                </tr>`;
          }).join('')}
              ${logs.length === 0 ? '<tr><td colspan="5" style="text-align:center; padding: 3rem;">No logs found.</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      </div>
    `;
          renderLayout('Audit Trail', content, 'settings');

          const filter = document.getElementById('log-filter-action');
          filter.addEventListener('change', () => {
            const val = filter.value;
            document.querySelectorAll('.log-row').forEach(row => {
              row.style.display = !val || row.dataset.action === val ? '' : 'none';
            });
          });

          document.querySelectorAll('.undo-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
              if (!confirm('Restore this item?')) return;
              try {
                showLoading();
                await AuditLog.undoAction(btn.dataset.coll, btn.dataset.id);
                showToast('Item restored successfully', 'success');
                renderAuditLogPage();
              } catch (err) { showToast(err.message, 'error'); }
              finally { hideLoading(); }
            });
          });
        }

        function printPairings() {
          const el = document.getElementById('tournament-tab-content');
          const title = document.querySelector('h1').innerText;
          const rd = document.querySelector('h3').innerText;

          // Add temporary print class to body for CSS scoping if needed
          document.body.classList.add('printing-active');

          const printWindow = window.open('', '_blank');
          printWindow.document.write(`
      <html>
        <head>
          <title>${title} - ${rd}</title>
          <link rel="stylesheet" href="css/style.css">
          <style>
            body { background: white !important; color: black !important; padding: 2rem; }
            .no-print, .btn, .badge, .sidebar, header { display: none !important; }
            table { border: 1px solid #000 !important; width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #000 !important; padding: 12px; color: black !important; }
            .card { border: none !important; box-shadow: none !important; }
          </style>
        </head>
        <body>
          <h1 style="margin-bottom: 5px;">${title}</h1>
          <h2 style="margin-top: 0;">${rd}</h2>
          <hr>
          ${el.innerHTML}
          <div style="margin-top: 2rem; font-size: 0.8rem; text-align: center;">
            Generated by Tabuko Chess Club — ${new Date().toLocaleString()}
          </div>
        </body>
      </html>
    `);
          printWindow.document.close();
          printWindow.focus();
          setTimeout(() => {
            printWindow.print();
            printWindow.close();
            document.body.classList.remove('printing-active');
          }, 500);
        }

        function printStandings() {
          const el = document.getElementById('tournament-tab-content');
          const title = document.querySelector('h1').innerText;

          const printWindow = window.open('', '_blank');
          printWindow.document.write(`
      <html>
        <head>
          <title>${title} - Final Standings</title>
          <link rel="stylesheet" href="css/style.css">
          <style>
            body { background: white !important; color: black !important; padding: 2rem; }
            .no-print, .btn, .badge, .sidebar, header { display: none !important; }
            table { border: 1px solid #000 !important; width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #000 !important; padding: 10px; color: black !important; font-size: 14px; }
            .rank { font-weight: bold; }
          </style>
        </head>
        <body>
          <h1>${title}</h1>
          <h2>Tournament Standings</h2>
          <hr>
          ${el.innerHTML}
          <div style="margin-top: 2rem; font-size: 0.8rem; text-align: center;">
            Official Record — Tabuko Chess Club
          </div>
        </body>
      </html>
    `);
          printWindow.document.close();
          printWindow.focus();
          setTimeout(() => {
            printWindow.print();
            printWindow.close();
          }, 500);
        }

        async function confirmDeleteTournament(id) {
          if (confirm('Are you sure you want to delete this tournament? This action is irreversible.')) {
            try {
              showLoading();
              await DB.deleteTournament(id);
              showToast('Tournament deleted successfully');
              App.navigateTo('dashboard');
            } catch (err) {
              showToast(err.message, 'error');
            } finally {
              hideLoading();
            }
          }
        }

        /**
         * PUBLIC LIVE VIEW: Spectator-optimized, read-only broadcast.
         */
        async function renderLiveView(tournamentId) {
          if (!tournamentId) return showToast('Invalid Tournament Link', 'error');
          showLoading();
          try {
            const tournament = await DB.getTournament(tournamentId);
            if (!tournament) throw new Error('Tournament not found');

            root().style.display = 'block';
            root().style.maxWidth = '1200px';
            root().style.margin = '0 auto';
            root().style.padding = '2rem';

            const rdNum = tournament.currentRound || 1;
            const roundData = await DB.getRound(tournamentId, rdNum);
            const standingsCache = await DB.getStandingsCache(tournamentId);
            const standings = standingsCache?.standings || [];
            const tbo = tournament.tieBreakOrder || ['buchholzCut1', 'sonnebornBerger', 'wins'];

            root().innerHTML = `
        <div class="live-broadcast-header" style="text-align: center; margin-bottom: 3rem;">
          <div style="font-size: 0.8rem; color: var(--accent-primary); font-weight: 800; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 0.5rem;">Live Broadcast</div>
          <h1 style="font-size: 2.5rem; margin-bottom: 0.5rem;">${tournament.name}</h1>
          <p class="text-muted">Round ${rdNum} in progress • Final results pending</p>
        </div>

        <div style="display: grid; gap: 2rem; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));">
          <div class="card">
            <h2 class="card-title">Current Pairings (RD ${rdNum})</h2>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style="width: 40px;">Bd</th>
                    <th style="text-align: right;">White</th>
                    <th style="text-align: center; width: 60px;">vs</th>
                    <th style="text-align: left;">Black</th>
                  </tr>
                </thead>
                <tbody>
                  ${roundData?.pairings?.map(p => `
                    <tr>
                      <td class="board-num">${p.board}</td>
                      <td style="text-align: right; font-weight: 700;">${p.whiteName} <br/><span class="text-muted text-xs">${p.whiteRating}</span></td>
                      <td style="text-align: center;">
                        ${p.result ? `<div class="badge badge-info">${p.result.whiteScore} - ${p.result.blackScore}</div>` : '<span class="text-muted text-xs">PENDING</span>'}
                      </td>
                      <td style="text-align: left; font-weight: 700;">${p.blackName} <br/><span class="text-muted text-xs">${p.blackRating}</span></td>
                    </tr>
                  `).join('') || '<tr><td colspan="4" class="text-center">Pairings pending...</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>

          <div class="card">
            <h2 class="card-title">Live Standings</h2>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style="width: 40px;">#</th>
                    <th>Player</th>
                    <th style="text-align: center;">Pts</th>
                    ${tbo.slice(0, 2).map(tb => `<th style="text-align: center;">${TB_ABBR[tb] || tb}</th>`).join('')}
                  </tr>
                </thead>
                <tbody>
                  ${standings.slice(0, 15).map(p => `
                    <tr>
                      <td style="font-weight: 800; color: var(--accent-primary);">${p.rank}</td>
                      <td style="font-weight: 700;">${p.name}</td>
                      <td style="text-align: center; font-weight: 800;">${p.score}</td>
                      ${tbo.slice(0, 2).map(tb => `<td style="text-align: center;" class="text-muted text-sm">${p.tieBreaks?.[tb] || 0}</td>`).join('')}
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;
          } catch (err) {
            showToast(err.message, 'error');
          } finally {
            hideLoading();
          }
        }

        function renderTournamentSettingsModal(tournament) {
          const container = document.getElementById('modal-container');
          container.innerHTML = '';

          const overlay = document.createElement('div');
          overlay.className = 'modal-overlay active';
          overlay.innerHTML = `
      <div class="modal fade-in" style="max-width: 500px;">
        <div class="modal-header">
          <h2 class="card-title">Tournament Management</h2>
          <button class="btn btn-secondary btn-sm" onclick="document.getElementById('modal-container').innerHTML = ''">✕</button>
        </div>
        <div class="modal-body">
          <div style="display: flex; flex-direction: column; gap: 1.5rem;">
            <div>
              <h4 class="text-xs uppercase font-bold text-muted mb-2">Edit Details</h4>
              <button class="btn btn-secondary w-full" onclick="UI.renderEditTournamentModal('${tournament.id}')">Edit Tournament Config</button>
            </div>
            <hr style="border-color: var(--border-color);">
            <div>
              <h4 class="text-xs uppercase font-bold text-muted mb-2">Danger Zone</h4>
              <p class="text-xs text-muted mb-3">These actions can cause permanent data loss. Use with caution.</p>
              
              <div class="flex flex-col gap-3">
                <button class="btn btn-danger w-full" id="btn-reset-tournament" style="background: transparent; border: 1px solid var(--accent-danger); color: var(--accent-danger);">
                  Reset Tournament (Delete All Rounds)
                </button>
                <button class="btn btn-danger w-full" onclick="UI.confirmDeleteTournament('${tournament.id}')">
                  Delete Entire Tournament
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>`;
          container.appendChild(overlay);

          document.getElementById('btn-reset-tournament').addEventListener('click', async () => {
            if (confirm('CRITICAL WARNING: This will PERMANENTLY DELETE all rounds, results, and standings for this tournament. \n\nThe player roster will be kept, but you will have to start from Round 1 again. \n\nType "RESET" to confirm.')) {
              const check = prompt('Type "RESET" to confirm:');
              if (check !== 'RESET') return;

              try {
                showLoading();
                await Tournament.resetTournament(tournament.id);
                showToast('Tournament reset successfully', 'info');
                document.getElementById('modal-container').innerHTML = '';
                const freshTournament = await DB.getTournament(tournament.id);
                UI.renderTournamentView(freshTournament);
              } catch (err) { showToast(err.message, 'error'); }
              finally { hideLoading(); }
            }
          });
        }

        /**
         * FEATURE 1: PORTAL LOGIC
         * Orchestrates data fetching and lifetime statistics calculation.
         */
        /**
         * goToHistory: Dedicated router function with validation guards.
         * Constructed to handle multiple ID property fallbacks and URL encoding.
         */
        /**
         * goToHistory: Dedicated router function with validation guards and sessionStorage fallback.
         * Constructed to handle multiple ID property fallbacks and URL encoding.
         */
        function goToHistory(id) {
          // 1. Guard Clause: Robust check for invalid IDs
          if (!id || id === 'undefined' || id === 'null') {
            console.error('[ROUTER] Fatal: Attempted to navigate with invalid ID:', id);
            alert('CRITICAL UI ERROR: Member ID is missing from the database object.');
            return;
          }

          // 2. Storage Failsafe: Save to sessionStorage in case URL parameters are stripped
          sessionStorage.setItem('targetHistoryMemberId', id);
          console.log('[ROUTER] Saved ID to sessionStorage and navigating:', id);

          // 3. Navigation: Using standard file path with query parameter
          window.location.href = 'member-history.html?id=' + encodeURIComponent(id);
        }

        async function openMemberPortal(playerId) {
          try {
            UI.showLoading();

            // Handle potential JSON-encoded QR data
            let id = playerId;
            try {
              const parsed = JSON.parse(playerId);
              if (parsed.id) id = parsed.id;
            } catch (e) { /* use raw id */ }

            const [player, history] = await Promise.all([
              DB.getPlayer(id),
              DB.getFullMemberHistory ? DB.getFullMemberHistory(id) : DB.getPlayerHistory(id)
            ]);

            if (!player) throw new Error('Player profile not found in database.');

            // Calculate Lifetime Stats with logic-safe iteration
            const stats = history.reduce((acc, m) => {
              acc.total++;
              const result = m.result;
              const resStr = typeof result === 'object' ? `${result.whiteScore}-${result.blackScore}` : (result || 'Pending');
              const color = m.color; // 'White' or 'Black'

              if (resStr === '0.5-0.5') {
                acc.draws++;
              } else if (resStr === '1-0') {
                color === 'White' ? acc.wins++ : acc.losses++;
              } else if (resStr === '0-1') {
                color === 'Black' ? acc.wins++ : acc.losses++;
              }
              return acc;
            }, { total: 0, wins: 0, draws: 0, losses: 0 });

            stats.winRate = stats.total > 0 ? ((stats.wins / stats.total) * 100).toFixed(1) : '0.0';

            renderMemberPortalUI(player, history, stats);
          } catch (err) {
            UI.showToast(err.message, 'error');
          } finally {
            UI.hideLoading();
          }
        }

        function processAdvancedHistory(historyArray, currentPlayerId) {
          const tournamentSummaries = {};
          const headToHead = {};

          historyArray.forEach(m => {
            // 1. Tournament Summaries
            if (!tournamentSummaries[m.tournamentId]) {
              tournamentSummaries[m.tournamentId] = {
                tournamentId: m.tournamentId,
                tournamentName: m.tournamentName,
                date: m.tournamentDate,
                totalScore: 0,
                rank: m.rank || 'N/A' // Extracted if previously saved in history
              };
            }

            const result = m.result;
            const resStr = typeof result === 'object' ? `${result.whiteScore}-${result.blackScore}` : (result || 'Pending');
            const isWin = (resStr === '1-0' && m.color === 'White') || (resStr === '0-1' && m.color === 'Black');
            const isDraw = resStr === '0.5-0.5';

            if (isWin) tournamentSummaries[m.tournamentId].totalScore += 1;
            else if (isDraw) tournamentSummaries[m.tournamentId].totalScore += 0.5;

            // 2. Head-to-Head
            if (m.opponentName && m.opponentName !== 'BYE' && m.opponentName !== 'Unknown') {
              if (!headToHead[m.opponentName]) {
                headToHead[m.opponentName] = { opponentName: m.opponentName, games: 0, wins: 0, draws: 0, losses: 0 };
              }
              headToHead[m.opponentName].games += 1;

              if (isWin) headToHead[m.opponentName].wins += 1;
              else if (isDraw) headToHead[m.opponentName].draws += 1;
              else headToHead[m.opponentName].losses += 1;
            }
          });

          const h2hArray = Object.values(headToHead).map(h => {
            h.winRate = h.games > 0 ? ((h.wins / h.games) * 100).toFixed(1) : '0.0';
            return h;
          }).sort((a, b) => b.games - a.games);

          const tournamentsArray = Object.values(tournamentSummaries).sort((a, b) => {
            const d1 = a.date ? (a.date.seconds || a.date) : 0;
            const d2 = b.date ? (b.date.seconds || b.date) : 0;
            return d2 - d1;
          });

          return { tournamentSummaries: tournamentsArray, headToHead: h2hArray, matchLog: historyArray };
        }

        function switchHistoryTab(tabId) {
          document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
          document.querySelectorAll('.tab-link').forEach(el => {
            el.classList.remove('active');
            el.style.color = '#9d9b98';
            el.style.borderBottomColor = 'transparent';
          });

          const content = document.getElementById(tabId);
          if (content) content.style.display = 'block';

          const btn = document.querySelector(`.tab-link[onclick="UI.switchHistoryTab('${tabId}')"]`);
          if (btn) {
            btn.classList.add('active');
            btn.style.color = '#fff';
            btn.style.borderBottomColor = 'var(--accent-primary)';
          }
        }

        /**
         * FEATURE 2: PORTAL UI RENDERING
         * Injects a stunning, full-screen overlay with embedded design system.
         */
        function renderMemberPortalUI(player, history, stats) {
          const adv = processAdvancedHistory(history, player.id);
          const container = document.getElementById('modal-container');
          container.innerHTML = '';

          const portal = document.createElement('div');
          portal.className = 'member-portal-overlay fade-in';
          portal.innerHTML = `
      <style>
        .member-portal-overlay {
          position: fixed; top: 0; left: 0; width: 100%; height: 100%;
          background: #0f0e0d; z-index: 9999; overflow-y: auto;
          color: #fff; font-family: 'Inter', system-ui, sans-serif;
        }
        .portal-container { max-width: 1000px; margin: 0 auto; padding: 2rem; }
        .portal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2.5rem; }
        
        /* Digital ID Card Styling */
        .id-card {
          background: linear-gradient(135deg, #1a1917 0%, #11100f 100%);
          border: 1px solid #2b2a27; border-radius: 24px; padding: 2.5rem;
          display: grid; grid-template-columns: 1fr 240px; gap: 2rem;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); margin-bottom: 3rem;
          position: relative; overflow: hidden;
        }
        .id-card::before {
          content: '♞'; position: absolute; right: -20px; bottom: -40px;
          font-size: 20rem; opacity: 0.03; pointer-events: none;
        }
        .rating-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-top: 1.5rem; }
        .rating-box { background: rgba(255,255,255,0.03); padding: 1rem; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05); text-align: center; }
        
        /* Stats Styling */
        .stats-row { display: grid; grid-template-columns: repeat(5, 1fr); gap: 1rem; margin-bottom: 3rem; }
        .stat-pill { background: #1a1917; padding: 1.5rem; border-radius: 16px; border: 1px solid #2b2a27; text-align: center; }
        .stat-val { display: block; font-size: 1.75rem; font-weight: 900; margin-bottom: 0.25rem; }
        
        /* Table & Tabs Styling */
        .history-wrap { background: #1a1917; border-radius: 16px; border: 1px solid #2b2a27; overflow: hidden; }
        .tabs-header { display: flex; background: #21201d; border-bottom: 1px solid #2b2a27; }
        .tab-link { flex: 1; padding: 1rem; background: transparent; border: none; color: #9d9b98; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; font-size: 0.8rem; cursor: pointer; border-bottom: 2px solid transparent; transition: all 0.2s ease; }
        .tab-link:hover { color: #fff; background: rgba(255,255,255,0.02); }
        .tab-link.active { color: #fff; border-bottom: 2px solid var(--accent-primary); }
        .portal-table { width: 100%; border-collapse: collapse; }
        .portal-table th { background: #21201d; padding: 1.25rem; text-align: left; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; color: #9d9b98; }
        .portal-table td { padding: 1.25rem; border-bottom: 1px solid #2b2a27; font-size: 0.9rem; }
        
        @media (max-width: 768px) {
          .id-card { grid-template-columns: 1fr; text-align: center; }
          .id-card div:last-child { display: flex; justify-content: center; }
          .stats-row { grid-template-columns: 1fr 1fr; }
          .hide-mobile { display: none; }
          .tabs-header { flex-direction: column; }
          .tab-link { padding: 0.75rem; }
        }
      </style>

      <div class="portal-container">
        <div class="portal-header">
          <div>
            <h1 style="font-size: 2rem; font-weight: 900; margin: 0; letter-spacing: -1px;">MEMBER PORTAL</h1>
            <div class="flex items-center gap-3">
              <p style="color: #9d9b98; text-transform: uppercase; font-size: 0.7rem; font-weight: 800; letter-spacing: 2px; margin: 0;">Identity & Performance Analytics</p>
              <a href="member-history.html?memberId=${player.id}" style="color: var(--accent-primary); font-size: 0.75rem; font-weight: 800; text-decoration: none; border-bottom: 1px solid rgba(56, 189, 248, 0.3); padding-bottom: 1px;">📜 View Career History</a>
            </div>
          </div>
          <div class="flex gap-3 items-center">
            ${!Auth.isGuest() ? `
              <button class="btn btn-secondary btn-sm hide-mobile" onclick="UI.renderEditPlayerModal('${player.id}')">Edit Profile</button>
              <button class="btn btn-secondary btn-sm hide-mobile" onclick="window.print()">Print ID Card</button>
            ` : ''}
            <button class="btn btn-secondary" style="border-radius: 50%; width: 48px; height: 48px; padding: 0;" onclick="this.closest('.member-portal-overlay').remove()">✕</button>
          </div>
        </div>

        <div class="id-card">
          <div>
            <div style="color: var(--accent-primary); font-weight: 800; font-size: 0.8rem; letter-spacing: 3px; margin-bottom: 1rem;">TABUKO CHESS CLUB</div>
            <h2 style="font-size: 2.5rem; font-weight: 900; margin: 0;">${player.name}</h2>
            <div class="badge badge-warning" style="margin-top: 0.5rem; font-size: 0.8rem;">${player.title || 'MEMBER'}</div>
            
            <div class="rating-grid">
              <div class="rating-box"><span style="display:block; color: #9d9b98; font-size: 0.6rem; font-weight: 800;">FIDE</span><span style="font-weight: 900; font-size: 1.2rem;">${player.ratings?.fide || '-'}</span></div>
              <div class="rating-box"><span style="display:block; color: #9d9b98; font-size: 0.6rem; font-weight: 800;">NCFP</span><span style="font-weight: 900; font-size: 1.2rem;">${player.ratings?.ncfp || '-'}</span></div>
              <div class="rating-box" style="border-color: var(--accent-primary);"><span style="display:block; color: var(--accent-primary); font-size: 0.6rem; font-weight: 800;">CLUB</span><span style="font-weight: 900; font-size: 1.2rem;">${player.ratings?.club || 1200}</span></div>
            </div>
          </div>
          <div style="background: #fff; padding: 1rem; border-radius: 16px; display: flex; align-items: center; justify-content: center;">
            <div id="portal-qr-container"></div>
          </div>
        </div>

        <div class="stats-row">
          <div class="stat-pill"><span class="stat-val">${stats.total}</span><span style="color:#9d9b98; font-size: 0.65rem; font-weight: 800; text-transform: uppercase;">Games</span></div>
          <div class="stat-pill"><span class="stat-val" style="color: #81b64c;">${stats.wins}</span><span style="color:#9d9b98; font-size: 0.65rem; font-weight: 800; text-transform: uppercase;">Wins</span></div>
          <div class="stat-pill"><span class="stat-val" style="color: #9d9b98;">${stats.draws}</span><span style="color:#9d9b98; font-size: 0.65rem; font-weight: 800; text-transform: uppercase;">Draws</span></div>
          <div class="stat-pill"><span class="stat-val" style="color: #fa412d;">${stats.losses}</span><span style="color:#9d9b98; font-size: 0.65rem; font-weight: 800; text-transform: uppercase;">Losses</span></div>
          <div class="stat-pill"><span class="stat-val" style="color: var(--accent-primary);">${stats.winRate}%</span><span style="color:#9d9b98; font-size: 0.65rem; font-weight: 800; text-transform: uppercase;">Win Rate</span></div>
        </div>

        <div class="history-wrap">
          <div class="tabs-header">
            <button class="tab-link active" onclick="UI.switchHistoryTab('tab-tournaments')" style="color: #fff; border-bottom-color: var(--accent-primary);">Tournaments</button>
            <button class="tab-link" onclick="UI.switchHistoryTab('tab-h2h')">Head-to-Head</button>
            <button class="tab-link" onclick="UI.switchHistoryTab('tab-matches')">Match Log</button>
          </div>
          
          <div id="tab-tournaments" class="tab-content" style="display: block;">
            <table class="portal-table">
              <thead>
                <tr>
                  <th class="hide-mobile">Date</th>
                  <th>Tournament</th>
                  <th style="text-align: center;">Total Score</th>
                  <th style="text-align: center;">Standing</th>
                </tr>
              </thead>
              <tbody>
                ${adv.tournamentSummaries.map(t => `
                  <tr>
                    <td class="hide-mobile" style="color: #9d9b98; font-size: 0.8rem;">${t.date ? new Date(t.date.seconds * 1000).toLocaleDateString() : 'N/A'}</td>
                    <td style="font-weight: 700; color: #fff;">${t.tournamentName}</td>
                    <td style="text-align: center; color: var(--accent-primary); font-weight: 900; font-size: 1.1rem;">${t.totalScore}</td>
                    <td style="text-align: center; opacity: 0.8;">${t.rank}</td>
                  </tr>
                `).join('')}
                ${adv.tournamentSummaries.length === 0 ? '<tr><td colspan="4" style="text-align:center; padding: 4rem; color:#9d9b98;">No tournament data available.</td></tr>' : ''}
              </tbody>
            </table>
          </div>
          
          <div id="tab-h2h" class="tab-content" style="display: none;">
            <table class="portal-table">
              <thead>
                <tr>
                  <th>Opponent</th>
                  <th style="text-align: center;">Games</th>
                  <th style="text-align: center; color: #81b64c;">W</th>
                  <th style="text-align: center; color: #9d9b98;">D</th>
                  <th style="text-align: center; color: #fa412d;">L</th>
                  <th style="text-align: center;">Win Rate</th>
                </tr>
              </thead>
              <tbody>
                ${adv.headToHead.map(h => `
                  <tr>
                    <td style="font-weight: 700; color: #fff;">${h.opponentName}</td>
                    <td style="text-align: center; font-weight: 800;">${h.games}</td>
                    <td style="text-align: center; color: #81b64c; font-weight: 900;">${h.wins}</td>
                    <td style="text-align: center; color: #9d9b98;">${h.draws}</td>
                    <td style="text-align: center; color: #fa412d;">${h.losses}</td>
                    <td style="text-align: center;">
                      <span style="background: rgba(255,255,255,0.05); padding: 4px 10px; border-radius: 4px; font-size: 0.8rem;">${h.winRate}%</span>
                    </td>
                  </tr>
                `).join('')}
                ${adv.headToHead.length === 0 ? '<tr><td colspan="6" style="text-align:center; padding: 4rem; color:#9d9b98;">No head-to-head records found.</td></tr>' : ''}
              </tbody>
            </table>
          </div>

          <div id="tab-matches" class="tab-content" style="display: none;">
            <table class="portal-table">
              <thead>
                <tr>
                  <th class="hide-mobile">Date</th>
                  <th>Tournament</th>
                  <th style="text-align: center;">RD</th>
                  <th>Opponent</th>
                  <th style="text-align: center;">Result</th>
                </tr>
              </thead>
              <tbody>
                ${adv.matchLog.map(m => {
            const isWin = (m.result === '1-0' && m.color === 'White') || (m.result === '0-1' && m.color === 'Black');
            const isLoss = (m.result === '0-1' && m.color === 'White') || (m.result === '1-0' && m.color === 'Black');
            const resColor = isWin ? '#81b64c' : isLoss ? '#fa412d' : '#9d9b98';

            return `
                    <tr>
                      <td class="hide-mobile" style="color: #9d9b98; font-size: 0.8rem;">${m.tournamentDate ? new Date(m.tournamentDate.seconds * 1000).toLocaleDateString() : 'N/A'}</td>
                      <td style="font-weight: 700;">${m.tournamentName}</td>
                      <td style="text-align: center; opacity: 0.6;">${m.round}</td>
                      <td><span style="color: #9d9b98; font-size: 0.7rem; font-weight: 800; margin-right: 8px;">${m.color.toUpperCase()} VS</span> ${m.opponentName}</td>
                      <td style="text-align: center;">
                        <span style="background: ${resColor}22; color: ${resColor}; padding: 4px 12px; border-radius: 4px; font-weight: 900; border: 1px solid ${resColor}44;">
                          ${m.result}
                        </span>
                      </td>
                    </tr>`;
          }).join('')}
                ${adv.matchLog.length === 0 ? '<tr><td colspan="5" style="text-align:center; padding: 4rem; color:#9d9b98;">No match history found.</td></tr>' : ''}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

          container.appendChild(portal);

          // Initialize QR Code inside the card
          setTimeout(() => {
            new QRCode(document.getElementById('portal-qr-container'), {
              text: player.id,
              width: 140,
              height: 140,
              colorDark: "#000000",
              colorLight: "#ffffff",
              correctLevel: QRCode.CorrectLevel.H
            });
          }, 50);
        }

        /**
         * FEATURE 3: PUBLIC ACCESS UTILITY
         * Injects global styles for clickable names used in standings and roster.
         */
        function injectPublicAccessStyles() {
          if (document.getElementById('public-access-styles')) return;
          const style = document.createElement('style');
          style.id = 'public-access-styles';
          style.innerHTML = `
      .clickable-name {
        color: var(--accent-primary);
        cursor: pointer;
        font-weight: 700;
        transition: all 0.2s ease;
        border-bottom: 1px solid transparent;
      }
      .clickable-name:hover {
        border-bottom: 1px solid var(--accent-primary);
        opacity: 0.8;
      }
    `;
          document.head.appendChild(style);
        }

        // Initialize styles on module load
        injectPublicAccessStyles();

        /**
         * FEATURE 3: QR SCANNER INTEGRATION
         * Upgraded handler for successful QR scans.
         */
        function onScanSuccess(decodedText) {
          if (decodedText) {
            // 1. Instantly pause or clear the scanner so it doesn't scan twice
            if (typeof html5QrcodeScanner !== 'undefined' && html5QrcodeScanner.clear) {
              html5QrcodeScanner.clear().catch(e => console.warn('Scanner clear error', e));
            }

            // 2. Clear any generic scanner UI layers
            const scannerLayer = document.querySelector('.scanner-overlay, .scanner-modal');
            if (scannerLayer) scannerLayer.remove();

            // 3. Trigger the premium profile fetch and modal
            UI.showScannedProfile(decodedText);
          }
        }

        /**
         * FEATURE: PREMIUM PROFILE MODAL (DIGITAL ID CARD)
         * Fetches data and presents a visually striking frosted-glass profile.
         */
        async function showScannedProfile(memberId) {
          // 1. Inject Loading Spinner Overlay
          const loaderOverlay = document.createElement('div');
          loaderOverlay.className = 'modal-overlay active';
          loaderOverlay.id = 'scanner-loading-overlay';
          loaderOverlay.innerHTML = '<div class="loader"></div>';
          document.body.appendChild(loaderOverlay);

          try {
            // 2. Fetch Player Data via hardened DB engine
            const member = await DB.getClubMember(memberId);
            loaderOverlay.remove(); // Remove loader immediately after fetch

            if (!member) {
              // Show Styled Error Modal for unrecognized codes
              UI.showToast("Unrecognized QR Code", "error");
              return;
            }

            // 3. Generate Digital ID Card Modal with Premium CSS
            const modal = document.createElement('div');
            modal.className = 'modal-overlay active';
            modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

            const premiumStyles = `
        <style>
          .id-card-modal {
            background: rgba(30, 41, 59, 0.7);
            backdrop-filter: blur(15px);
            -webkit-backdrop-filter: blur(15px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 28px;
            width: 350px;
            padding: 2.5rem;
            color: #fff;
            text-align: center;
            box-shadow: 0 0 50px rgba(74, 222, 128, 0.15), 0 20px 40px rgba(0,0,0,0.4);
            position: relative;
            animation: idCardPop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
          }
          @keyframes idCardPop {
            from { opacity: 0; transform: scale(0.9) translateY(30px); }
            to { opacity: 1; transform: scale(1) translateY(0); }
          }
          .id-avatar-circle {
            width: 100px; height: 100px;
            background: linear-gradient(135deg, #334155 0%, #0f172a 100%);
            border-radius: 50%; margin: 0 auto 1.5rem;
            display: flex; align-items: center; justify-content: center;
            border: 3px solid var(--accent-primary);
            box-shadow: 0 0 20px rgba(56, 189, 248, 0.4);
          }
          .id-title-badge { 
            font-size: 0.7rem; font-weight: 800; text-transform: uppercase; 
            letter-spacing: 2.5px; color: var(--accent-primary); margin-bottom: 0.5rem; 
          }
          .id-name-display { font-size: 1.75rem; font-weight: 900; margin-bottom: 2rem; letter-spacing: -0.5px; }
          
          .id-stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; margin-bottom: 2.5rem; }
          .id-stat-item { 
            background: rgba(0, 0, 0, 0.3); padding: 1.25rem 0.75rem; 
            border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.08); 
          }
          .id-stat-lbl { font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; margin-bottom: 0.35rem; font-weight: 800; letter-spacing: 1px; }
          .id-stat-val { font-size: 1.25rem; font-weight: 900; color: #fff; }
          
          .id-status-pill { 
            padding: 0.85rem; border-radius: 14px; 
            background: rgba(74, 222, 128, 0.08); border: 1px solid rgba(74, 222, 128, 0.2); 
            margin-bottom: 2rem; display: flex; align-items: center; justify-content: center; gap: 10px;
          }
          .status-glow { 
            width: 10px; height: 10px; border-radius: 50%; 
            background: var(--accent-success); box-shadow: 0 0 10px var(--accent-success); 
          }
          
          .id-btn-stack { display: flex; flex-direction: column; gap: 0.85rem; }
        </style>
      `;

            modal.innerHTML = `
        ${premiumStyles}
        <div class="id-card-modal">
          <div class="id-avatar-circle">
            <svg width="55" height="55" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke-linecap="round" stroke-linejoin="round"/>
              <circle cx="12" cy="7" r="4" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="id-title-badge">${member.profile?.title || 'Verified Member'}</div>
          <div class="id-name-display">${member.profile?.name || member.name}</div>
          
          <div class="id-stats-grid">
            <div class="id-stat-item">
              <div class="id-stat-lbl">Club Rating</div>
              <div class="id-stat-val">${member.ratings?.club || 1200}</div>
            </div>
            <div class="id-stat-item">
              <div class="id-stat-lbl">FIDE Rating</div>
              <div class="id-stat-val">${member.ratings?.fide || 'Unrated'}</div>
            </div>
          </div>
          
          <div class="id-status-pill">
            <span class="status-glow"></span>
            <span style="font-size: 0.8rem; font-weight: 800; color: var(--accent-success); text-transform: uppercase;">${member.profile?.status || member.status || 'Active'}</span>
          </div>

          <div class="id-btn-stack">
            <button class="btn btn-primary" style="width: 100%;" onclick="window.location.href='member-history.html?id=${member.id}'">View Full History</button>
            <button class="btn btn-secondary" style="width: 100%;" onclick="this.closest('.modal-overlay').remove()">Close</button>
          </div>
        </div>
      `;
            document.body.appendChild(modal);

          } catch (err) {
            if (loaderOverlay) loaderOverlay.remove();
            UI.showToast(err.message, 'error');
          }
        }

        /**
         * FEATURE: Sleek fallback modal for QR Scanning
         */
        async function showScannedPlayer(playerId) {
          try {
            showLoading();
            // Fallback: Try DB.getPlayer or DB.getMember
            const player = await (DB.getPlayer ? DB.getPlayer(playerId) : DB.getMember ? DB.getMember(playerId) : Promise.resolve(null));

            if (!player) throw new Error('Player not found in database.');

            const container = document.getElementById('modal-container');
            container.innerHTML = `
        <div class="modal-overlay active">
          <div class="modal fade-in" style="max-width: 450px; background: linear-gradient(145deg, #1a1f2b 0%, #12161f 100%); border: 1px solid var(--accent-primary);">
            <div class="modal-header" style="border-bottom: 1px solid rgba(255,255,255,0.05);">
              <h2 class="card-title" style="margin:0; font-size: 1.25rem;">SCAN MATCH</h2>
              <button class="btn btn-secondary btn-sm" onclick="this.closest('.modal-overlay').remove()" style="border-radius: 50%;">✕</button>
            </div>
            <div class="modal-body text-center" style="padding: 3rem 2rem;">
              <div style="width: 80px; height: 80px; border-radius: 50%; background: rgba(129, 182, 76, 0.1); border: 2px solid var(--accent-primary); color: var(--accent-primary); display: flex; align-items: center; justify-content: center; font-size: 3rem; margin: 0 auto 1.5rem;">♞</div>
              <h1 style="font-size: 2rem; font-weight: 900; margin-bottom: 0.25rem;">${player.name}</h1>
              <div class="badge badge-warning" style="margin-bottom: 2rem;">${player.title || 'MEMBER'}</div>
              
              <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem;">
                <div style="background: rgba(255,255,255,0.02); padding: 1rem; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05);">
                  <div style="color: var(--text-muted); font-size: 0.65rem; font-weight: 800; text-transform: uppercase;">FIDE</div>
                  <div style="font-size: 1.2rem; font-weight: 900;">${player.ratings?.fide || '-'}</div>
                </div>
                <div style="background: rgba(255,255,255,0.02); padding: 1rem; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05);">
                  <div style="color: var(--text-muted); font-size: 0.65rem; font-weight: 800; text-transform: uppercase;">NCFP</div>
                  <div style="font-size: 1.2rem; font-weight: 900;">${player.ratings?.ncfp || '-'}</div>
                </div>
                <div style="background: rgba(129, 182, 76, 0.05); padding: 1rem; border-radius: 12px; border: 1px solid rgba(129, 182, 76, 0.3);">
                  <div style="color: var(--accent-primary); font-size: 0.65rem; font-weight: 800; text-transform: uppercase;">CLUB</div>
                  <div style="font-size: 1.2rem; font-weight: 900;">${player.ratings?.club || 1200}</div>
                </div>
              </div>
            </div>
            <div class="modal-footer" style="background: rgba(0,0,0,0.2); border-top: 1px solid rgba(255,255,255,0.05);">
              <button class="btn btn-primary" style="width: 100%;" onclick="this.closest('.modal-overlay').remove()">VERIFIED</button>
            </div>
          </div>
        </div>
      `;
  } finally {
    hideLoading();
  }
}

/**
 * saveAllResults: Scrapes the UI for results and pushes them to the OperationsQueue.
 */
async function saveAllResults(tournamentId, roundNumber) {
  const selects = document.querySelectorAll('.result-select, .scoreboard-select');
  const operations = [];

  selects.forEach(sel => {
    const val = sel.value;
    if (!val) return;
    const board = parseInt(sel.dataset.board);
    
    // Check if it's a team match or individual pairing
    const isTeam = sel.classList.contains('scoreboard-select');
    
    if (isTeam) {
      // Team result logic is usually handled in the dedicated Modal, 
      // but we support batch save here too for consistency.
      const matchNum = sel.closest('[data-match]')?.dataset.match;
      if (matchNum) {
        operations.push({
          type: 'SUBMIT_RESULT',
          payload: { tournamentId, roundNumber, matchNumber: matchNum, boardNumber: board, result: val }
        });
      }
    } else {
      const [w, b] = val.replace('F', '').split('-').map(parseFloat);
      operations.push({
        type: 'SUBMIT_RESULT',
        payload: { tournamentId, roundNumber, board, whiteScore: w, blackScore: b, isForfeit: val.includes('F') }
      });
    }
  });

  if (operations.length === 0) {
    showToast('No new results to save.', 'info');
    return;
  }

  try {
    showLoading("Queuing Results...");
    if (window.OperationsQueue) {
      await Promise.all(operations.map(op => window.OperationsQueue.push(op.type, op.payload)));
    } else {
      // Fallback: Individual Result Submission
      await Promise.all(operations.map(op => 
        Tournament.submitResultAndUpdate(tournamentId, roundNumber, op.payload.board, op.payload.whiteScore, op.payload.blackScore)
      ));
    }
    showToast('All results saved and standings updated.', 'success');
    const tournament = await DB.getTournament(tournamentId);
    UI.renderTournamentView(tournament);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    hideLoading();
  }
}

/**
 * renderResultModal: Individual Board Result Modal (Titanium Obsidian Style)
 */
function renderResultModal(tournamentId, roundNumber, board, whiteName, blackName) {
  const container = document.getElementById('modal-container');
  container.innerHTML = '';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active fade-in';
  overlay.style.cssText = 'backdrop-filter: blur(15px); background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 10000;';
  
  overlay.innerHTML = `
    <div class="titanium-obsidian-modal" style="width: 100%; max-width: 450px; background: #0f172a; border-radius: 20px; overflow: hidden; border: 1px solid rgba(255,255,255,0.05);">
      <div style="padding: 1.5rem; border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; justify-content: space-between; align-items: center;">
        <h2 style="margin:0; font-size: 1.25rem; font-weight: 900; color: #fff;">Board ${board} Result</h2>
        <button onclick="this.closest('.modal-overlay').remove()" style="background:transparent; border:none; color:#64748b; cursor:pointer;">✕</button>
      </div>
      <div style="padding: 2rem; text-align: center;">
        <div style="margin-bottom: 1.5rem; color: #94a3b8; font-size: 0.9rem; font-weight: 600;">${whiteName} vs ${blackName}</div>
        <div style="display: grid; gap: 0.75rem;">
          <button class="res-btn" data-res="1-0" style="padding: 1rem; background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.2); color: #4ade80; border-radius: 12px; font-weight: 800; cursor: pointer;">1 - 0 (White Wins)</button>
          <button class="res-btn" data-res="0.5-0.5" style="padding: 1rem; background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.2); color: #60a5fa; border-radius: 12px; font-weight: 800; cursor: pointer;">½ - ½ (Draw)</button>
          <button class="res-btn" data-res="0-1" style="padding: 1rem; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); color: #f87171; border-radius: 12px; font-weight: 800; cursor: pointer;">0 - 1 (Black Wins)</button>
        </div>
      </div>
    </div>
  `;
  container.appendChild(overlay);

  overlay.querySelectorAll('.res-btn').forEach(btn => {
    btn.onclick = async () => {
      const val = btn.dataset.res;
      const [w, b] = val.split('-').map(parseFloat);
      try {
        showLoading("Submitting...");
        if (window.OperationsQueue) {
          await window.OperationsQueue.push('SUBMIT_RESULT', { tournamentId, roundNumber, board, whiteScore: w, blackScore: b });
        } else {
          await Tournament.submitResultAndUpdate(tournamentId, roundNumber, board, w, b);
        }
        showToast("Result saved", "success");
        overlay.remove();
        const t = await DB.getTournament(tournamentId);
        UI.renderTournamentView(t);
      } catch (err) { showToast(err.message, 'error'); }
      finally { hideLoading(); }
    };
  });
}

        /**
         * BUG FIX: Replace window.prompt() with a beautiful HTML Modal
         */
        function renderAddRoundModal(tournamentId) {
          const container = document.getElementById('modal-container');
          container.innerHTML = '';

          const overlay = document.createElement('div');
          overlay.className = 'modal-overlay active';
          overlay.innerHTML = `
      <div class="modal fade-in" style="max-width: 400px;">
        <div class="modal-header">
          <h2 class="card-title">Add Additional Rounds</h2>
          <button class="btn btn-secondary btn-sm" onclick="this.closest('.modal-overlay').remove()">✕</button>
        </div>
        <div class="modal-body">
          <p class="text-muted text-sm mb-4">Extend the tournament by adding one or more rounds to the schedule.</p>
          <div class="form-group mb-6">
            <label class="form-label">Number of Rounds</label>
            <input type="number" id="add-round-count" class="form-input" min="1" value="1">
          </div>
          <button class="btn btn-primary w-full" id="btn-confirm-add-round">Add Rounds Now</button>
        </div>
      </div>`;

          container.appendChild(overlay);

          document.getElementById('btn-confirm-add-round').onclick = async () => {
            const count = parseInt(document.getElementById('add-round-count').value);
            if (isNaN(count) || count < 1) return showToast('Enter a valid number of rounds', 'warning');

            try {
              showLoading();
              await DB.addTournamentRound(tournamentId, count);
              showToast(`${count} additional rounds added.`, 'success');
              overlay.remove();
              const tournament = await DB.getTournament(tournamentId);
              renderTournamentView(tournament);
            } catch (err) { showToast(err.message, 'error'); }
            finally { hideLoading(); }
          };
        }

        /**
         * ARBITER TOOL: Prompt for adding more rounds mid-tournament.
         */
        async function addTournamentRoundPrompt(tournamentId) {
          const count = prompt("How many additional rounds would you like to add?", "1");
          if (!count || isNaN(count)) return;

          try {
            showLoading();
            await DB.addTournamentRound(tournamentId, parseInt(count));
            showToast(`${count} round(s) added successfully.`, 'success');
            const tournament = await DB.getTournament(tournamentId);
            renderTournamentView(tournament);
          } catch (err) { showToast(err.message, 'error'); }
          finally { hideLoading(); }
        }

        async function renderLateEntryModal(tournamentId, currentRound) {
          try {
            showLoading();
            const allPlayers = await DB.getAllPlayers();
            const tournament = await DB.getTournament(tournamentId);
            const registeredIds = tournament.playerIds || [];
            const available = allPlayers.filter(p => !registeredIds.includes(p.id));

            const container = document.getElementById('modal-container');
            container.innerHTML = '';

            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay active';
            overlay.innerHTML = `
        <div class="modal fade-in" style="max-width: 500px;">
          <div class="modal-header">
            <h2 class="card-title">FIDE Late Entry (Round ${currentRound})</h2>
            <button class="btn btn-secondary btn-sm" onclick="this.closest('.modal-overlay').remove()">✕</button>
          </div>
          <div class="modal-body">
            <div class="form-group mb-4">
              <label class="form-label">Select Player from Roster</label>
              <select id="late-player-id" class="form-input">
                <option value="">-- Choose Player --</option>
                ${available.map(p => `<option value="${p.id}">${p.name} (${p.ratings?.club || 1200})</option>`).join('')}
              </select>
            </div>
            <div class="form-group mb-6">
              <label class="form-label">Missed Round Compensation</label>
              <select id="late-missed-score" class="form-input">
                <option value="0">0 Points per missed round</option>
                <option value="0.5">0.5 Points per missed round</option>
              </select>
            </div>
            <button class="btn btn-primary w-full" id="btn-submit-late-entry">Inject Player</button>
          </div>
        </div>`;

            container.appendChild(overlay);

            document.getElementById('btn-submit-late-entry').onclick = async () => {
              const playerId = document.getElementById('late-player-id').value;
              const score = document.getElementById('late-missed-score').value;
              if (!playerId) return showToast('Select a player', 'warning');

              try {
                showLoading();
                await DB.processLateEntry(tournamentId, playerId, currentRound, score);
                showToast('Player injected successfully', 'success');
                container.innerHTML = '';
                const freshTournament = await DB.getTournament(tournamentId);
                UI.renderTournamentView(freshTournament);
              } catch (err) { showToast(err.message, 'error'); }
              finally { hideLoading(); }
            };
          } catch (err) { showToast(err.message, 'error'); }
          finally { hideLoading(); }
        }

  /**
   * NAME RESOLUTION ENGINE: Shared logic for consistent identity mapping
   */
  function resolveModalName(pId, pName, side, boardNum, playerMap, homeTeam, awayTeam) {
    // Tier 1: Live Registry lookup (Aggressive Hydration)
    if (pId && playerMap[pId]) return playerMap[pId].name;
    
    // Tier 2: Team Roster lookup (Manual/Guest entries)
    const team = side === 'white' ? homeTeam : awayTeam;
    const guest = team?.players?.find(p => p.id === pId || p.boardNumber === boardNum);
    if (guest && guest.name && guest.name !== 'Vacant') return guest.name;

    // Tier 3: Fallback to saved object name
    return pName && pName !== 'Vacant' ? pName : 'Vacant';
  }

  async function toggleWithdrawal(tournamentId, playerId, isWithdrawn) {
    try {
      showLoading();
      await DB.togglePlayerWithdrawal(tournamentId, playerId, isWithdrawn);
      showToast(isWithdrawn ? 'Player marked as Withdrawn' : 'Player Re-joined', 'info');
      const tournament = await DB.getTournament(tournamentId);
      UI.renderTournamentView(tournament);
    } catch (err) { showToast(err.message, 'error'); }
    finally { hideLoading(); }
  }

  async function renderTeamResultModal(tournamentId, roundNum, matchNumber) {
    const container = document.getElementById('modal-container');
    if (!container) return;
    container.innerHTML = '';

    const roundData = await DB.getRound(tournamentId, roundNum);
    const matches = roundData.teamMatches || roundData.matches || [];
    const match = matches.find(m => String(m.matchNumber) === String(matchNumber));
    if (!match) return;

    // 1. HYDRATION LAYER: Fetch Registry and Teams
    const [playerSnap, teamSnap] = await Promise.all([
      db.collection('tournaments').doc(tournamentId).collection('playerData').get(),
      db.collection('tournaments').doc(tournamentId).collection('teams').get()
    ]);

    const playerMap = {};
    playerSnap.docs.forEach(doc => playerMap[doc.id] = { id: doc.id, ...doc.data() });

    const fullTeams = {};
    teamSnap.docs.forEach(doc => fullTeams[doc.id] = { id: doc.id, ...doc.data() });

    const homeTeam = fullTeams[match.homeTeamId];
    const awayTeam = fullTeams[match.awayTeamId];

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay active fade-in';
    overlay.style.cssText = 'backdrop-filter: blur(25px) saturate(180%); background: rgba(10, 10, 15, 0.85); display: flex; align-items: center; justify-content: center; z-index: 10000;';

    const modalHtml = `
      <div class="titanium-obsidian-modal" style="width: 100%; max-width: 900px; background: rgba(15, 23, 42, 0.95); border: 1px solid rgba(255,255,255,0.1); border-radius: 28px; box-shadow: 0 40px 100px -20px rgba(0, 0, 0, 0.7); overflow: hidden; color: #fff;">
        
        <!-- Titanium Scoreboard Header -->
        <div style="padding: 3rem; background: linear-gradient(180deg, rgba(255,255,255,0.03) 0%, transparent 100%); border-bottom: 1px solid rgba(255,255,255,0.05); display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 2.5rem;">
          
          <div style="text-align: right;">
            <h2 style="font-size: 1.8rem; font-weight: 950; margin: 0; color: #f8fafc;">${homeTeam?.name || match.homeTeamName}</h2>
            <span style="font-size: 0.75rem; color: #64748b; text-transform: uppercase; letter-spacing: 3px; font-weight: 800;">Home Force</span>
          </div>

          <div style="text-align: center;">
            <div style="background: #000; border: 2px solid #1e293b; padding: 0.75rem 2.5rem; border-radius: 20px; font-family: 'JetBrains Mono', monospace; font-size: 2.8rem; font-weight: 900; color: #fbbf24; box-shadow: 0 0 50px rgba(251, 191, 36, 0.15);">
              <span id="home-bp-live">0.0</span><span style="opacity: 0.15; margin: 0 0.75rem;">:</span><span id="away-bp-live">0.0</span>
            </div>
            <div style="margin-top: 1rem; font-size: 0.65rem; text-transform: uppercase; letter-spacing: 5px; color: #475569; font-weight: 900;">Tactical Match Score</div>
          </div>

          <div style="text-align: left;">
            <h2 style="font-size: 1.8rem; font-weight: 950; margin: 0; color: #f8fafc;">${awayTeam?.name || match.awayTeamName}</h2>
            <span style="font-size: 0.75rem; color: #64748b; text-transform: uppercase; letter-spacing: 3px; font-weight: 800;">Away Force</span>
          </div>
        </div>

        <div style="padding: 2.5rem; max-height: 65vh; overflow-y: auto;">
          <div id="board-results-list" style="display: grid; gap: 1.25rem;">
            ${await (async () => {
              const rows = [];
              for (const b of (match.boards || [])) {
                const white = await IdentityResolution.resolvePlayer(tournamentId, match.homeTeamId, b.whiteId, b.whiteName, b.boardNumber, playerMap, homeTeam);
                const black = await IdentityResolution.resolvePlayer(tournamentId, match.awayTeamId, b.blackId, b.blackName, b.boardNumber, playerMap, awayTeam);
                const currentRes = b.result || b.rawResult || '';

                rows.push(`
                  <div class="scoreboard-board-row" style="display: grid; grid-template-columns: 1fr 180px 1fr; align-items: center; gap: 2rem; padding: 1.5rem; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.03); border-radius: 18px; transition: 0.3s;">
                    <div style="text-align: right; color: #fff; font-weight: 800;">
                      <div>${white.name}</div>
                      <div style="font-size: 0.65rem; color: #64748b;">ELO ${white.rating}</div>
                    </div>
                    <div style="display: flex; justify-content: center;">
                      <select class="scoreboard-select" data-board="${b.boardNumber}" onchange="window.syncLiveScoreboard(this)" style="width: 100%; background: #000; border: 2px solid #334155; color: #fbbf24; border-radius: 12px; padding: 0.75rem; font-weight: 900; text-align: center; cursor: pointer; outline: none;">
                        <option value="">PENDING</option>
                        <option value="1-0" ${currentRes === '1-0' ? 'selected' : ''}>1 - 0</option>
                        <option value="0.5-0.5" ${currentRes === '0.5-0.5' ? 'selected' : ''}>½ - ½</option>
                        <option value="0-1" ${currentRes === '0-1' ? 'selected' : ''}>0 - 1</option>
                        <option value="1-0F" ${currentRes === '1-0F' ? 'selected' : ''}>1 - 0 (F)</option>
                        <option value="0-1F" ${currentRes === '0-1F' ? 'selected' : ''}>0 - 1 (F)</option>
                        <option value="0-0F" ${currentRes === '0-0F' ? 'selected' : ''}>0 - 0 (F)</option>
                      </select>
                    </div>
                    <div style="text-align: left; color: #fff; font-weight: 800;">
                      <div>${black.name}</div>
                      <div style="font-size: 0.65rem; color: #64748b;">ELO ${black.rating}</div>
                    </div>
                  </div>
                `);
              }
              return rows.join('');
            })()}
          </div>
        </div>

        <div style="padding: 2.5rem; background: rgba(0,0,0,0.4); border-top: 1px solid rgba(255,255,255,0.05); display: flex; gap: 1.5rem;">
          <button onclick="this.closest('.modal-overlay').remove()" style="flex: 1; background: transparent; border: 1.5px solid #1e293b; color: #64748b; padding: 1.25rem; border-radius: 16px; font-weight: 800; cursor: pointer;">Abort</button>
          <button id="btn-lock-results" disabled style="flex: 2; background: #2563eb; color: #fff; border: none; padding: 1.25rem; border-radius: 16px; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; cursor: not-allowed; opacity: 0.5; filter: grayscale(1); transition: all 0.3s;">Lock Match Results</button>
        </div>
      </div>
    `;

    overlay.innerHTML = modalHtml;
    container.appendChild(overlay);
    syncLiveScoreboard();

    document.getElementById('btn-lock-results').addEventListener('click', async () => {
      const selects = overlay.querySelectorAll('.scoreboard-select');
      const boardResults = [];

      // Collect all board results and compute total BP
      let t1BP = 0, t2BP = 0;
      for (const sel of selects) {
        const val = sel.value.trim();
        if (!val) continue;

        boardResults.push({ boardNum: parseInt(sel.dataset.board), result: val });

        if (val === '1-0' || val === '1-0F') t1BP += 1;
        else if (val === '0-1' || val === '0-1F') t2BP += 1;
        else if (val === '0.5-0.5') { t1BP += 0.5; t2BP += 0.5; }
        // 0-0F: no points
      }

      if (boardResults.length === 0) {
        showToast('No results to submit.', 'warning');
        return;
      }

      try {
        showLoading("Locking match results...");
        
        // DIRECT PATH: Use DB.saveTeamMatchResult for atomic team result submission.
        // This ONLY updates the round document — it does NOT trigger finalization.
        await DB.saveTeamMatchResult(tournamentId, roundNum, matchNumber, boardResults, t1BP, t2BP);
        
        // Recalculate standings after saving
        await Tournament.recalculateStandings(tournamentId);

        showToast(`Match results locked. Score: ${t1BP} - ${t2BP}`, 'success');
        overlay.remove();
        const fresh = await DB.getTournament(tournamentId);
        UI.renderTournamentView(fresh);
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        hideLoading();
      }
    });
  }

  /**
   * syncLiveScoreboard: Updates the match score badge in real-time.
   * Globally exposed via window.syncLiveScoreboard for inline onchange handlers.
   */
  function syncLiveScoreboard(triggeredSelect) {
    const overlay = document.querySelector('.modal-overlay.active');
    if (!overlay) return;

    const selects = overlay.querySelectorAll('.scoreboard-select');
    if (!selects || selects.length === 0) return;

    let t1BP = 0, t2BP = 0;
    let allFilled = true;
    const validResults = ['1-0', '0-1', '0.5-0.5', '1-0F', '0-1F', '0-0F'];

    for (const sel of selects) {
      const val = sel.value.trim();

      // Check if this board has a valid result selected
      if (!val || !validResults.includes(val)) {
        allFilled = false;
      }

      // Real-time border styling based on result
      if (val === '1-0' || val === '1-0F') {
        sel.style.borderColor = '#81b64c';
        t1BP += 1;
      } else if (val === '0-1' || val === '0-1F') {
        sel.style.borderColor = '#f43f5e';
        t2BP += 1;
      } else if (val === '0.5-0.5') {
        sel.style.borderColor = '#38bdf8';
        t1BP += 0.5;
        t2BP += 0.5;
      } else if (val === '0-0F') {
        sel.style.borderColor = '#f59e0b';
        // 0-0 Forfeit: no points awarded
      } else {
        sel.style.borderColor = 'rgba(255,255,255,0.1)';
      }
    }

    // Update the live scoreboard badge
    const homeBpEl = overlay.querySelector('#home-bp-live');
    const awayBpEl = overlay.querySelector('#away-bp-live');
    if (homeBpEl) homeBpEl.textContent = t1BP.toFixed(1);
    if (awayBpEl) awayBpEl.textContent = t2BP.toFixed(1);

    // Enable/Disable the Lock button based on all boards filled
    const lockBtn = overlay.querySelector('#btn-lock-results');
    if (lockBtn) {
      if (allFilled && selects.length > 0) {
        lockBtn.disabled = false;
        lockBtn.style.opacity = '1';
        lockBtn.style.cursor = 'pointer';
        lockBtn.style.filter = 'none';
        lockBtn.style.background = '#2563eb';
        lockBtn.style.boxShadow = '0 0 20px rgba(37, 99, 235, 0.3)';
      } else {
        lockBtn.disabled = true;
        lockBtn.style.opacity = '0.5';
        lockBtn.style.cursor = 'not-allowed';
        lockBtn.style.filter = 'grayscale(1)';
        lockBtn.style.background = '#2563eb';
        lockBtn.style.boxShadow = 'none';
      }
    }
  }

  // CRITICAL: Expose globally so inline onchange="window.syncLiveScoreboard(this)" works
  window.syncLiveScoreboard = syncLiveScoreboard;

        /**
         * FEATURE: Contact Us / Support Modal
         * Displays club contact details and developer credits with premium styling.
         */
        function showContactModal() {
          const container = document.getElementById('modal-container');
          if (!container) return;
          container.innerHTML = '';

          const overlay = document.createElement('div');
          overlay.className = 'modal-overlay active fade-in';
          overlay.style.cssText = 'z-index: 10000;'; // Ensure it's above everything

          // Dismissal logic
          overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

          overlay.innerHTML = `
      <style>
        .contact-modal {
          background: #11100f;
          border: 1px solid #2b2a27;
          border-radius: 24px;
          width: 100%;
          max-width: 480px;
          padding: 2.5rem;
          color: #fff;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
          position: relative;
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
        }
        .contact-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 2rem;
        }
        .contact-card {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 16px;
          padding: 1.25rem;
          display: flex;
          align-items: center;
          gap: 1rem;
          text-decoration: none;
          color: #fff;
          transition: all 0.2s ease;
          margin-bottom: 1rem;
        }
        .contact-card:hover {
          background: rgba(144, 202, 87, 0.08);
          border-color: rgba(144, 202, 87, 0.3);
          transform: translateY(-2px);
        }
        .contact-icon {
          width: 40px;
          height: 40px;
          background: #1a1917;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.25rem;
          border: 1px solid #2b2a27;
        }
        .contact-link {
          color: #fff;
          text-decoration: none;
          font-weight: 700;
          transition: color 0.2s ease;
        }
        .contact-link:hover {
          color: var(--accent-primary);
        }
        .dev-footer {
          margin-top: 2.5rem;
          padding-top: 2rem;
          border-top: 1px solid #2b2a27;
          text-align: center;
        }
        .dev-badge {
          background: linear-gradient(135deg, #1a1917 0%, #11100f 100%);
          border: 1px solid #2b2a27;
          border-radius: 16px;
          padding: 1.5rem;
          position: relative;
          overflow: hidden;
        }
        .dev-badge::before {
          content: '♞';
          position: absolute;
          right: -10px;
          bottom: -15px;
          font-size: 4rem;
          opacity: 0.03;
          pointer-events: none;
        }
      </style>

      <div class="contact-modal fade-in-up">
        <div class="contact-header">
          <div>
            <h2 style="font-size: 1.5rem; font-weight: 900; margin: 0; letter-spacing: -0.5px;">Contact Support</h2>
            <p style="color: #9d9b98; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; margin: 0.25rem 0 0 0;">Tabuko Chess Club</p>
          </div>
          <button class="btn btn-secondary" style="border-radius: 50%; width: 40px; height: 40px; padding: 0;" onclick="this.closest('.modal-overlay').remove()">✕</button>
        </div>

        <div class="contact-list">
          <a href="mailto:club-email@gmail.com" class="contact-card">
            <div class="contact-icon">📧</div>
            <div>
              <div style="font-size: 0.7rem; font-weight: 800; color: #9d9b98; text-transform: uppercase; letter-spacing: 1px;">Email Support</div>
              <div class="contact-link">club-email@gmail.com</div>
            </div>
          </a>

          <a href="tel:09934748725" class="contact-card">
            <div class="contact-icon">📞</div>
            <div>
              <div style="font-size: 0.7rem; font-weight: 800; color: #9d9b98; text-transform: uppercase; letter-spacing: 1px;">Hotline</div>
              <div class="contact-link">09934748725</div>
            </div>
          </a>

          <a href="https://facebook.com/tabukochess" target="_blank" class="contact-card">
            <div class="contact-icon">🌐</div>
            <div>
              <div style="font-size: 0.7rem; font-weight: 800; color: #9d9b98; text-transform: uppercase; letter-spacing: 1px;">Facebook</div>
              <div class="contact-link">Tabuko Chess Club Page</div>
            </div>
          </a>
        </div>

        <div class="dev-footer">
          <div class="dev-badge">
            <div style="color: var(--accent-primary); font-size: 0.65rem; font-weight: 800; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 0.5rem;">System Architect</div>
            <div style="font-size: 1.1rem; font-weight: 900; color: #fff;">Jesster Girado</div>
            <div style="color: #9d9b98; font-size: 0.85rem; margin-top: 0.25rem;">Designed & Developed with excellence</div>
            <a href="mailto:jesstergirado@gmail.com" style="display: inline-block; margin-top: 1rem; color: var(--accent-primary); font-size: 0.85rem; font-weight: 700; text-decoration: none; border-bottom: 1px solid rgba(144, 202, 87, 0.3);">
              jesstergirado@gmail.com
            </a>
          </div>
        </div>
      </div>`;

          container.appendChild(overlay);
        }

        /**
         * copyTVLink: Constructs and copies the public TV link using Hash routing.
         * This prevents routers from stripping parameters.
         */
        function copyTVLink(id) {
          const url = window.location.origin + '/tv.html#' + id;
          navigator.clipboard.writeText(url).then(() => {
            UI.showToast('🔗 TV Hash-Link copied!', 'success');
          }).catch(err => {
            alert('Link: ' + url);
          });
        }

        /**
         * openTVTab: Saves ID to local storage and opens the TV page.
         */
        function openTVTab(id) {
          localStorage.setItem('tabuko_active_tv_id', id);
          window.open('tv.html', '_blank');
        }

        /**
         * initTournamentListeners: Establishes the real-time Firebase pipeline.
         * Listens to both the player registry and the match collection.
         */
        /**
         * initTournamentListeners: Establish the real-time bridge (Dual Data Stream)
         */
        function initTournamentListeners(tournamentId, totalRounds) {
          // 1. Cleanup previous listeners
          tournamentUnsubscribe.forEach(unsub => unsub());
          tournamentUnsubscribe = [];

          console.log('[UI] Initializing Real-Time Sync for Tournament:', tournamentId);

          const isTeam = window.activeTournament?.isTeamEvent;

          // Listener 1: Entity Registry
          let entityUnsub;
          if (isTeam) {
            entityUnsub = db.collection('tournaments').doc(tournamentId).collection('teams')
              .onSnapshot((snap) => {
                window.currentTeams = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                UI.triggerStandingsUpdate(totalRounds);
              }, (err) => console.error('[UI] Team Listener Error:', err));
          } else {
            entityUnsub = db.collection('tournaments').doc(tournamentId).collection('playerData')
              .onSnapshot((snap) => {
                window.currentPlayers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                currentPlayers = window.currentPlayers;
                UI.triggerStandingsUpdate(totalRounds);
              }, (err) => console.error('[UI] Player Listener Error:', err));
          }

          // Listener 2: Rounds (Matches)
          const matchesUnsub = db.collection('tournaments').doc(tournamentId).collection('rounds')
            .onSnapshot((snap) => {
              window.currentMatches = [];
              window.currentRounds = [];

              snap.docs.forEach(doc => {
                const roundData = { id: doc.id, ...doc.data() };
                window.currentRounds.push(roundData);
                const rdNum = parseInt(roundData.roundNumber || doc.id.replace('round_', ''), 10);

                if (roundData.teamMatches) {
                  window.currentMatches.push(...roundData.teamMatches.map(p => ({
                    ...p,
                    round: rdNum
                  })));
                }

                if (roundData.pairings) {
                  window.currentMatches.push(...roundData.pairings.map(p => ({
                    ...p,
                    round: rdNum
                  })));
                }
              });

              currentMatches = window.currentMatches;
              UI.triggerStandingsUpdate(totalRounds);
            }, (err) => console.error('[UI] Match Listener Error:', err));

          tournamentUnsubscribe.push(entityUnsub, matchesUnsub);
        }


        /**
         * renderStandingsTable: Enterprise 12-Column FIDE Layout
         * RK, SURNAME NAME, CLUB, RTG, PTS, BHC1, BH, SB, PS, DE, WIN, BWG
         */
        function renderStandingsTable(sortedStandings) {
          const container = document.getElementById('enterprise-table-root');
          if (!container) return;

          if (!sortedStandings || sortedStandings.length === 0) {
            container.innerHTML = `
        <div class="card" style="padding: 0; overflow: hidden; border: 1px solid #334155; background: #1e293b;">
          <table class="enterprise-table">
            <thead>
              <tr style="background: #0f172a;"><th>RK</th><th class="text-left">SURNAME, NAME</th><th class="text-left">CLUB</th><th>RTG</th><th>PTS</th><th>BHC1</th><th>BH</th><th>SB</th><th>PS</th><th>DE</th><th>WIN</th><th>BWG</th></tr>
            </thead>
            <tbody>
              <tr><td colspan="12" style="text-align: center; color: #94a3b8; padding: 40px; font-weight: 600;">Not Available</td></tr>
            </tbody>
          </table>
        </div>`;
            return;
          }

          const isOfficial = window.activeTournament?.status === 'completed';

          const rows = sortedStandings.map((p, i) => {
            const rank = p.rank || (i + 1);

            // Highlight Logic: Gold, Silver, Bronze classes
            let highlightClass = '';
            if (rank === 1) highlightClass = 'medal-gold';
            else if (rank === 2) highlightClass = 'medal-silver';
            else if (rank === 3) highlightClass = 'medal-bronze';

            return `
        <tr class="${highlightClass}" style="border-bottom: 1px solid #334155;">
          <td class="text-center rank-col" style="width: 40px;">
            ${rank <= 3 ? `<span class="medal-badge">${rank}</span>` : rank}
          </td>
          <td class="text-left name-col">${p.name || 'Unknown'}</td>
          <td class="text-left" style="color: #94a3b8; font-size: 0.75rem;">${p.club || '-'}</td>
          <td class="text-center font-mono">${p.rating || 0}</td>
          <td class="text-center pts-column">${Number(p.score || 0).toFixed(1)}</td>
          <td class="text-center" style="color: #94a3b8;">${Number(p.bhc1 || 0).toFixed(1)}</td>
          <td class="text-center" style="color: #94a3b8;">${Number(p.bh || 0).toFixed(1)}</td>
          <td class="text-center" style="color: #94a3b8;">${Number(p.sb || 0).toFixed(2)}</td>
          <td class="text-center" style="color: #94a3b8;">${Math.floor(p.ps || 0)}</td>
          <td class="text-center" style="color: #94a3b8;">${Math.floor(p.de || 0)}</td>
          <td class="text-center" style="color: #94a3b8;">${Math.floor(p.win || 0)}</td>
          <td class="text-center" style="color: #94a3b8;">${Math.floor(p.bwg || 0)}</td>
        </tr>`;
          }).join('');

          container.innerHTML = `
      <div class="flex justify-between items-center mb-3">
        <div class="flex items-center gap-3">
          <span class="badge ${isOfficial ? 'badge-success' : 'badge-warning'}" style="font-size: 0.65rem; padding: 4px 8px; letter-spacing: 1px; font-weight: 800;">
            ${isOfficial ? 'OFFICIAL STANDINGS' : 'LIVE (UNOFFICIAL)'}
          </span>
          <span style="color: #64748b; font-size: 0.7rem; font-weight: 600;">Computed via FIDE C.02.13.2</span>
        </div>
      </div>

      <div class="card" style="padding: 0; overflow: hidden; background: #1e293b; border: 1px solid #334155;">
        <div class="table-wrap" style="margin: 0; max-height: 70vh; overflow-y: auto;">
          <table class="enterprise-table" style="position: relative;">
            <thead style="position: sticky; top: 0; z-index: 10;">
              <tr>
                <th>RK</th>
                <th class="text-left">SURNAME, NAME</th>
                <th class="text-left">CLUB</th>
                <th>RTG</th>
                <th>PTS</th>
                <th>BHC1</th>
                <th>BH</th>
                <th>SB</th>
                <th>PS</th>
                <th>DE</th>
                <th>WIN</th>
                <th>BWG</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
        }

        /**
         * renderTeamStandings: SYSTEM A Official Ranking
         */
        function renderTeamStandings(sortedTeams) {
          const container = document.getElementById('enterprise-table-root');
          if (!container) return;

          const rows = sortedTeams.map((t, i) => `
      <tr style="border-bottom: 1px solid #334155;">
        <td class="text-center rank-col" style="width: 40px;">${t.rank}</td>
        <td class="text-left" style="font-weight: 700; color: #f8fafc; font-size: 1rem;">${t.name}</td>
        <td class="text-center pts-column" style="font-size: 1.2rem;">${t.mp || 0}</td>
        <td class="text-center" style="font-weight: 700;">${t.bp || 0}</td>
        <td class="text-center" style="color: var(--text-secondary);">${t.tb || 0}</td>
        <td class="text-center" style="color: var(--text-secondary);">${(t.tsb || 0).toFixed(2)}</td>
        <td class="text-center" style="color: var(--text-muted); font-family: monospace;">${t.de || '-'}</td>
      </tr>
    `).join('');

          container.innerHTML = `
      <div class="mb-8">
        <div class="flex justify-between items-center mb-4">
          <h3 style="color: var(--accent-primary); text-transform: uppercase; letter-spacing: 2px;">System A: Team Standings</h3>
          <span class="badge badge-success">Official FIDE Ranking</span>
        </div>
        <div class="card" style="padding: 0; overflow: hidden; background: #1e293b; border: 1px solid #334155;">
          <div class="table-wrap" style="margin: 0;">
            <table class="enterprise-table">
              <thead>
                <tr style="background: #0f172a;">
                  <th style="width: 40px;">RK</th>
                  <th class="text-left">TEAM NAME</th>
                  <th title="Match Points">MP</th>
                  <th title="Board Points">BP</th>
                  <th title="Team Buchholz">TB</th>
                  <th title="Team Sonneborn-Berger">TSB</th>
                  <th title="Direct Encounter">DE</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>
      </div>
      <div id="board-standings-hub-root"></div>
    `;
        }

        /**
         * renderBoardStandingsRoom: SYSTEM B Board Hub
         * Generates a multi-tab interface for individual board rankings.
         */
        function renderBoardStandingsRoom(boardData) {
          const root = document.getElementById('board-standings-hub-root');
          if (!root) return;

          const boards = Object.keys(boardData).sort((a, b) => a - b);
          if (boards.length === 0) {
            root.innerHTML = `<p class="text-muted text-center p-8">Individual board data will appear after Round 1.</p>`;
            return;
          }

          // Default to Board 1
          const activeBoard = window.activeBoardTab || boards[0];

          root.innerHTML = `
      <div class="mt-12">
        <div class="flex justify-between items-center mb-6">
          <h3 style="color: var(--accent-sapphire); text-transform: uppercase; letter-spacing: 2px;">System B: Board Standings Hub</h3>
          <div class="flex gap-2">
            <span class="badge badge-secondary">Swiss System per Board</span>
          </div>
        </div>

        <div class="board-hub-nav">
          ${boards.map(b => `
            <button class="board-tab-btn ${b === activeBoard ? 'active' : ''}" data-board="${b}">
              Board ${b}
            </button>
          `).join('')}
        </div>

        <div id="board-leaderboard-container">
          ${renderSingleBoardTable(boardData[activeBoard])}
        </div>
      </div>
    `;

          // Bind Tab Switching
          root.querySelectorAll('.board-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
              const boardNum = btn.dataset.board;
              window.activeBoardTab = boardNum;

              root.querySelectorAll('.board-tab-btn').forEach(b => b.classList.remove('active'));
              btn.classList.add('active');

              document.getElementById('board-leaderboard-container').innerHTML = renderSingleBoardTable(boardData[boardNum]);
            });
          });
        }

        function renderSingleBoardTable(players) {
          if (!players || players.length === 0) return '<p class="p-8 text-center text-muted">No data for this board.</p>';

          const rows = players.map((p, i) => {
            let highlight = '';
            if (p.rank === 1) highlight = 'podium-gold';
            else if (p.rank === 2) highlight = 'podium-silver';
            else if (p.rank === 3) highlight = 'podium-bronze';

            return `
        <tr class="${highlight}">
          <td class="text-center rank-col" style="width: 50px;">
            ${p.rank <= 3 ? `<span class="medal-rank">${p.rank}</span>` : p.rank}
          </td>
          <td>
            <div style="font-weight: 700; color: #fff;">${p.name}</div>
            <div style="font-size: 0.7rem; color: #64748b; font-weight: 600;">${p.teamName || 'Independent'}</div>
          </td>
          <td class="text-center pts-column" style="font-size: 1.1rem;">${Number(p.score).toFixed(1)}</td>
          <td class="text-center" style="color: #94a3b8;">${Number(p.bh || 0).toFixed(1)}</td>
          <td class="text-center" style="color: #94a3b8;">${Number(p.sb || 0).toFixed(2)}</td>
          <td class="text-center" style="color: #64748b;">${p.rating || 0}</td>
        </tr>
      `;
          }).join('');

          return `
      <div class="card" style="padding: 0; overflow: hidden; background: #0f172a; border: 1px solid #334155;">
        <div class="table-wrap" style="margin: 0;">
          <table class="enterprise-table">
            <thead>
              <tr>
                <th style="width: 50px;">RK</th>
                <th class="text-left">PLAYER / TEAM</th>
                <th>PTS</th>
                <th>BH</th>
                <th>SB</th>
                <th>RTG</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
        }

        /**
         * renderBoardMedals: FIDE Individual Performance Awards
         * Displays the Top 3 players per board with premium podium styling.
         */
        function renderBoardMedals(boardData) {
          const container = document.getElementById('board-medals-root');
          if (!container) return;

          const boards = Object.keys(boardData).sort((a, b) => a - b);
          if (boards.length === 0) {
            container.innerHTML = `<div class="card" style="padding: 2rem; text-align: center; color: #94a3b8;">
        Individual board medals will be calculated once the eligibility threshold is met.
      </div>`;
            return;
          }

          const cards = boards.map(num => {
            const topPlayers = boardData[num].slice(0, 3); // Only Gold, Silver, Bronze

            const rows = topPlayers.map((p, idx) => {
              const medalClass = idx === 0 ? 'podium-gold' : (idx === 1 ? 'podium-silver' : 'podium-bronze');
              const medalName = idx === 0 ? 'GOLD' : (idx === 1 ? 'SILVER' : 'BRONZE');

              return `
          <tr class="${medalClass}">
            <td class="text-center">
              <span class="medal-rank">${idx + 1}</span>
              <div style="font-size: 0.6rem; font-weight: 800; margin-top: 2px;">${medalName}</div>
            </td>
            <td>
              <div class="name-col" style="font-size: 0.95rem;">${p.name}</div>
              <div style="font-size: 0.7rem; color: #64748b; font-weight: 600;">${p.teamName}</div>
            </td>
            <td class="text-center pts-column" style="font-size: 1.1rem;">${p.points.toFixed(1)}</td>
            <td class="text-center" style="color: #94a3b8; font-weight: 700;">${p.winRate.toFixed(1)}%</td>
            <td class="text-center" style="color: #64748b; font-family: monospace;">${p.gamesPlayed}</td>
          </tr>
        `;
            }).join('');

            return `
        <div class="card" style="background: #0f172a; border: 1px solid #334155; padding: 0; overflow: hidden;">
          <div style="padding: 1rem 1.5rem; background: rgba(255,255,255,0.03); border-bottom: 1px solid #334155;">
            <h4 style="color: #f8fafc; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1.5px; margin: 0; font-weight: 800;">Board ${num} Standings</h4>
          </div>
          <div class="table-wrap" style="margin: 0;">
            <table class="enterprise-table" style="background: transparent;">
              <thead>
                <tr>
                  <th style="width: 60px;">RK</th>
                  <th class="text-left">PLAYER / TEAM</th>
                  <th>PTS</th>
                  <th>WIN %</th>
                  <th>GMS</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>
      `;
          }).join('');

          container.innerHTML = `
      <div class="flex justify-between items-center mb-6 mt-12">
        <h3 style="color: #f8fafc; font-size: 1.25rem; font-weight: 900; text-transform: uppercase; letter-spacing: 1px;">Individual Board Awards</h3>
        <span class="badge badge-success" style="font-size: 0.65rem;">FIDE ELIGIBILITY ENFORCED</span>
      </div>
      <div class="board-medals-grid">
        ${cards}
      </div>
    `;
        }

        /**
         * triggerStandingsUpdate: The reactive render trigger for the standings pipeline.
         * Ensures the view updates whenever a match result is recorded or a listener fires.
         */
        function triggerStandingsUpdate() {
          const matchRounds = (window.currentMatches || []).map(m => m.round || 0);
          const maxMatchRound = Math.max(0, ...matchRounds);
          const targetRound = maxMatchRound || window.activeTournament?.currentRound || 1;
          UI.updateStandingsView(targetRound);
        }

        async function updateStandingsView(targetRound) {
          const container = document.getElementById('enterprise-table-root');
          if (!container) return;

          try {
            console.log(`🔥 [UI] Standings Pipeline Sync: Round ${targetRound}`);

            const tournamentId = window.activeTournament?.id;
            const isTeam = window.activeTournament?.isTeamEvent;

            // 1. Fetch Standing Cache (Atomic Performance)
            const cacheRef = db.collection('tournaments').doc(tournamentId).collection('standings_cache').doc(`round_${targetRound}`);
            const cacheSnap = await cacheRef.get();

            if (cacheSnap.exists) {
              const data = cacheSnap.data();
              if (isTeam) {
                renderTeamStandings(data.teams || []);
                renderBoardStandingsRoom(data.boards || {});
              } else {
                renderStandingsTable(data.players || []);
              }
              return;
            }

            // 2. Fallback: Live Calculation (Legacy or Registration Phase)
            const totalRounds = window.activeTournament?.totalRounds || 9;
            const teamSize = window.activeTournament?.teamSize || 4;

            if (isTeam) {
              if (typeof TeamStandings === 'undefined') throw new Error("TeamStandings.js missing.");
              const standings = TeamStandings.computeTeamStandings(window.currentTeams || [], window.currentRounds || [], window.activeTournament);
              renderTeamStandings(standings);

              // Pass currentTeams for name hydration (prevents "Vacant" in live view)
              const boards = TeamStandings.generateBoardStandings(window.currentRounds || [], totalRounds, {}, window.currentTeams || []);
              renderBoardStandingsRoom(boards);
            } else {
              const prepared = Standings.prepareDataForTiebreaks(currentPlayers, currentMatches, targetRound);
              const standings = TieBreak.rankPlayers(prepared, null, totalRounds);
              window.liveStandingsMap = {};
              standings.forEach(p => window.liveStandingsMap[p.id] = p);
              renderStandingsTable(standings);
            }

          } catch (error) {
            console.error("🚨 STANDINGS PIPELINE CRASH:", error);
            container.innerHTML = `<div class="badge badge-danger p-4">Standings Error: ${error.message}</div>`;
          } finally {
            hideLoading();
          }
        }

        async function exportTournamentTRF(tournamentId) {
          try {
            showLoading();
            const trf = await Tournament.generateFideTRF(tournamentId);
            const blob = new Blob([trf], { type: 'text/plain' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `tournament_report_${tournamentId}.trf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
            showToast('FIDE TRF exported successfully', 'success');
          } catch (err) {
            showToast('Export failed: ' + err.message, 'error');
          } finally {
            hideLoading();
          }
        }

  async function renderArchiveRoom() {
    showLoading();
    try {
      const snap = await db.collection('tournaments')
        .where('status', 'in', ['completed', 'finished', 'archived'])
        .orderBy('createdAt', 'desc')
        .get();

      let gridHtml = '';
      if (snap.empty) {
        gridHtml = '<div class="card" style="grid-column: 1 / -1; text-align: center; padding: 3rem;"><p class="text-muted">No completed tournaments found.</p></div>';
      } else {
        gridHtml = snap.docs.map(doc => {
          const t = doc.data();
          const dateStr = t.completedAt ? new Date(t.completedAt.seconds * 1000).toLocaleDateString() : (t.createdAt ? new Date(t.createdAt.seconds * 1000).toLocaleDateString() : 'Unknown');
          return `
            <div class="card stat-card fade-in">
              <div style="font-size: 0.8rem; color: var(--text-muted); font-weight: 800; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 0.5rem;">${dateStr}</div>
              <h3 style="font-size: 1.25rem; font-weight: 800; color: #fff; margin-bottom: 0.5rem;">${t.name}</h3>
              <p class="text-muted" style="font-size: 0.85rem; margin-bottom: 1.5rem;">${t.isTeamEvent ? 'Team Event' : 'Individual Swiss'} • ${t.totalRounds} Rounds</p>
              <button class="btn btn-secondary btn-sm" style="width: 100%;" onclick="App.navigateTo('tournament', '${doc.id}')">View Final Standings</button>
            </div>
          `;
        }).join('');
      }

      const content = `
        <div class="fade-in">
          <h1 style="font-size: 2.5rem; font-weight: 900; margin-bottom: 0.5rem;">Tournament Archive</h1>
          <p class="text-muted" style="margin-bottom: 2rem;">Historical records of all finalized Tabuko events.</p>
          <div id="archive-grid" class="stats-grid">
            ${gridHtml}
          </div>
        </div>
      `;

      renderLayout('Tournament Archive', content, 'archive');

    } catch (err) {
      console.error("Archive fetch error:", err);
      showToast("Error loading archive: " + err.message, "error");
    } finally {
      hideLoading();
    }
  }

  const UI = {
    renderLogin, renderDashboard, renderTournamentView, renderPlayersPage, renderRosterPage, renderSettingsPage, renderAuditLogPage, renderArchiveRoom,
    renderCreateTournament, renderAddPlayerModal, renderTournamentTab, renderMemberModal, renderEditTournamentModal, renderEditTournamentPlayerModal,
    renderImportModal, renderTeamModal, renderTeamEditModal, renderLiveView, renderTournamentSettingsModal,
    openMemberPortal, renderMemberPortalUI, onScanSuccess, showScannedProfile, switchHistoryTab, goToHistory, handleSaveMember,
    openHistoryModal, closeHistoryModal, copyTVLink, openTVTab,
    renderResultModal, saveAllResults, renderTeamResultModal,
    renderAddRoundModal, renderLateEntryModal, toggleWithdrawal, showContactModal,
    addTournamentRoundPrompt,
    showToast, showLoading, hideLoading, printPairings, printStandings, confirmDeleteTournament,
    initTournamentListeners, triggerStandingsUpdate, updateStandingsView, renderStandingsTable, renderTeamStandings, renderBoardStandingsRoom,
    renderTeamPairings, exportTournamentTRF, syncLiveScoreboard
  };

  // ── REFACTORED NETWORK HEALTH LISTENER ──
  window.addEventListener('tournament_health_update', (e) => {
    const { pendingCount, isOnline, role, error } = e.detail;
    const orb = document.getElementById('system-status-orb');
    const liveIndicator = document.getElementById('live-indicator-mini');
    const tSync = document.getElementById('tooltip-sync-text');
    const tAuth = document.getElementById('tooltip-auth-text');

    if (!orb) return;

    // Reset classes
    orb.className = 'system-status-orb';
    if (liveIndicator) liveIndicator.style.display = isOnline ? 'block' : 'none';

    // 1. Logic-to-Orb Mapping
    if (error) {
      orb.classList.add('orb-blink-red');
      if (tSync) tSync.textContent = "Connectivity / Permission Error";
    } else if (!isOnline) {
      orb.classList.add('orb-solid-amber');
      if (tSync) tSync.textContent = `Offline Mode: ${pendingCount} updates queued`;
    } else {
      orb.classList.add('orb-pulse-green');
      if (tSync) tSync.textContent = pendingCount > 0 ? `Synchronising ${pendingCount} updates...` : "System Fully Synced";
    }

    // 2. Auth Level Mapping
    if (tAuth) {
      const labels = { lead: 'Primary Authority', assistant: 'Secondary Arbiter', staff: 'Staff Observer' };
      tAuth.textContent = `Arbiter: ${labels[role] || 'Authorising...'}`;
    }

    // Update Dashboard Health if present
    const dashHealth = document.getElementById('dashboard-health-score');
    if (dashHealth) {
      const health = pendingCount > 0 ? Math.max(10, 100 - (pendingCount * 5)) : 100;
      dashHealth.textContent = `${health}%`;
    }
  });

  // ── PILLAR 1: OPS REPLAY OVERLAY ──
  window.addEventListener('ops_replay', (e) => {
    const { ops } = e.detail;
    // Highlight pending results in the UI if visible
    ops.filter(op => op.status === 'pending').forEach(op => {
      if (op.type === 'SUBMIT_RESULT') {
        const sel = document.querySelector(`.result-select[data-board="${op.payload.board}"]`);
        if (sel) {
          sel.classList.add('op-pending');
          // sel.value = `${op.payload.whiteScore}-${op.payload.blackScore}`; // Optional: force value
        }
      }
    });
  });

  /**
   * PILLAR 2: CONFLICT RESOLVER UI
   */
  function renderConflictResolver(op, remoteData, callback) {
    const container = document.getElementById('modal-container');
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay active';
    overlay.innerHTML = `
      <div class="conflict-card fade-in">
        <h2 style="color: var(--accent-warning); margin-bottom: 1rem;">⚠️ DATA CONFLICT DETECTED</h2>
        <p class="text-muted">An authoritative result already exists on the server for Board ${op.payload.board}.</p>
        
        <div class="conflict-option" onclick="this.parentElement.dataset.choice='local'; this.parentElement.querySelectorAll('.conflict-option').forEach(el=>el.classList.remove('active')); this.classList.add('active');">
          <div style="font-weight: 800; font-size: 0.8rem; text-transform: uppercase; color: var(--accent-primary);">Local (Your Device)</div>
          <div style="font-size: 1.25rem; font-weight: 900;">${op.payload.whiteScore} - ${op.payload.blackScore}</div>
          <div class="text-muted text-xs">Submitted by you just now</div>
        </div>

        <div class="conflict-option" onclick="this.parentElement.dataset.choice='remote'; this.parentElement.querySelectorAll('.conflict-option').forEach(el=>el.classList.remove('active')); this.classList.add('active');">
          <div style="font-weight: 800; font-size: 0.8rem; text-transform: uppercase; color: var(--accent-sapphire);">Remote (Cloud)</div>
          <div style="font-size: 1.25rem; font-weight: 900;">${remoteData.whiteScore} - ${remoteData.blackScore}</div>
          <div class="text-muted text-xs">Authority: Cloud Server</div>
        </div>

        <div class="flex gap-4 mt-8">
          <button class="btn btn-primary w-full" id="btn-resolve-conflict">Confirm Authoritative Data</button>
        </div>
      </div>
    `;
    container.appendChild(overlay);

    overlay.querySelector('#btn-resolve-conflict').onclick = () => {
      const choice = overlay.querySelector('.conflict-card').dataset.choice;
      if (!choice) return UI.showToast('Please select a version', 'warning');
      overlay.remove();
      callback(choice);
    };
  }

  /**
   * PILLAR 4: NOTIFICATION CENTER
   */
  function showConflictNotification(op, remoteData) {
    let notifyCenter = document.getElementById('notification-center');
    if (!notifyCenter) {
      notifyCenter = document.createElement('div');
      notifyCenter.id = 'notification-center';
      notifyCenter.className = 'notification-center';
      document.body.appendChild(notifyCenter);
    }

    const toast = document.createElement('div');
    toast.className = 'notification-toast conflict';
    toast.innerHTML = `
      <div class="title">Sync Auto-Resolved</div>
      <div class="desc">Lead Authority overrode Staff entry on Board ${op.payload.board}</div>
      <div class="actions">
        <button class="btn btn-secondary btn-xs" onclick="this.closest('.notification-toast').remove()">Dismiss</button>
        <button class="btn btn-primary btn-xs" onclick="UI.renderConflictResolver(${JSON.stringify(op).replace(/"/g, '&quot;')}, ${JSON.stringify(remoteData).replace(/"/g, '&quot;')}, (choice) => { console.log('Manual override:', choice); }); this.closest('.notification-toast').remove()">Audit</button>
      </div>
    `;
    notifyCenter.appendChild(toast);
    setTimeout(() => toast.remove(), 10000);
  }

  /**
   * PILLAR 4: PRESTIGE PLAYER PASSPORT
   */
  async function renderPlayerPassport(playerId) {
    showLoading();
    try {
      const passport = await PlayerRegistry.getPassport(playerId);
      if (!passport) throw new Error('Passport not found');

      // PILLAR 2: Privacy Shield
      const isOwner = Auth.getUser() && Auth.getUser().uid === passport.auth.claimedBy;
      const privacy = passport.privacySettings || { isPublic: true };
      
      if (!privacy.isPublic && !isOwner) {
        return renderLayout('Private Profile', `
          <div class="passport-viewport flex items-center justify-center">
            <div class="text-center fade-in">
              <div class="text-6xl mb-4">🛡️</div>
              <h1 class="text-2xl font-bold">PROFILE HIDDEN</h1>
              <p class="text-muted">This player has set their passport to Private.</p>
              <button class="btn btn-secondary mt-8" onclick="App.navigateTo('players')">Back to Registry</button>
            </div>
          </div>
        `, 'players');
      }

      const h2h = (Auth.getUser() && Auth.getUser().uid !== passport.auth.claimedBy && privacy.allowRivalryLookup) 
                 ? await EloEngine.getRivalryReport(Auth.getUser().uid, playerId) : null;

      const content = `
        <div class="passport-viewport fade-in">
          <!-- 1. THE DIGITAL ID CARD -->
          <div class="id-card-wrap">
            <div class="id-card">
              <div class="id-photo-wrap">
                ${passport.rankTier === 'Grandmaster' ? '👑' : '♟️'}
              </div>
              <div class="id-details">
                <div class="flex justify-between items-start">
                  <div>
                    <h1 class="id-name">${privacy.hideIdentity && !isOwner ? 'Verified Player' : passport.identity.name}</h1>
                    <div class="id-tier">${passport.rankTier} Rank</div>
                  </div>
                  <div class="passport-qr">
                    <div class="qr-placeholder" style="width: 80px; height: 80px; background: rgba(255,255,255,0.05); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 0.7rem; color: var(--text-muted);">Tabuko ID</div>
                  </div>
                </div>
                <div class="grid grid-cols-2 gap-4 mt-6">
                  <div class="stat-mini">
                    <div class="label">Club</div>
                    <div class="value">${privacy.hideIdentity && !isOwner ? 'Hidden' : passport.identity.club}</div>
                  </div>
                  <div class="stat-mini">
                    <div class="label">NCFP ID</div>
                    <div class="value">${privacy.hideIdentity && !isOwner ? '••••••' : (passport.identity.ncfpId || 'Unregistered')}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 2. ANALYTICS GRID -->
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-label">Current ELO</div>
              <div class="stat-value">${passport.ratings.currentElo}</div>
              <div class="sparkline-wrap">
                ${privacy.showEloTrend || isOwner ? renderSparkline(passport.ratings.performanceHistory) : '<div class="text-xs text-muted mt-4">Trend Hidden</div>'}
              </div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Win Rate</div>
              <div class="stat-value">${(passport.stats.winRate || 0).toFixed(1)}%</div>
              <div class="text-xs text-muted mt-2">${passport.stats.wins}W / ${passport.stats.draws}D / ${passport.stats.losses}L</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Upsets</div>
              <div class="stat-value">${passport.stats.upsetCount || 0}</div>
              <div class="text-xs text-muted mt-2">"Giant Slayer" victories</div>
            </div>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <!-- 3. PERFORMANCE RADAR -->
            <div class="radar-wrap">
              <h3 class="stat-label mb-6">Performance Radar</h3>
              ${renderPerformanceRadar(passport)}
            </div>

            <!-- 4. BADGE GALLERY -->
            <div class="stat-card">
              <h3 class="stat-label">Achievement Badges</h3>
              <div class="badge-gallery">
                ${(passport.achievements || []).map(a => `
                  <div class="badge-item" data-tip="${a.name}: ${a.desc}">${getBadgeIcon(a.id)}</div>
                `).join('')}
                ${passport.stats.wins >= 10 ? '<div class="badge-item" data-tip="Veteran: 10+ Wins">🎖️</div>' : ''}
              </div>
              
              <!-- 5. H2H SOCIAL HOOK -->
              ${h2h ? `
                <div class="mt-8 pt-8 border-t border-white/5">
                  <h3 class="stat-label">Rivalry Summary</h3>
                  <div class="rivalry-hook mt-4">
                    <p class="text-sm italic text-emerald-400">
                      "Battle for Supremacy: You vs. ${passport.identity.name.split(' ')[0]}. ${h2h.record.split('-')[0] > h2h.record.split('-')[2] ? 'You lead' : (h2h.record.split('-')[0] < h2h.record.split('-')[2] ? passport.identity.name.split(' ')[0] + ' leads' : 'It\'s a deadlock')} ${h2h.record}. Next match could decide the local rank #1."
                    </p>
                    <div class="flex items-center gap-4 mt-4">
                      <div class="stat-value text-xl">${h2h.record}</div>
                      <div class="text-xs text-muted">Total Encounters: ${h2h.totalGames}</div>
                    </div>
                  </div>
                </div>
              ` : ''}
            </div>
          </div>

          <div class="mt-12 flex gap-4">
            ${!passport.auth.claimedBy ? `
              <button class="btn btn-primary" onclick="UI.handleProfileClaim('${passport.pid}')">Claim Profile</button>
            ` : '<div class="text-xs text-emerald-500">✓ Verified Identity</div>'}
            <button class="btn btn-secondary" onclick="window.print()">Export Resume</button>
          </div>
        </div>
      `;

      renderLayout('Player Passport', content, 'players');
    } catch (err) {
      console.error(err);
      UI.showToast(err.message, 'error');
    } finally {
      hideLoading();
    }
  }

  function renderSparkline(history) {
    if (!history || history.length < 2) return '';
    const points = history.slice(-20).map(h => h.rating);
    const min = Math.min(...points) - 50;
    const max = Math.max(...points) + 50;
    const range = max - min;
    const width = 200, height = 80;

    const coords = points.map((p, i) => ({
      x: (i / (points.length - 1)) * width,
      y: height - ((p - min) / range) * height
    }));

    const d = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ');
    return `
      <svg width="100%" height="80" viewBox="0 0 200 80" preserveAspectRatio="none">
        <path d="${d}" fill="none" stroke="var(--prestige-emerald)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
        <path d="${d} L ${width} ${height} L 0 ${height} Z" fill="url(#grad)" opacity="0.1" />
        <defs>
          <linearGradient id="grad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style="stop-color:var(--prestige-emerald);stop-opacity:1" />
            <stop offset="100%" style="stop-color:var(--prestige-emerald);stop-opacity:0" />
          </linearGradient>
        </defs>
      </svg>
    `;
  }

  function renderPerformanceRadar(p) {
    const metrics = PerformanceAnalytics.computeRadarMetrics(p);
    const size = 200;
    const center = size / 2;
    const radius = size * 0.4;
    const points = PerformanceAnalytics.getPolygonPoints(metrics, radius, center);

    const d = points.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ') + ' Z';
    
    return `
      <svg width="250" height="250" viewBox="0 0 250 250">
        <circle cx="125" cy="125" r="${radius}" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="1" />
        <circle cx="125" cy="125" r="${radius * 0.75}" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="1" />
        <circle cx="125" cy="125" r="${radius * 0.5}" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="1" />
        <circle cx="125" cy="125" r="${radius * 0.25}" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="1" />
        ${metrics.map((m, i) => {
          const angle = (i / metrics.length) * Math.PI * 2 - Math.PI / 2;
          const x = 125 + (radius + 25) * Math.cos(angle);
          const y = 125 + (radius + 25) * Math.sin(angle);
          return `<text x="${x}" y="${y}" fill="#999" font-size="9" text-anchor="middle" dominant-baseline="middle">${m.label}</text>`;
        }).join('')}
        <path d="${d.replace(/100/g, '125')}" transform="translate(0,0)" fill="var(--prestige-emerald)" opacity="0.3" />
        <path d="${d.replace(/100/g, '125')}" transform="translate(0,0)" fill="none" stroke="var(--prestige-emerald)" stroke-width="2" stroke-linejoin="round" />
      </svg>
    `;
  }

  function getBadgeIcon(id) {
    const icons = { 'giant_slayer': '⚔️', 'iron_wall': '🛡️', 'tactical_beast': '🔥' };
    return icons[id] || '🏅';
  }

  async function handleProfileClaim(pid) {
    const user = Auth.getUser();
    if (!user) return UI.showToast('Please sign in to claim your profile', 'warning');
    
    showLoading();
    try {
      await PlayerRegistry.claimProfile(pid, user.uid);
      UI.showToast('Passport claimed successfully!', 'success');
      renderPlayerPassport(pid);
    } catch (err) {
      UI.showToast(err.message, 'error');
    } finally {
      hideLoading();
    }
  }

  UI.renderPlayerPassport = renderPlayerPassport;
  UI.handleProfileClaim = handleProfileClaim;
  UI.renderTeamResultModal = renderTeamResultModal;
  UI.saveAllResults = saveAllResults;
  UI.renderResultModal = renderResultModal;
  UI.renderTeamPairings = renderTeamPairings;

  window.UI = UI;
  return UI;
})();
