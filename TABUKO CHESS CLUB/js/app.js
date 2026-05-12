/**
 * app.js — Main Application Entry Point
 * Handles routing, initialization, and page navigation.
 */
const App = (() => {
  let currentPage = 'dashboard';
  let currentTournamentId = null;

  function init() {
    // 1. Register listener FIRST
    Auth.onAuthChange(async (user, userData) => {
      const hash = window.location.hash;
      const isLive = hash.startsWith('#/live');

      if (user && userData) {
        // If logged in, send to dashboard unless they specifically requested a subpage
        if (!hash || hash === '#/' || hash === '#/login') navigateTo('dashboard');
        else handleInitialRoute();
      } else if (isLive) {
        // AUTH BYPASS for public live links
        handleInitialRoute();
      } else {
        UI.renderLogin();
      }
    });

    function handleInitialRoute() {
      const hash = window.location.hash;
      if (!hash) return;
      const parts = hash.split('?');
      const page = parts[0].replace('#/', '');
      const params = new URLSearchParams(parts[1] || '');
      const id = params.get('id');
      navigateTo(page, id);
    }

    // ── GLOBAL SCROLL ENGINE ──
    window.addEventListener('scroll', () => {
      const bar = document.getElementById('scroll-progress-bar');
      const btn = document.getElementById('btn-back-to-top');
      if (!bar && !btn) return;

      const winScroll = document.body.scrollTop || document.documentElement.scrollTop;
      const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      const scrolled = (winScroll / height) * 100;

      if (bar) bar.style.width = scrolled + "%";
      if (btn) btn.style.display = winScroll > 300 ? 'flex' : 'none';
    });

    // 2. Then initialize Auth (which triggers the listener)
    Auth.init();
  }

  // >>> FIX: THIS IS THE MISSING FUNCTION WRAPPER <<<
  async function navigateTo(page, param = null) {
    currentPage = page;

    // 1. Guest Mode Security Check
    const guestRestricted = ['settings', 'audit', 'admin', 'players'];
    // Assuming Auth.isGuest() is a boolean or function. Ensure it doesn't crash if Auth isn't ready.
    if (Auth.isGuest && Auth.isGuest() && guestRestricted.includes(page)) {
      UI.showToast('Access Denied: Guest Mode', 'error');
      return navigateTo('dashboard'); // Redirect safely
    }

    // 2. Main Page Router
    try {
      switch (page) {
        case 'dashboard': {
          UI.showLoading();
          const tournaments = await DB.getAllTournaments();
          UI.hideLoading();
          UI.renderDashboard(tournaments);
          break;
        }
        case 'tournament': {
          currentTournamentId = param;
          UI.showLoading();
          const tournament = await DB.getTournament(param);
          UI.hideLoading();
          if (!tournament) {
            UI.showToast('Tournament not found', 'error');
            navigateTo('dashboard');
            return;
          }
          UI.renderTournamentView(tournament);
          break;
        }
        case 'players': {
          await UI.renderPlayersPage();
          break;
        }
        case 'roster': {
          await UI.renderRosterPage();
          break;
        }
        case 'settings': {
          await UI.renderSettingsPage();
          break;
        }
        case 'audit': {
          await UI.renderAuditLogPage();
          break;
        }
        case 'archive': {
          UI.showLoading();
          await UI.renderArchiveRoom();
          UI.hideLoading();
          break;
        }
        case 'admin': {
          navigateTo('dashboard');
          break;
        }
        case 'live': {
          // Public Live View
          UI.renderLiveView(param);
          break;
        }
        default:
          navigateTo('dashboard');
      }
    } catch (err) {
      UI.hideLoading();
      UI.showToast(err.message, 'error');
      console.error('[App]', err);
    }
  }

  return { init, navigateTo, getCurrentPage: () => currentPage };
})();

// Global Export
window.App = App;

// ── Bootstrap ──
document.addEventListener('DOMContentLoaded', () => App.init());