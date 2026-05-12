/**
 * auth.js — Strict Private Authentication
 * Only 2 admin accounts permitted. No public registration.
 * Handles @admin → @admin.tabuko.local mapping transparently.
 */
const Auth = (() => {
  let currentUser = null;
  let currentUserData = null;
  const listeners = [];

  // The two permitted admin UIDs — populated after seeding
  // These are checked by Firestore rules, not client-side
  const ADMIN_DOMAIN_ALIAS = '@admin';
  const ADMIN_DOMAIN_REAL = '@admin.tabuko.local';

  /**
   * Transform display login (e.g. "Tabukochessclub@admin")
   * into the real Firebase email ("tabukochessclub@admin.tabuko.local").
   */
  function resolveEmail(input) {
    let email = input.trim().toLowerCase();
    if (email.endsWith(ADMIN_DOMAIN_ALIAS)) {
      email = email.replace(ADMIN_DOMAIN_ALIAS, ADMIN_DOMAIN_REAL);
    }
    return email;
  }

  /**
   * Reverse: display-friendly email for UI.
   */
  function displayEmail(email) {
    if (!email) return '';
    return email.replace(ADMIN_DOMAIN_REAL, ADMIN_DOMAIN_ALIAS);
  }

  function init() {
    auth.onAuthStateChanged(async (user) => {
      currentUser = user;
      if (user) {
        if (user.isAnonymous) {
          currentUserData = { uid: user.uid, role: 'guest' };
        } else {
          try {
            const doc = await db.collection('users').doc(user.uid).get();
            currentUserData = doc.exists ? doc.data() : { uid: user.uid, email: user.email, role: 'admin' };
          } catch (e) {
            console.warn('[Auth] Firestore fetch failed (offline?), using local state:', e.message);
            currentUserData = { uid: user.uid, email: user.email, role: 'admin' };
          }
        }
      } else {
        currentUserData = null;
      }
      listeners.forEach(fn => fn(currentUser, currentUserData));
    });
  }

  function onAuthChange(fn) { listeners.push(fn); }

  /**
   * Sign in — only method exposed. No signup.
   */
  async function signIn(inputEmail, password) {
    const email = resolveEmail(inputEmail);
    const cred = await auth.signInWithEmailAndPassword(email, password);
    const user = cred.user;

    // ── AUTO-PROVISIONING: Ensure the Admin Doc exists for Rules ──
    const userRef = db.collection('users').doc(user.uid);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      console.log('[Auth] New Admin detected. Provisioning database record...');
      await userRef.set({
        uid: user.uid,
        email: user.email,
        role: 'admin',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }

    // Log the sign-in event
    if (typeof AuditLog !== 'undefined') {
      AuditLog.log('AUTH_SIGN_IN', null, { email: displayEmail(email) });
    }

    return user;
  }

  /**
   * Sign in as an anonymous guest.
   */
  async function loginAsGuest() {
    try {
      await auth.signInAnonymously();
      sessionStorage.setItem('isGuestUser', 'true');
      if (typeof App !== 'undefined') {
        App.navigateTo('roster');
      } else {
        window.location.reload();
      }
    } catch (err) {
      console.error('[Auth] Guest login failed:', err);
      throw err;
    }
  }

  async function signOut() {
    if (typeof AuditLog !== 'undefined' && currentUser) {
      AuditLog.log('AUTH_SIGN_OUT', null, { email: displayEmail(currentUser.email) || 'guest' });
    }
    sessionStorage.removeItem('isGuestUser');
    await auth.signOut();
  }

  function getUser() { return currentUser; }
  function getUserData() { return currentUserData; }

  // Admin/Arbiter check: must be authenticated, NOT anonymous, and have the correct role
  function isAdmin() { 
    return !!currentUser && !currentUser.isAnonymous && currentUserData?.role === 'admin'; 
  }
  function isArbiter() { 
    return !!currentUser && !currentUser.isAnonymous && (currentUserData?.role === 'admin' || currentUserData?.role === 'arbiter'); 
  }
  function isGuest() {
    return sessionStorage.getItem('isGuestUser') === 'true';
  }

  return { init, onAuthChange, signIn, loginAsGuest, signOut, getUser, getUserData, isAdmin, isArbiter, isGuest, resolveEmail, displayEmail };
})();

// Global Export for Modular/Legacy Compatibility
window.Auth = Auth;
