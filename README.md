# Goodist
This app is an MVP for validating business ideas.

# Developing
First, make sure the Firebase CLI and emulator suite is installed and set up as described here: https://firebase.google.com/docs/emulator-suite/install_and_configure

Note that the hosting emulator uses port 5000 by default, but Macs use that port for AirPlay. If you're using a mac, set the hosting port to 5002.

To start the emulators, run: `firebase emulators:start`

If you need to debug the cloud functions, use: `firebase emulators:start --inspect-functions 9000`

# Technologies
Keeping it simple. Avoiding complex frameworks. Prioritizing speed of development.

### Front end 
- HTML, CSS, JavaScript
- Bootstrap 5
- jQuery 3

### Back end
- Firebase (Hosting, Firestore, Auth, Functions)
- Stripe (Stripe Elements, API)
- Zapier (for syncing a Firestore tables to Google Sheets)

# How it works
1. User signs up and completes onboarding, resulting in a monthly subscription
2. They can then sign in to:
   - See their giving and impact info
   - Update their giving portfolio
   - Cancel or renew their subscription
3. When a transaction occurs, it gets synced to a Google Sheet
4. Once per month we:
   - Choose a recipient org for each cause
   - Calculate fees, totals and send payouts for each org (with Google Sheet)
   - Make note of which transactions have been processed (with Google Sheet)
5. After completing step 4, we add impact content to the app
   - Get content from the org: e.g. photos, videos, descriptions, statistics
   - Put the content in the app (pending)
   - Schedule any follow-up updates