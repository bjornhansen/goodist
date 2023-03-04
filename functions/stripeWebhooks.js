// The Cloud Functions for Firebase SDK to create Cloud Functions and set up triggers.
const functions = require('firebase-functions');

// The Firebase Admin SDK to access Firestore.
const admin = require('firebase-admin');

exports.webhook = functions
    .runWith({secrets: ['STRIPE_SECRET_KEY', "STRIPE_SECRET_KEY_TEST"]})
    .https.onRequest((request, response) => {
        // The event is already parsed thanks to Firebase middleware.
        const event = request.body;

        // Get the appropriate Stripe instance.
        const stripe = getStripeInstance(process.env);

        try {
            // Handle the event
            switch (event.type) {
                case 'invoice.payment_succeeded':
                    functions.logger.log(`Received Stripe event of type: ${event.type}`);
                    const invoice = event.data.object;
                    const updatedInvoice = setDefaultPaymentMethod(stripe, invoice);
                    break;
                case 'payment_intent.succeeded':
                    functions.logger.log(`Received Stripe event of type: ${event.type}`);
                    const paymentIntent = event.data.object;
                    const transactionRecord = storeTransaction(stripe, paymentIntent);
                    break;
                default:
                    functions.logger.log(`Unhandled Stripe event of type: ${event.type}`);
            }

            // Return a 200 response to acknowledge receipt of the event.
            response.send();
        } catch (err) {
            // There's been a problem. Report it now.
            functions.logger.log(`Stripe Webhook Error: ${err.message}`);
            response.status(400).send(`Stripe Webhook Error: ${err.message}`);
        }
});

async function setDefaultPaymentMethod(stripe, dataObject) {
    functions.logger.log(`setDefaultPaymentMethod function - started with inputs:`, {stripe: stripe, dataObject: dataObject});
    if (dataObject['billing_reason'] == 'subscription_create') {
        const subscriptionId = dataObject['subscription']
        const paymentIntentId = dataObject['payment_intent']

        // Retrieve the payment intent used to pay the subscription
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

        functions.logger.log(`setDefaultPaymentMethod function - retrieved payment intent`, paymentIntent);

        const subscription = await stripe.subscriptions.update(
            subscriptionId,
            {
                default_payment_method: paymentIntent.payment_method,
            },
        );

        // Log that it was successful.
        functions.logger.log(`setDefaultPaymentMethod function - updated default payment method of Stripe Subscription`, subscription);

        return subscription;
    }
}

async function storeTransaction(stripe, dataObject) {
    functions.logger.log(`storeTransaction function - started with inputs:`, {stripe: stripe, dataObject: dataObject});

    // First, get the relevant user.
    const userSnapshot = await admin.firestore().collection('users').where('stripe_customer_id', "==", dataObject.customer).get();
    // Get the user. There should only ever be one.
    let userDoc;
    userSnapshot.forEach((doc) => {
        userDoc = doc;
    });
    const userData = userDoc.data();

    functions.logger.log(`storeTransaction function user data retreived:`, userData);

    // Update the Subscription status in the user doc. Since it succeeded, we can assume the subscription is active.
    // @todo we should probably get the actual subscription status here instead of assuming it's "active".
    const updateStatusResult = await admin.firestore().collection('users').doc(userDoc.id)
        .update({stripe_subscription_status: 'active'});

    functions.logger.log(`storeTransaction function - marked sub status as active in user doc:`, updateStatusResult);

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
        items: items,
        production: !process.env.FUNCTIONS_EMULATOR
    });

    // Log that it was successful.
    functions.logger.log(`storeTransaction function - stored transaction from Stripe event in "transactions" collection`, transactionDoc);

    // Get the stored transaction data so we can use it below.
    let transactionData = await transactionDoc.get();
    transactionData = transactionData.data();

    // Start building the special object for inputting into Zapier.
    const zapierInput = {
        transaction: transactionDoc,
        user: userRef,
        user_name: `${userData.first_name} ${userData.last_name}`,
        processed: transactionData.stripe_event_received,
        total_amount: amountReceivedDollars,
        production: !process.env.FUNCTIONS_EMULATOR
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

    // Log that it was successful.
    functions.logger.log(`storeTransaction function - stored transaction from Stripe event in "transactions_formatted_for_google_sheets collection"`, zapierTransaction);

    // Return the OG transaction.
    return transactionDoc;
}

function getStripeInstance(env) {
    // Return a Stripe instance set to test or production depending on the environment.
    // Use the test key if we're in an emulated environment.
    let stripeKey;
    //if (env.FUNCTIONS_EMULATOR) {
        stripeKey = env.STRIPE_SECRET_KEY_TEST;
    //} else {
    //    stripeKey = env.STRIPE_SECRET_KEY;
    //}

    // Make sure it's not undefined or something.
    if (!stripeKey) {
        throw new Error(`Stripe secret not in process.env`);
    }

    return require('stripe')(stripeKey);
}