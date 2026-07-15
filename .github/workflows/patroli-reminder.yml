name: Patroli Reminder

on:
  schedule:
    - cron: '0 3 * * *'   # 11:00 WITA
    - cron: '0 6 * * *'   # 14:00 WITA
    - cron: '0 9 * * *'   # 17:00 WITA
    - cron: '30 11 * * *' # 19:30 WITA (pre-shift)
    - cron: '0 12 * * *'  # 20:00 WITA (ganti shift malam)
    - cron: '0 15 * * *'  # 23:00 WITA
    - cron: '0 18 * * *'  # 02:00 WITA
    - cron: '0 21 * * *'  # 05:00 WITA
    - cron: '30 23 * * *' # 07:30 WITA (pre-shift)
    - cron: '0 0 * * *'   # 08:00 WITA (ganti shift pagi)
  workflow_dispatch: {}    # buat testing manual dari tab Actions di GitHub

jobs:
  reminder:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install dependencies
        run: npm install firebase-admin

      - name: Jalankan reminder
        run: node scripts/patroli-reminder.mjs
        env:
          FIREBASE_SERVICE_ACCOUNT_BASE64: ${{ secrets.FIREBASE_SERVICE_ACCOUNT_BASE64 }}
          FONNTE_TOKEN: ${{ secrets.FONNTE_TOKEN }}