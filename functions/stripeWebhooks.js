// The Cloud Functions for Firebase SDK to create Cloud Functions and set up triggers.
const functions = require('firebase-functions');

// The Firebase Admin SDK to access Firestore.
const admin = require('firebase-admin');

// Set your secret key. Remember to switch to your live secret key in production.
// See your keys here: https://dashboard.stripe.com/apikeys
const stripe = require('stripe')(process.env.STRIPE_SECRET);

exports.webhook = functions.https.onRequest((request, response) => {
    // The event is already parsed thanks to Firebase middleware.
    const event = request.body;

    try {
        // Handle the event
        switch (event.type) {
            case 'invoice.payment_succeeded':
                const invoice = event.data.object;
                const updatedInvoice = setDefaultPaymentMethod(invoice);
                break;
            case 'payment_intent.succeeded':
                const paymentIntent = event.data.object;
                const transactionRecord = storeTransaction(paymentIntent);
                break;
            default:
                functions.logger.log(`Unhandled event type ${event.type}`);
        }

        // Return a 200 response to acknowledge receipt of the event.
        response.send();
    } catch (err) {
        // There's been a problem. Report it now.
        functions.logger.log(`Stripe Webhook Error: ${err.message}`);
        response.status(400).send(`Stripe Webhook Error: ${err.message}`);
    }
});

async function setDefaultPaymentMethod(dataObject) {
    if (dataObject['billing_reason'] == 'subscription_create') {
        const subscriptionId = dataObject['subscription']
        const paymentIntentId = dataObject['payment_intent']

        // Retrieve the payment intent used to pay the subscription
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

        return await stripe.subscriptions.update(
            subscriptionId,
            {
                default_payment_method: paymentIntent.payment_method,
            },
        );
    }
}

async function storeTransaction(dataObject) {
    // We have a successful transaction webhook from Stripe.

    // First, get the relevant user.
    const userSnapshot = await admin.firestore().collection('users').where('stripe_customer_id', "==", dataObject.customer).get();
    // Get the user. There should only ever be one.
    let userDoc;
    userSnapshot.forEach((doc) => {
        userDoc = doc;
    });
    const userData = userDoc.data();

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
        // @todo either throw an error or update the amounts.
    }

    // Store the parts of the paymentIntent we need in the "transactions" collection and return the result.
    return await admin.firestore().collection('transactions').add({
        user: admin.firestore().collection('users').doc(userDoc.id),
        total_amount: amountReceivedDollars,
        stripe_payment_intent_id: dataObject.id,
        stripe_event_received: admin.firestore.FieldValue.serverTimestamp(),
        items: items
    });
}