# Our Wallet

A shared money pool for two people. Each of you signs in with your email, one of
you invites the other, and you both see the same wallet on your phones.

- **Add money:** who put money into the pool, and what for.
- **Spend:** who spent, how much, the category and what it was for.
  - Paid from **the pool**, or from **your own pocket**. Own-pocket costs can be split
    evenly, by percentage, or per item. Any leftover, like tax or a tip, is split evenly.
    The app shows who owes whom, and **Pay back** settles it.
- **Dashboard:** switch between Day, Month and Year to see the pool balance, money in and out,
  charts by day or month, spending by category, who added and who spent, and every record.
- Edit or delete any record by tapping it. Changes show on the other phone right away.

Live app: https://kahhuitee90.github.io/our-wallet/

## Try it without signing in

Open the app and tap **Try it without signing in**. Enter both names and you can use every
feature on a computer or phone. Test data is saved in that browser only and is not shared.
Leave test mode from Settings.

## Install on your phones

- **iPhone:** open the link in Safari, tap Share, then **Add to Home Screen**.
- **Android:** open the link in Chrome, tap the ⋮ menu, then **Install app** (or **Add to Home screen**).

## One-time Supabase setup (about 10 minutes, free)

1. Make a free account at https://supabase.com and create a new project. Pick the region
   closest to you (for Malaysia, Singapore).
2. Open **SQL Editor**, paste everything in [`setup.sql`](setup.sql), and press **Run**.
3. Open **Authentication > Sign In / Providers** and check that **Email** is on.
4. Open **Authentication > URL Configuration**. Set **Site URL** to
   `https://kahhuitee90.github.io/our-wallet/` and add the same address under **Redirect URLs**.
5. Open **Authentication > Emails** (Email Templates). Do this for **both** the **Confirm signup**
   template (used the first time an email signs in) and the **Magic Link** template (used after that).
   Add the sign-in code to the message so you can type it into the app:

   ```html
   <h2>Your Our Wallet sign-in</h2>
   <p>Your code is <b>{{ .Token }}</b></p>
   <p>Or tap <a href="{{ .ConfirmationURL }}">this link</a> to sign in.</p>
   ```

   On iPhone, the app on your home screen keeps its own sign-in separate from Safari,
   so typing the code is the reliable way to sign in there.
6. Open **Project Settings > API Keys**. Copy the **Project URL** and the **publishable** key
   (older projects call it **anon**). Never use the secret or service_role key.
   Put both into [`config.js`](config.js), or send them to Claude to add.

### Email delivery

Supabase's built-in email is for testing. It only sends to email addresses in your Supabase
team, and only a few emails an hour. For the two of you, the easiest fix is to invite your
partner's email to your Supabase organization (**Organization settings > Team**).
For a real release, set up your own email sender under **Authentication > Emails > SMTP Settings**.

## Files

- `index.html` – layout and styles
- `app.js` – screens: sign in, dashboard, add records, settings
- `charts.js` – the dashboard charts
- `split.js` – money math (amounts are kept in cents)
- `api.js` – talks to Supabase
- `config.js` – your Supabase URL and publishable key
- `setup.sql` – tables and access rules: only members of a wallet can see or change it
- `sw.js`, `manifest.json`, `icon.svg` – offline support and home-screen install
