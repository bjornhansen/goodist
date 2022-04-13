// The Cloud Functions for Firebase SDK to create Cloud Functions and set up triggers.
const functions = require('firebase-functions');

// The Firebase Admin SDK to access Firestore.
const admin = require('firebase-admin');

// Set your secret key. Remember to switch to your live secret key in production.
// See your keys here: https://dashboard.stripe.com/apikeys
const stripe = require('stripe')(process.env.STRIPE_SECRET);

exports.stripeStart = functions.https.onCall(async (data, context) => {
    try {
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
                    const subscription = await startSubscription(stripe, userData.stripe_customer_id, price);

                    // Give the data to the client.
                    return {clientSecret: subscription.latest_invoice.payment_intent.client_secret};
                }
            } else {
                // No active subscriptions. Just start a new one for now.

                // Start a new subscription.
                const subscription = await startSubscription(stripe, userData.stripe_customer_id, price);

                // Give the data to the client.
                return {clientSecret: subscription.latest_invoice.payment_intent.client_secret};
            }
        } else {
            // Not a Customer yet. Create a new one in Stripe.
            const customer = await stripe.customers.create({
                email: context.auth.email,
                name: `${userData.first_name} ${userData.last_name}`
            });

            // Store the Customer ID in the user doc.
            const updateCustomerIdResult = await admin.firestore().collection('users').doc(context.auth.uid)
                .update({stripe_customer_id: customer.id});

            // Start the subscription.
            const subscription = await startSubscription(stripe, customer.id, price);

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

exports.stripeGetSubscription = functions.https.onCall(async (data, context) => {
    try {
        // Get the user data.
        const userDoc = await admin.firestore().collection('users').doc(context.auth.uid).get();
        const userData = userDoc.data();

        // Does the user have a subscription?
        const subscriptions = await stripe.subscriptions.list({
            customer: userData.stripe_customer_id,
            limit: 100
        });

        // If there's not a subscription, return nulls.
        if (!subscriptions.data.length) {
            return {subscription: null, paymentMethod: null};
        }

        // Get the active subscription.
        const sub = subscriptions.data[0];

        // Get the default payment method for the subscription.
        const paymentMethod = await stripe.paymentMethods.retrieve(
            sub.default_payment_method
        );

        return {subscription: sub, paymentMethod: paymentMethod};
    } catch (error) {
        return {
            isError: true,
            message: error.message
        };
    }
});

exports.stripeUpdateSubscription = functions.https.onCall(async (data, context) => {
    try {
        // Get the user data.
        const userDoc = await admin.firestore().collection('users').doc(context.auth.uid).get();
        const userData = userDoc.data();

        // Does the user have a subscription?
        const subscriptions = await stripe.subscriptions.list({
            customer: userData.stripe_customer_id,
            limit: 100
        });

        // If there's not a subscription, throw an error.
        if (!subscriptions.data.length) {
            throw new Error(`No Stripe Subscription to cancel`);
        }

        // Get the subscription.
        const sub = subscriptions.data[0];

        // Is the subscription active? If not, we can't update it.
        if (sub.status !== 'active') {
            throw new Error(`No active Stripe Subscriptions`);
        }

        // Add up the cause amounts and store it, so we can update everything to the new price.
        let price = 0;
        for (const c of userData.causes) {
            price += c.giving_amount;
        }

        // We have the active subscription. Delete it now and give back the result.
        return await stripe.subscriptions.update(sub.id, {
            proration_behavior: "none",
            items: [{
                id: sub.items.data[0].id,
                price_data: {
                    currency: 'USD',
                    product: 'prod_LPLotWTxSn8Fxm',
                    recurring: {interval: 'month'},
                    unit_amount: price * 100 // Convert to cents
                }
            }]
        });
    } catch (error) {
        return {
            isError: true,
            message: error.message
        };
    }
});

exports.stripeCancelSubscription = functions.https.onCall(async (data, context) => {
    try {
        // Get the user data.
        const userDoc = await admin.firestore().collection('users').doc(context.auth.uid).get();
        const userData = userDoc.data();

        // Does the user have a subscription?
        const subscriptions = await stripe.subscriptions.list({
            customer: userData.stripe_customer_id,
            limit: 100
        });

        // If there's not a subscription, throw an error.
        if (!subscriptions.data.length) {
            throw new Error(`No Stripe Subscription to cancel`);
        }

        // Get the subscription.
        const sub = subscriptions.data[0];

        // Is the subscription active? If not, we can't delete it.
        if (sub.status !== 'active') {
            throw new Error(`No active Stripe Subscriptions`);
        }

        // We have the active subscription. Delete it now and give back the result.
        return await stripe.subscriptions.del(sub.id);
    } catch (error) {
        return {
            isError: true,
            message: error.message
        };
    }
});

async function startSubscription(stripe, customerId, priceInDollars) {
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