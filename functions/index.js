// The Cloud Functions for Firebase SDK to create Cloud Functions and set up triggers.
const functions = require('firebase-functions');

// The Firebase Admin SDK to access Firestore.
const admin = require('firebase-admin');
admin.initializeApp();

// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions
//
// exports.helloWorld = functions.https.onRequest((request, response) => {
//   functions.logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });

// Take the text parameter passed to this HTTP endpoint and insert it into
// Firestore under the path /messages/:documentId/original
exports.setupStripe = functions.https.onCall(async (data, context) => {
    // Set your secret key. Remember to switch to your live secret key in production.
    // See your keys here: https://dashboard.stripe.com/apikeys
    const stripe = require('stripe')('sk_test_51KWRApBLF6OO4ModlnDOzAe9TzKbqXwBd1g9Mmp7K36JaFog1WQb78K55Gb00J34QLtU8TsqRNxu3grtYUN4yt1J00W0p3W9QN');

    functions.logger.log('Stripe initialized successfully', data);

    const stripeId = true;

    // Does this user have a Stripe ID? If so, we don't need to create a new Customer for them.
    if (stripeId) {
        // User is already a Customer. Do they have a subscription?
    } else {
        // Not a Customer yet. Create a new one in Stripe.
        const customer = await stripe.customers.create({
            email: data.email,
            name: data.name
        });

        // Store the Customer ID in the user doc.
        const updateResult = await admin.firestore().collection('users').doc(context.uid).update({stripe_id: customer.id});

        // Create the subscription. Note we're expanding the Subscription's latest invoice and that invoice's
        // payment_intent so we can pass it to the front end to confirm the payment.
        const subscription = await stripe.subscriptions.create({
            customer: customer.id,
            items: [{
                price: 'price_1KiX6wBLF6OO4Modnafepb55',
            }],
            payment_behavior: 'default_incomplete',
            expand: ['latest_invoice.payment_intent'],
        });

        res.send({
            subscriptionId: subscription.id,
            clientSecret: subscription.latest_invoice.payment_intent.client_secret,
        });
    }

    // returning result.
    return {
        message: 'yeet'
    };
});