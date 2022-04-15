// The Cloud Functions for Firebase SDK to create Cloud Functions and set up triggers.
const functions = require('firebase-functions');

// The Firebase Admin SDK to access Firestore.
const admin = require('firebase-admin');

// Set Stripe key. Use the test key if we're in an emulated environment.
let stripeKey;
if (process.env.FUNCTIONS_EMULATOR) {
    stripeKey = process.env.STRIPE_SECRET_KEY_TEST;
} else {
    stripeKey = process.env.STRIPE_SECRET_KEY;
}
const stripe = require('stripe')(stripeKey);

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

    // Get the user reference.
    const userRef = admin.firestore().collection('users').doc(userDoc.id);

    // Store the parts of the paymentIntent we need in the "transactions" collection.
    const transactionDoc = await admin.firestore().collection('transactions').add({
        user: userRef,
        total_amount: amountReceivedDollars,
        stripe_payment_intent_id: dataObject.id,
        stripe_event_received: admin.firestore.FieldValue.serverTimestamp(),
        items: items
    });

    // Get the stored transaction data so we can use it below.
    let transactionData = await transactionDoc.get();
    transactionData = transactionData.data();

    // Start building the special object for inputting into Zapier.
    const zapierInput = {
        transaction: transactionDoc,
        user: userRef,
        user_name: `${userData.first_name} ${userData.last_name}`,
        processed: transactionData.stripe_event_received,
        total_amount: amountReceivedDollars
    }

    // Get the list of all causes so we can break them out.
    const causesSnapshot = await admin.firestore().collection('causes').get();
    causesSnapshot.forEach((doc) => {
        // Find the item in the user's list of causes, if it's in there.
        let causeAmount = 0;
        for (const c of userData.causes) {
            const causeRef = admin.firestore().collection('causes').doc(doc.id);
            if (causeRef.id == c.cause.id) {
                causeAmount = c.giving_amount;
            }
        }

        // Get the doc's data.
        const causeData = doc.data();
        zapierInput[`${causeData.cause_name.toLowerCase()}_amount`] = causeAmount;
    });

    // Now format a record especially for the Zapier --> Google Sheets integration and store it in a special collection.
    const zapierTransaction = await admin.firestore().collection('transactions_formatted_for_google_sheets').add(zapierInput);

    // Return the OG transaction.
    return transactionDoc;
}