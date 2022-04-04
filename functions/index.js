// The Cloud Functions for Firebase SDK to create Cloud Functions and set up triggers.
const functions = require('firebase-functions');

// The Firebase Admin SDK to access Firestore.
const admin = require('firebase-admin');
const {user} = require("firebase-functions/v1/auth");
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
exports.stripeStart = functions.https.onCall(async (data, context) => {
    try {
        // Set your secret key. Remember to switch to your live secret key in production.
        // See your keys here: https://dashboard.stripe.com/apikeys
        const stripe = require('stripe')(process.env.STRIPE_SECRET);

        // Get the user data.
        const userDoc = await admin.firestore().collection('users').doc(context.auth.uid).get();
        const userData = userDoc.data();

        // Add up the cause amounts and store it, so we can charge that price.
        let price = 0;
        for (const c of userData.causes) {
            price += c.giving_amount;
        }

        // Does this user already have a Stripe Customer ID?
        if (userData.stripe_customer_id) {
            // Yes. User is already a Customer. Do they have a subscription?
            const subscriptions = await stripe.subscriptions.list({
                customer: userData.stripe_customer_id,
                limit: 10
            });
            if (subscriptions.data.length) {
                // The user has at least one subscription. Make sure it's just one.
                if (subscriptions.data.length > 1) {
                    // Error.
                }

                // Get the subscription.
                const sub = subscriptions.data[0];

                // Is the subscription active?
                if (sub.status === 'active') {
                    // Subscription is active. Let the front end know.
                    return {status: 'existing_customer_with_active_subscription'};
                } else {
                    // The subscription isn't active. We'll need to start a new one.

                    // One caveat: the status is incomplete, meaning the first payment failed but hasn't timed out yet.
                    // In this case, we just cancel the old subscription and start again.
                    if (sub.status === 'incomplete') {
                        const deleted = await stripe.subscriptions.del(sub.id);
                    }

                    // Start a new subscription.
                    const subscription = await stripeStartSubscription(stripe, userData.stripe_customer_id, price);

                    // Give the data to the client.
                    return {clientSecret: subscription.latest_invoice.payment_intent.client_secret};
                }
            } else {
                // No active subscriptions. Just start a new one for now.

                // Start a new subscription.
                const subscription = await stripeStartSubscription(stripe, userData.stripe_customer_id, price);

                // Give the data to the client.
                return {clientSecret: subscription.latest_invoice.payment_intent.client_secret};
            }
        } else {
            // Not a Customer yet. Create a new one in Stripe.
            const customer = await stripe.customers.create({
                email: userData.email,
                name: `${userData.first_name} ${userData.last_name}`
            });

            // Store the Customer ID in the user doc.
            const updateCustomerIdResult = await admin.firestore().collection('users').doc(context.auth.uid)
                .update({stripe_customer_id: customer.id});

            // Start the subscription.
            const subscription = await stripeStartSubscription(stripe, customer.id, price);

            // Give the data to the client.
            return {clientSecret: subscription.latest_invoice.payment_intent.client_secret};
        }
    } catch (error) {
        return {
            isError: true,
            message: error.message
        };
    }
});

exports.stripeGetCharges = functions.https.onCall(async (data, context) => {
    try {
        // Set your secret key. Remember to switch to your live secret key in production.
        // See your keys here: https://dashboard.stripe.com/apikeys
        const stripe = require('stripe')(process.env.STRIPE_SECRET);

        // Get the user data.
        const userDoc = await admin.firestore().collection('users').doc(context.auth.uid).get();
        const userData = userDoc.data();

        const charges = await stripe.charges.list({
            customer: userData.stripe_customer_id,
            limit: 100
        });

        let amount = 0;
        for (const c of charges.data) {
            if (c.status === 'succeeded') {
                amount += c.amount;
            }
        }

        // Give the data to the client. Convert amounts to dollars.
        return {totalAmountGiven: amount / 100};
    } catch (error) {
        return {
            isError: true,
            message: error.message
        };
    }
});

async function stripeStartSubscription(stripe, customerId, priceInDollars) {
    // Create the subscription. Note we're expanding the Subscription's latest invoice and that invoice's
    // payment_intent so we can pass it to the front end to confirm the payment.
    const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{
            price_data: {
                currency: 'USD',
                product: 'prod_LPLotWTxSn8Fxm',
                recurring: {interval: 'month'},
                unit_amount: priceInDollars * 100 // Convert to cents
            }
        }],
        payment_behavior: 'default_incomplete',
        expand: ['latest_invoice.payment_intent'],
    });

    return new Promise((resolve, reject) => {
        resolve(subscription);
    });
}