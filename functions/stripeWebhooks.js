// The Cloud Functions for Firebase SDK to create Cloud Functions and set up triggers.
const functions = require('firebase-functions');

// The Firebase Admin SDK to access Firestore.
const admin = require('firebase-admin');

exports.webhook = functions
    .https.onRequest((request, response) => {
        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY_TEST);

        // The event is already parsed thanks to Firebase middleware.
        const event = request.body;

        try {
            // Handle the event
            switch (event.type) {
                case 'invoice.payment_succeeded':
                    const invoice = event.data.object;
                    setDefaultPaymentMethod(stripe, invoice);
                    break;
                case 'payment_intent.succeeded':
                    const paymentIntent = event.data.object;
                    storeTransaction(stripe, paymentIntent);
                    break;
                default:
                    functions.logger.log(`Unhandled Stripe event of type: ${event.type}`);
            }

            // Return a 200 response to acknowledge receipt of the event.
            response.send();
        } catch (err) {
            functions.logger.log(`Stripe Webhook Error: ${err.message}`);
            response.status(400).send(`Stripe Webhook Error: ${err.message}`);
        }
});

async function setDefaultPaymentMethod(stripe, dataObject) {
    if (!dataObject || !dataObject.billing_reason || !dataObject.subscription || !dataObject.payment_intent) {
        throw new Error('Invalid Invoice data in setDefaultPaymentMethod function');
    }

    if (dataObject['billing_reason'] == 'subscription_create') {
        return;
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(dataObject['payment_intent']);
    return await stripe.subscriptions.update(
        dataObject['subscription'],
        {
            default_payment_method: paymentIntent.payment_method,
        },
    );
}

async function storeTransaction(stripe, dataObject) {
    const usersCollection = admin.firestore().collection('users');

    const userSnapshot = await usersCollection.where('stripe_customer_id', "==", dataObject.customer).get();
    // Get the user from the snapshot. There should only ever be one.
    let userDoc;
    userSnapshot.forEach((doc) => {
        userDoc = doc;
    });
    const userData = userDoc.data();

    // Update the Subscription status in the user doc. Since it succeeded, we can assume the subscription is active.
    const updateStatusResult = await usersCollection.doc(userDoc.id)
        .update({stripe_subscription_status: 'active'});

    // Get the user's causes while building the data to store with the transaction.
    const items = [];
    let userTotal = 0;
    for (const c of userData.causes) {
        items.push({
            amount: c.giving_amount,
            cause: c.cause
        });
        userTotal += c.giving_amount;
    }

    // Make sure the total of the payment matches the budget.
    const amountReceivedDollars = dataObject.amount_received / 100;
    if (amountReceivedDollars !== userTotal) {
        // The amounts don't match.
        throw new Error(`Budget doesn't match total of giving portfolio`);
    }

    // Get the user reference.
    const userReference = usersCollection.doc(userDoc.id);

    // Store the parts of the paymentIntent we need in the "transactions" collection.
    const transactionDoc = await admin.firestore().collection('transactions').add({
        user: userReference,
        total_amount: amountReceivedDollars,
        stripe_payment_intent_id: dataObject.id,
        stripe_event_received: admin.firestore.FieldValue.serverTimestamp(),
        items: items,
        production: !process.env.FUNCTIONS_EMULATOR
    });

    return await transactionDoc.get();
}