// The Cloud Functions for Firebase SDK to create Cloud Functions and set up triggers.
const functions = require('firebase-functions');

// The Firebase Admin SDK to access Firestore.
const admin = require('firebase-admin');
const {user} = require("firebase-functions/v1/auth");
admin.initializeApp();

// Include functions in other files.
const stripeFunctions = require('./stripeFunctions');
const stripeWebhooks = require('./stripeWebhooks');

// Define exports from other files.
exports.stripeStart = stripeFunctions.stripeStart;
exports.stripeGetCharges = stripeFunctions.stripeGetCharges;
exports.stripeGetSubscription = stripeFunctions.stripeGetSubscription;
exports.stripeCancelSubscription = stripeFunctions.stripeCancelSubscription;
exports.stripeWebhook = stripeWebhooks.webhook;