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
            // ... handle other event types
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