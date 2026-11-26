// Test mode: the whole app without Supabase or sign-in. Data stays in this browser only.
const LocalApi = (() => {
  const KEY = 'wallet-local-data';
  const ME = 'local-person-1', PARTNER = 'local-person-2';
  const load = () => JSON.parse(localStorage.getItem(KEY) || 'null');
  const save = (d) => localStorage.setItem(KEY, JSON.stringify(d));
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const user = { id: ME, email: 'Test mode (this browser only)' };

  return {
    local: true,
    configured: () => true,
    fromFile: () => true,
    init() {},
    async session() { return { user }; },
    onAuth() {},
    async signOut() { leaveTestMode(); },
    async myWallet() {
      const d = load();
      return d ? { ...d.wallet, members: d.members } : null;
    },
    async myInvites() { return []; },
    // Sets up a wallet with both of you as members.
    async createLocal(name, currency, myName, partnerName) {
      const now = Date.now();
      save({
        wallet: { id: 'local-wallet', name, currency },
        members: [
          { wallet_id: 'local-wallet', user_id: ME, email: 'You', display_name: myName, joined_at: new Date(now).toISOString() },
          { wallet_id: 'local-wallet', user_id: PARTNER, email: 'Partner', display_name: partnerName, joined_at: new Date(now + 1).toISOString() },
        ],
        entries: [],
      });
    },
    async updateWallet(_id, fields) { const d = load(); Object.assign(d.wallet, fields); save(d); },
    async updateName(userId, name) { const d = load(); d.members.find((m) => m.user_id === userId).display_name = name; save(d); },
    async updateMyName(_w, userId, name) { return this.updateName(userId, name); },
    async invites() { return []; },
    async entries() {
      return (load()?.entries || []).slice().sort((a, b) => b.date.localeCompare(a.date) || b.updated_at.localeCompare(a.updated_at));
    },
    async saveEntry(e) {
      const d = load();
      const row = { ...e, id: e.id || uid(), updated_at: new Date().toISOString() };
      d.entries = d.entries.filter((x) => x.id !== row.id).concat(row);
      save(d);
    },
    async deleteEntry(id) { const d = load(); d.entries = d.entries.filter((x) => x.id !== id); save(d); },
    listen() {},
    erase() { localStorage.removeItem(KEY); },
  };
})();

function startTestMode() { localStorage.setItem('wallet-mode', 'local'); location.reload(); }
function leaveTestMode() {
  if (!confirm('Leave test mode? Your test data stays in this browser in case you come back.')) return;
  localStorage.removeItem('wallet-mode');
  location.reload();
}
function eraseTestData() {
  if (!confirm('Delete all test data in this browser?')) return;
  LocalApi.erase();
  location.reload();
}

// The rest of the app talks to whichever one is active.
var Api = localStorage.getItem('wallet-mode') === 'local' ? LocalApi : CloudApi;
