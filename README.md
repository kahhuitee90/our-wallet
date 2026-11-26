# Our Wallet

A small phone app for two people to share expenses and track money in and out.
It installs from the browser ("Add to Home Screen"), works offline, and can sync
between both phones through a free Supabase project.

## Features

- Expenses split evenly, by percentage, or per item. With per item, any leftover
  (tax, tip) is split evenly.
- Running balance of who owes whom, with one-tap settle up.
- Money in (income) for each person, monthly in/spent totals and history.
- Edit or delete any entry. Export and import a backup file.

## Install on your phones

1. Open the app link in Safari (iPhone) or Chrome (Android).
2. iPhone: Share button > Add to Home Screen. Android: menu > Install app.

## Turn on cloud sync (about 5 minutes, once)

1. Make a free account at https://supabase.com and create a new project.
2. In the project, open **SQL Editor**, paste everything in `setup.sql`, and press **Run**.
3. Open **Project Settings > API Keys** (or **Data API**). Copy the **Project URL** and the
   **publishable** key (older projects call it the **anon** key). Never use the
   secret or service_role key.
4. In the app on your phone, open **Settings > Cloud sync**, paste the URL and key,
   tap **New** to make a wallet code, then tap **Connect**.
5. Tap **Invite partner** and send the link to your partner. When they open it
   on their phone, the app asks to join, and from then on both phones stay in sync.

The wallet code works like a shared password: only phones that know it can see
your entries, so keep the invite link between the two of you.

## Files

- `index.html` – layout and styles
- `app.js` – screens and entry forms
- `split.js` – split and balance math (amounts are kept in cents)
- `sync.js` – Supabase sync
- `setup.sql` – the table and access rule to run in Supabase
- `sw.js`, `manifest.json`, `icon.svg` – offline support and home-screen install
