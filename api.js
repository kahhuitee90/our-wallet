// Everything that talks to Supabase lives here.
const Api = (() => {
  let sb = null;
  let channel = null;

  function config() {
    const c = window.WALLET_CONFIG || {};
    const saved = JSON.parse(localStorage.getItem('wallet-config') || 'null') || {};
    return { url: c.supabaseUrl || saved.url || '', key: c.supabaseKey || saved.key || '' };
  }
  const configured = () => !!(config().url && config().key);

  function init() {
    const c = config();
    sb = window.supabase.createClient(c.url, c.key, { auth: { persistSession: true, detectSessionInUrl: true } });
    return sb;
  }

  const appUrl = () => location.origin + location.pathname;
  const check = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

  return {
    configured,
    saveConfig: (url, key) => localStorage.setItem('wallet-config', JSON.stringify({ url, key })),
    init,

    // ---- Sign in ----
    async session() { return check(await sb.auth.getSession()).session; },
    onAuth: (fn) => sb.auth.onAuthStateChange((_ev, s) => fn(s)),
    // Sends an email with a login link and a 6-digit code.
    async sendCode(email) {
      check(await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: appUrl() } }));
    },
    async verifyCode(email, token) { check(await sb.auth.verifyOtp({ email, token, type: 'email' })); },
    async signOut() { await sb.auth.signOut(); },

    // ---- Wallet and members ----
    async myWallet(userId) {
      const rows = check(await sb.from('members').select('wallet_id').eq('user_id', userId).limit(1));
      if (!rows.length) return null;
      const id = rows[0].wallet_id;
      const [wallet] = check(await sb.from('wallets').select('*').eq('id', id));
      const members = check(await sb.from('members').select('*').eq('wallet_id', id).order('joined_at'));
      return { ...wallet, members };
    },
    async myInvites() { return check(await sb.rpc('my_invites')); },
    async acceptInvites(name) { return check(await sb.rpc('accept_invites', { my_name: name })); },
    async createWallet(name, currency, myName) {
      return check(await sb.rpc('create_wallet', { wallet_name: name, wallet_currency: currency, my_name: myName }));
    },
    async updateWallet(id, fields) { check(await sb.from('wallets').update(fields).eq('id', id)); },
    async updateMyName(walletId, userId, name) {
      check(await sb.from('members').update({ display_name: name }).eq('wallet_id', walletId).eq('user_id', userId));
    },
    async invites(walletId) { return check(await sb.from('invites').select('*').eq('wallet_id', walletId)); },
    // Saves the invite, then emails the partner a sign-in link and code.
    async invite(walletId, email) {
      check(await sb.from('invites').upsert({ wallet_id: walletId, email: email.toLowerCase() }));
      check(await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: appUrl() } }));
    },
    async cancelInvite(walletId, email) { check(await sb.from('invites').delete().eq('wallet_id', walletId).eq('email', email)); },

    // ---- Entries ----
    async entries(walletId) {
      return check(await sb.from('entries').select('*').eq('wallet_id', walletId).order('date', { ascending: false }).order('updated_at', { ascending: false }));
    },
    async saveEntry(e) {
      const row = { ...e, updated_at: new Date().toISOString() };
      if (e.id) check(await sb.from('entries').update(row).eq('id', e.id));
      else { delete row.id; check(await sb.from('entries').insert(row)); }
    },
    async deleteEntry(id) { check(await sb.from('entries').delete().eq('id', id)); },

    // Calls fn whenever the other phone changes an entry.
    listen(walletId, fn) {
      if (channel) sb.removeChannel(channel);
      channel = sb.channel('entries-' + walletId)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'entries', filter: `wallet_id=eq.${walletId}` }, fn)
        .subscribe();
    },
  };
})();
