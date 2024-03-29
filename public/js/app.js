const app = {};

app.init = function() {
    firebase.auth().onAuthStateChanged(function(user) {
        if (user) {
            // User is signed in.
            var displayName = user.displayName;
            var email = user.email;
            var emailVerified = user.emailVerified;
            var photoURL = user.photoURL;
            var uid = user.uid;
            var phoneNumber = user.phoneNumber;
            var providerData = user.providerData;
            user.getIdToken().then(function(accessToken) {
                document.getElementById('sign-in-status').textContent = 'Signed in';
                document.getElementById('sign-in').textContent = 'Sign out';
                document.getElementById('account-details').textContent = JSON.stringify({
                    displayName: displayName,
                    email: email,
                    emailVerified: emailVerified,
                    phoneNumber: phoneNumber,
                    photoURL: photoURL,
                    uid: uid,
                    accessToken: accessToken,
                    providerData: providerData
                }, null, '  ');
            });
        } else {
            // User is signed out.
            initFirebaseUi();
            document.getElementById('sign-in-status').textContent = 'Signed out';
            document.getElementById('sign-in').textContent = 'Sign in';
            document.getElementById('account-details').textContent = 'null';
        }
    }, function(error) {
        console.error(error);
    });
}

app.initFirebaseUi = function() {
    // Initialize the FirebaseUI Widget using Firebase.
    var ui = new firebaseui.auth.AuthUI(firebase.auth());

    // Build the configuration object.
    var uiConfig = {
        callbacks: {
            signInSuccessWithAuthResult: function(authResult, redirectUrl) {
                // User successfully signed in.
                // Return type determines whether we continue the redirect automatically
                // or whether we leave that to developer to handle.

                // Log the appropriate event.
                if (authResult.additionalUserInfo.isNewUser) {
                    app.analytics.logEvent('sign_up', {method: authResult.additionalUserInfo.providerId});
                } else {
                    app.analytics.logEvent('login', {method: authResult.additionalUserInfo.providerId});
                }
            },
            signInFailure: function(code, credential) {
                // User failed to sign in.
                alert('Sign in failure');
            },
            uiShown: function() {
                // The widget is rendered.
                // Hide the loader.
                document.getElementById('loader').style.display = 'none';
            }
        },
        // Will use popup for IDP Providers sign-in flow instead of the default, redirect.
        signInFlow: 'popup',
        signInOptions: [
            // Leave the lines as is for the providers you want to offer your users.
            //firebase.auth.GoogleAuthProvider.PROVIDER_ID,
            firebase.auth.EmailAuthProvider.PROVIDER_ID
        ],
        // Terms of service url.
        tosUrl: '404.html',
        // Privacy policy url.
        privacyPolicyUrl: '404.html'
    };

    // The start method will wait until the DOM is loaded.
    ui.start('#firebaseui-auth-container', uiConfig);
}

app.checkFirebaseServices = function() {
    // Activate appCheck now.
    const appCheck = firebase.appCheck();
    // Pass your reCAPTCHA v3 site key (public key) to activate(). Make sure this
    // key is the counterpart to the secret key you set in the Firebase console.
    appCheck.activate(
        '6LcOleElAAAAACWqN0mzNpbnCYxcwtF4c8EliuSt',

        // Optional argument. If true, the SDK automatically refreshes App Check
        // tokens as needed.
        true
    );

    // Initialize Analytics and get a reference to the service
    app.analytics = firebase.analytics();

    // // 🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥
    // // The Firebase SDK is initialized and available here!
    //
    // firebase.auth().onAuthStateChanged(user => { });
    // firebase.database().ref('/path/to/ref').on('value', snapshot => { });
    // firebase.firestore().doc('/foo/bar').get().then(() => { });
    // firebase.functions().httpsCallable('yourFunction')().then(() => { });
    // firebase.messaging().requestPermission().then(() => { });
    // firebase.storage().ref('/path/to/ref').getDownloadURL().then(() => { });
    // firebase.analytics(); // call to activate
    // firebase.analytics().logEvent('tutorial_completed');
    // firebase.performance(); // call to activate
    // firebase.appCheck(); // call to activate
    //
    // // 🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥

    try {
        let app = firebase.app();
        let features = [
            'auth',
            'database',
            'firestore',
            'functions',
            'messaging',
            'storage',
            'analytics',
            'remoteConfig',
            'performance',
            'appCheck',
        ].filter(feature => typeof app[feature] === 'function');
        console.log(`Firebase SDK loaded with ${features.join(', ')}`);
    } catch (e) {
        console.error(e);
        alert('Error loading the Firebase SDK, check the console.');
    }
}

app.signOut = function() {
    firebase.auth().signOut().then(() => {
        app.analytics.logEvent('logout');
        window.location.href = 'index.html';
    }).catch((error) => {
        console.error(error);
        alert(`Error when signing out`);
    });
}

app.formatDate = function(timestamp) {
    // Show a human-readable date from a Unix timestamp.
    const dateObject = new Date(timestamp * 1000);
    let options = {year: 'numeric', month: 'numeric', day: 'numeric'};
    return dateObject.toLocaleString('en-US', options);
}

app.getFee = function(type, amount) {
    // Get a fee from an amount.
    switch (type) {
        case 'goodist':
            if (amount >= 1000) {
                // If the amount is 1000 or more the fee is reduced to 3.5%.
                return amount * 0.035;
            } else if (amount >= 100) {
                // If the amount is 100 or more the fee is reduced to 4%.
                return amount * 0.04;
            } else {
                // Any amount less than $100 gets a 5% fee.
                return amount * 0.05;
            }
        case 'stripe':
            return amount * 0.029 + 0.3;
        default:
            return 0;
    }
}

app.formatCurrency = function(n) {
    const formatter = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
    });
    return formatter.format(n);
}