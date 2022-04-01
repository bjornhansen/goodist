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
        if (!userDoc.exists) {
            // Shouldn't be able to get here. But if we do, throw an error.
        }
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
            if (subscriptions.length) {
                // The user already has at least one active subscription.
                // We don't need to do anything else here. Tell the client that all is well.
                return {status: 'existing_customer_with_active_subscription'};
            } else {
                // No active subscriptions. Does the user have a working payment method?
                const paymentMethods = await stripe.paymentMethods.list({
                    customer: userData.stripe_customer_id,
                    type: 'card',
                });
                if (paymentMethods.data.length) {
                    // The user has at least one valid payment method. We can go ahead and start a subscription.
                    return {status: 'existing_customer_without_active_subscription_but_with_payment_method'};
                } else {
                    // No payment methods. We'll need to add one.
                    return {status: 'existing_customer_without_active_subscription_and_without_payment_method'};
                }
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

            // Create the subscription. Note we're expanding the Subscription's latest invoice and that invoice's
            // payment_intent so we can pass it to the front end to confirm the payment.
            const subscription = await stripe.subscriptions.create({
                customer: customer.id,
                items: [{
                    price_data: {
                        currency: 'USD',
                        product: 'prod_LPLotWTxSn8Fxm',
                        recurring: {interval: 'month'},
                        unit_amount: price * 100 // Convert to cents
                    }
                }],
                payment_behavior: 'default_incomplete',
                expand: ['latest_invoice.payment_intent'],
            });

            // Give the data to the client.
            return {
                clientSecret: subscription.latest_invoice.payment_intent.client_secret,
            };
        }
    } catch (error) {
        return {
            isError: true,
            message: error.message
        };
    }
});