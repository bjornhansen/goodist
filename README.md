# Goodist
I built this MVP for a customized charity subscription app. Giving effectively to charity can be hard in this noisy world -- how do you know which organizations will have the most impact? A friend and I were trying to come up with an easier way to give while also knowing your money was going to the best charities working in the areas you care about. We decided not to pursue this concept, but it lives on as a portfolio project!

# Developing
First, make sure the Firebase CLI and emulator suite is installed and set up as described here: https://firebase.google.com/docs/emulator-suite/install_and_configure

Note that the hosting emulator uses port 5000 by default, but Macs use that port for AirPlay. If you're using a mac, set the hosting port to 5002.

To start the emulators, run: `firebase emulators:start`

If you need to debug the cloud functions, use: `firebase emulators:start --inspect-functions 9000`

# Technologies
Keeping it simple. Avoiding frameworks. Prioritizing speed of MVP development.

### Front end 
- HTML, CSS, JavaScript
- Bootstrap 5
- jQuery 3

### Back end
- Firebase (Hosting, Firestore, Auth, Functions)
- Stripe (Stripe Elements, API)