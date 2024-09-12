import express from 'express';
import bodyParser from 'body-parser'
import sgMail from '@sendgrid/mail'
import dotenv from 'dotenv'

import { initializeApp } from "firebase/app";
import { ref, getDatabase, onValue, get, child, set, update } from "firebase/database";
import mail from '@sendgrid/mail';

const firebaseConfig = {
    credential: "secrets/the-golden-hind-firebase-adminsdk-vco9b-793ace4126.json",
    databaseURL: "https://the-golden-hind-default-rtdb.firebaseio.com/",
};

const app = express();
const firebaseApp = initializeApp(firebaseConfig);

app.use(express.json());
app.use(express.urlencoded({ extended: true}));

dotenv.config();
const mailAPIkey = process.env.mailAPIkey
sgMail.setApiKey('SG.' + mailAPIkey)

app.get('/', (request, response) => {
    response.status(200);
    response.send("Yarrr! Ahoy there, matey!");
});

app.post('/login', async (request, response) => {
    const userRef = ref(getDatabase());
    const { username, password } = request.body
    
    try {
        const authenticated = await AttemptAuth(username, password);
        if (authenticated) {
            const token = await FetchUserToken(request.body.username);
            if (token.substr(1, 11) == "validation=") {
                response.status(401);
                response.send("User needs to verify.")
                OfferVerify(username, token)
            }
            
            if (token) {
                response.status(200);
                response.send({ username,  token });
            } else {
                response.status(401);
                response.send("No token exists, user needs to verify.");
            }
        } else {
            response.status(401);
            response.send("Incorrect login details.");
        }
    } catch(error) {
        response.status(500);
        response.send(error.message);
         try {
        const authenticated = await AttemptAuth(username, password);
        if (authenticated) {
            const token = await FetchUserToken(request.body.username);
            
            if (token) {
                response.status(200);
                response.send({ username,  token });
            } else {
                response.status(401);
                response.send("No token exists, user needs to verify.");
            }
        } else {
            response.status(401);
            response.send("Incorrect login details.");
        }
    } catch(error) {
        response.status(500);
        response.send(error.message);
    }
    }
});

app.post('/register', async (request, response) => {
    const { username, password, email } = request.body

    try { //Check if username is taken!

        const Existence = await CheckUser(username, email);

        if (Existence === 1) {
            response.status(500);
            response.send("Username");
        } else if (Existence === 2) {
            response.status(500);
            response.send("Email");
        }
    } catch(error) {
        response.status(500);
        response.send(error);
    }

    try { //Try registering the user!
        const worked = await Register(username, password, email)
        
    } catch (error) {
        response.status(500);
        response.send("UnknownR")
    }
});

//TODO: DELETE AFTER DONE TESTING
app.post('/email', async (request, response) => {
    const msg = {
        to: 'manavnkjoshi@gmail.com', // Change to your recipient
        from: 'disvelop@proton.me', // Change to your verified sender
        subject: 'TGH Verification',
        html: '<html> <head> <title>EMAIL</title> </head> <body> <div> <h1 style="text-align:center;">Welcome to TGH</h1> <hr> <p style= "text-align:center;">Click the link below to verify your account.</p> <a clicktracking=off href="https://www.sendgrid.com" style="text-align:center; align-self:center;">VERIFY</a> </div> </body> </html> ',
    }

    sgMail
    .send(msg)
    .then(() => {
      console.log('Email sent')
    })
    .catch((error) => {
      console.error(error)
    })
});

app.post('/verify', async (request, response) => {
    const { token } = request.body
    const db = getDatabase();
    const newToken = GenerateToken();

    set(ref(db, `vlist/${token}`), {
        user: null,
    })

    update(ref(db, `users/${username}`), {
        token: newToken,
    })
    response.status(200);
    response.send("Verification successful!");
});



//process.env.PORT
const listener = app.listen(3000, (error) => {
    if (error == null) {
        console.log("Server now running on port " + listener.address().port)
        console.log("http://localhost:" + listener.address().port)
    } else {
        console.log(error)
    }
});

async function AttemptAuth(username, password) {
    const db = ref(getDatabase());

    try {
        const snapshot = await get(child(db, `users/${username}/password`));
        if (snapshot.exists()) {
            const storedPassword = snapshot.val();
            return storedPassword === password;
        } else {
            return false;
        }
    } catch (error) {
        console.error("Error while authenticating the user: ", error);
        return false;
    }
}
async function FetchUserToken(User) {
    const db = ref(getDatabase());
    try {
        const DataSnapshot = await get(child(db, `users/${User}/token`))
        if (DataSnapshot.exists()) {
            return DataSnapshot.val();
        } else {
            return null
        }
    } catch (error) {
        console.log("Error found while fetching user token: " + error)
    }
    return token
}

async function Register(username, password, email) {
    const db = getDatabase();
    const newToken = "validation=" + GenerateToken()
    try {
        set(ref(db, `users/${username}`), {
            password: password,
            email: email,
            favourites: {1: "Placeholder"},
            token: newToken,
        })
        email = email.replace(".", "@@@")
        set(ref(db, `emails/${email}`), {
            user: username,
        })

        set(ref(db, `vlist/${newToken}`), {
            user: username,
        })
    } catch (error) {
        return error
    }

    OfferVerify(username, newToken, email)
    return 0
}

async function CheckUser(username, email) {
    const db = ref(getDatabase());

    const UserSnaphot = await get(child(db, `users/${username}`))
    if (UserSnaphot.exists()) {
        return 1
    }

    email = email.replace(".", "@@@")
    const EmailSnapshot = await get(child(db, `emails/${email}`))
    if (EmailSnapshot.exists()) {
        return 2
    }

    return 0
}

async function OfferVerify(username, token, email) {

    if (email == null) {
        const db = ref(getDatabase());
        const EmailSnapshot = await get(child(db, `users/${username}/email`));
        email = EmailSnapshot.val();
    }

    email = email.replace("@@@", ".")
    let link = "https://tgh.com/verify/" + token
    const msg = {
        to: email, // Change to your recipient
        from: 'disvelop@proton.me', // Change to your verified sender
        subject: 'TGH Verification',
        html: `<html> <head> <title>EMAIL</title> </head> <body> <div> <h1 style="text-align:center;">Welcome to TGH</h1> <hr> <p style= "text-align:center;">Click the link below to verify your account.</p> <a clicktracking=off href="${link}" style="text-align:center; align-self:center;">${link}</a> </div> </body> </html>`,
    }

    sgMail
    .send(msg)
    .then(() => {
      console.log('Email verification sent!')
    })
    .catch((error) => {
      console.error(error)
    })
}

function GenerateToken() {
    return Math.random().toString(36).substr(2) + Math.random().toString(36).substr(2);
}