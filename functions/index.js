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
    try {
        // Set your secret key. Remember to switch to your live secret key in production.
        // See your keys here: https://dashboard.stripe.com/apikeys
        const stripe = require('stripe')('sk_test_51KWRApBLF6OO4ModlnDOzAe9TzKbqXwBd1g9Mmp7K36JaFog1WQb78K55Gb00J34QLtU8TsqRNxu3grtYUN4yt1J00W0p3W9QN');

        // Does this user have a Stripe ID? If so, we don't need to create a new Customer for them.
        const userDoc = await admin.firestore().collection('users').doc(context.auth.uid).get();
        if (!userDoc.exists) {
            // Shouldn't be able to get here. But if we do, throw an error.
        }

        // Grab the data from the snapshot.
        const userData = userDoc.data();

        // Add up the cause amounts and store it so we can charge that price.
        let price = 0;
        for (const c of userData.causes) {
            price += c.giving_amount;
        }

        if (userData.stripe_customer_id) {
            // User is already a Customer. Do they have a subscription?
            const subscriptions = await stripe.subscriptions.list({
                customer: userData.stripe_customer_id,
                limit: 10
            });
            if (subscriptions.length) {
                // The user already has at least one active subscription.
                // We don't need to do anything else here. Tell the client that all is well.
                return {
                    existingSubscription: true
                }
            } else {
                // No active subscriptions. Does the user have a working payment method?
                const paymentMethods = await stripe.paymentMethods.list({
                    customer: userData.stripe_customer_id,
                    type: 'card',
                });
                if (paymentMethods.data.length) {
                    // The user has at least one valid payment method. We can go ahead and start a subscription.
                } else {
                    // No payment methods. We'll need to add one.
                }
            }
        } else {
            // Not a Customer yet. Create a new one in Stripe.
            const customer = await stripe.customers.create({
                email: data.email,
                name: data.name
            });

            // Store the Customer ID in the user doc.
            const updateCustomerIdResult = await admin.firestore().collection('users').doc(context.auth.uid)
                .update({stripe_customer_id: customer.id});

            // Create the subscription. Note we're expanding the Subscription's latest invoice and that invoice's
            // payment_intent so we can pass it to the front end to confirm the payment.
            const subscription = await stripe.subscriptions.create({
                customer: customer.id,
                items: [{
                    price_data: {
                        currency: 'USD',
                        product: 'prod_LPLotWTxSn8Fxm',
                        recurring: {interval: 'month'},
                        unit_amount: price
                    }
                }],
                payment_behavior: 'default_incomplete',
                expand: ['latest_invoice.payment_intent'],
            });

            // Give the data to the client.
            return {
                subscriptionId: subscription.id,
                clientSecret: subscription.latest_invoice.payment_intent.client_secret,
            };
        }
    } catch (error) {
        return error;
    }
});