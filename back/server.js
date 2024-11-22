import express from 'express';
import sgMail from '@sendgrid/mail'
import dotenv from 'dotenv'

import cors from 'cors'
import admin from "firebase-admin";
import Search from "./endpoints/search.js"
import axios from 'axios';

//https://dashboard.render.com/web/srv-crcllkqj1k6c73coiv10/events
//https://console.firebase.google.com/u/0/project/the-golden-hind/database/the-golden-hind-default-rtdb/data/~2F


const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true}));
app.use(cors())

app.use(cors({ origin: '*' }));

dotenv.config();

const adminCert = JSON.parse(process.env.GOOGLE_CREDENTIALS);
const firebaseConfig = {
    credential: admin.credential.cert(adminCert),
    databaseURL: "https://the-golden-hind-default-rtdb.firebaseio.com/",
};




const firebaseApp = admin.initializeApp(firebaseConfig)



const mailAPIkey = process.env.mailAPIkey
sgMail.setApiKey('SG.' + mailAPIkey)

app.get('/', (request, response) => {
    response.status(200);
    response.send("Yarrr! Ahoy there, matey!");
});

app.post('/login', async (request, response) => {
    const { username, password } = request.body
    try {
        const authenticated = await AttemptAuth(username, password);
        if (authenticated) {
            const token = await FetchUserToken(request.body.username);
            if (token.substr(0, 11) == "validation=") {
                await OfferVerify(username, token)
                response.status(202);
                response.send("UNV") // User needs to verify
            } else if (token) {
                response.status(200);
                response.send({ username,  token });
            } else {
                response.status(202);
                response.send("UNV");
            }
        } else {
            response.status(202);
            response.send("ILD"); //Incorrect login details
        }
    } catch(error) {
        response.status(202);
        response.send(error.message); //Unknown error
    }
});

app.post('/register', async (request, response) => {
    const { username, password, email } = request.body

    try { //Check if username is taken!

        const Existence = await CheckUser(username, email);

        if (Existence === 1) {
            response.status(202);
            response.send("UNT"); //Username is taken
            return
        } else if (Existence === 2) {
            response.status(202);
            response.send("ET"); //Email is taken
            return
        }
    } catch(error) {
        response.status(202);
        response.send(error.message);
        return
    }

    try { //Try registering the user!
        const worked = await Register(username, password, email)
    } catch (error) {
        response.status(202);
        response.send(error.message)
        return
    }
    response.status(202);
    response.send("UCS") //User created successfully
});

app.post('/verify', async (request, response) => {
    const { token } = request.body
    const db = admin.database();
    const newToken = GenerateToken();
    
    const snapshot = await db.ref(`vlist/${token}/user`).once('value');
    if (snapshot.exists()) {
        db.ref(`vlist/${token}`).set({ user: null })
        db.ref(`users/${snapshot.val()}`).update({ token: newToken })

        response.status(200);
        response.send("UVS"); //User verified successfully
    } else {
        response.status(202);
        response.send("UKE"); //Unknown error occurred
    }
});

app.post('/search', async (request, response) => {
    const { query } = request.body;
    Search(query).then((Data) => {
        response.status(200);
        response.send(Data);
    })
});

app.post('/home', async (request, response) => {
    const { user, token } = request.body
    const db = admin.database();

    const snapshot = await db.ref(`users/${user}/token`).once('value');
    if (snapshot.exists()) {
        if (snapshot.val() == token) {
            const favourites = await db.ref(`users/${user}/favourites`).once('value');
            const continues = await db.ref(`users/${user}/continues`).once('value');
            let favArray = JSON.parse(favourites.val())
            let conArray = JSON.parse(continues.val())

            favArray = await Promise.all(favArray.map(item => GetInfo(item)));

            conArray = await Promise.all(conArray.map(item => GetInfo(item)));

            const Trending = await axios({
                method: 'get',
                url: 'https://api.themoviedb.org/3/trending/all/week?api_key=' + process.env.TMDB_Credentials,
            });

            response.status(200);
            response.json({ favourites: favourites.val(), continues: continues.val(), favouritesData: favArray, continuesData: conArray, trendingData: Trending.data}); //User data retrieved successfully
        }
    } else {
        response.status(202);
        response.send("UDE"); //User does not exist
    }
});

async function GetInfo(ID) {
    const Key = ID.slice(1, 100000)
    const Link = (ID.slice(0, 1) == "t" ? 'https://api.themoviedb.org/3/tv/' + Key + '?api_key=' + process.env.TMDB_Credentials: 'https://api.themoviedb.org/3/movie/' + Key + '?api_key=' + process.env.TMDB_Credentials)
    try {
        const apiResponse = await axios({
            method: 'get',
            url: Link,
        });
        return apiResponse.data
    } catch(error) {
        console.log(error)
    }
}

app.post('/similar', async (request, response) => {
    const { user, token, ID} = request.body

    if (Authenticate(user, token)) {
        try {
            const Key = ID.slice(1, 100000)
            const Link = (ID.slice(0, 1) == "t" ? 'https://api.themoviedb.org/3/tv/' + Key + '/similar?api_key=' + process.env.TMDB_Credentials : 'https://api.themoviedb.org/3/movie/' + Key + '/similar?api_key=' + process.env.TMDB_Credentials)
           
            const apiResponse = await axios({
                method: 'get',
                url: Link,
            });
            response.status(200)
            response.send(JSON.stringify(apiResponse.data.results.slice(0,4)))
        } catch(error) {
            console.log(error)
            response.status(202)
            response.send("UKE")
        }
    } else {
        response.status(202)
        response.send("UNV")
    }
});

app.post('/eretrieve', async (request, response) => {
    const { user, token, series, season, episode } = request.body

    if (Authenticate(user, token)) {
        try {
            const apiResponse = await axios({
                method: 'get',
                url: `https://api.themoviedb.org/3/tv/${series}/season/${season}/episode/${episode}?api_key=${process.env.TMDB_Credentials}`,
            });
    
            response.status(200)
            response.send(JSON.stringify(apiResponse.data))
        } catch(error) {
            console.log(error)
            response.status(202)
            response.send("UKE")
        }
    } else {
        response.status(202)
        response.send("UNV")
    }
});

app.post('/mretrieve', async (request, response) => {
    const { user, token, movie } = request.body

    if (Authenticate(user, token)) {
        try {
            const apiResponse = await axios({
                method: 'get',
                url: 'https://api.themoviedb.org/3/movie/' + movie + '?api_key=' + process.env.TMDB_Credentials,
            });
            response.status(200)
            response.send(JSON.stringify(apiResponse.data))
        } catch(error) {
            // console.log(error)
            response.status(202)
            response.send("UKE")
        }
    } else {
        response.status(202)
        response.send("UNV")
    }
    
});

app.post('/sretrieve', async (request, response) => {
    const { user, token, series } = request.body

    if (Authenticate(user, token)) {
        try {
            const apiResponse = await axios({
                method: 'get',
                url: 'https://api.themoviedb.org/3/tv/' + series + '?api_key=' + process.env.TMDB_Credentials,
            });
            response.status(200)
            response.send(JSON.stringify(apiResponse.data))
        } catch(error) {
            // console.log(error)
            response.status(202)
            response.send("UKE")
        }
    } else {
        response.status(202)
        response.send("UNV")
    }
    
});

app.post('/favourite', async (request, response) => {
    const {user, token, favId} = request.body
    const db = admin.database();

    if (Authenticate(user, token)) {
        const snapshot = await db.ref(`users/${user}/favourites`).once('value');
        if (snapshot.val() == "nil") {
            db.ref(`users/${user}`).set({ favourites: JSON.stringify([favId])})
        } else {
            let favourites = JSON.parse(snapshot.val())
            favourites.push(favId)
            db.ref(`users/${user}`).update({ favourites: JSON.stringify(favourites)})
        }
        response.status(200)
        response.send("Success")
    } else {
        response.status(202)
        response.send("UNV")
    }
})

app.post('/unfavourite', async (request, response) => {
    const {user, token, favId} = request.body
    const db = admin.database();

    if (Authenticate(user, token)) {
        const snapshot = await db.ref(`users/${user}/favourites`).once('value');
        if (snapshot.val() == "nil") {
            response.status(202)
            response.send("UFE")
        } else {
            let favourites = JSON.parse(snapshot.val())
            favourites.splice(favourites.indexOf(favId), 1)
            db.ref(`users/${user}`).update({ favourites: JSON.stringify(favourites)})
        }
        response.status(200)
        response.send("Success")
    } else {
        response.status(202)
        response.send("UNV")
    }
})

app.post('/continue', async (request, response) => {
    const {user, token, favId} = request.body
    const db = admin.database();

    if (Authenticate(user, token)) {
        const snapshot = await db.ref(`users/${user}/continues`).once('value');
        if (snapshot.val() == "nil") {
            db.ref(`users/${user}`).set({ continues: JSON.stringify([favId])})
        } else {
            let continues = JSON.parse(snapshot.val())
            continues.push(favId)
            db.ref(`users/${user}`).update({ continues: JSON.stringify(continues)})
        }
        response.status(200)
        response.send("Success")
    } else {
        response.status(202)
        response.send("UNV")
    }
})

app.post('/uncontinue', async (request, response) => {
    const {user, token, favId} = request.body
    const db = admin.database();

    if (Authenticate(user, token)) {
        const snapshot = await db.ref(`users/${user}/continues`).once('value');
        if (snapshot.val() == "nil") {
            response.status(202)
            response.send("UFE")
        } else {
            let continues = JSON.parse(snapshot.val())
            continues.splice(continues.indexOf(favId), 1)
            db.ref(`users/${user}`).update({ continues: JSON.stringify(continues)})
        }
        response.status(200)
        response.send("Success")
    } else {
        response.status(202)
        response.send("UNV")
    }
})



//process.env.PORT
const listener = app.listen(3000, (error) => {
    if (error == null) {
        console.log("Server now running on port " + listener.address().port)
        console.log("http://localhost:" + listener.address().port)
    } else {
        console.log(error)
    }
});

async function Authenticate(user, token) {
    const db = admin.database();

    const snapshot = await db.ref(`users/${user}/token`).once('value');
    if (snapshot.exists()) {
        if (token == snapshot.val()) {
            return true
        }
    }
    return false
}

async function AttemptAuth(username, password) {
    const db = admin.database();

    try {
            
        const snapshot = await db.ref(`users/${username}/password`).once('value');
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
async function FetchUserToken(username) {
    const db = admin.database();
    try {
        const DataSnapshot = await db.ref(`users/${username}/token`).once('value');
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
    const db = admin.database();
    const newToken = "validation=" + GenerateToken()
    try {

        db.ref(`users/${username}`).set({ 
            password: password,
            email: email,
            favourites: "[]",
            continues: "[]",
            token: newToken,
        })

        email = email.replace(".", "@@@")

        db.ref(`emails/${email}`).set({ 
            user: username,
        })

        db.ref(`vlist/${newToken}`).set({ 
            user: username,
        })
    } catch (error) {
        return error
    }

    await OfferVerify(username, newToken, email)
    return 0
}

async function CheckUser(username, email) {
    const db = admin.database();

    const UserSnaphot = await db.ref(`users/${username}`).once('value');
    if (UserSnaphot.exists()) {
        return 1
    }

    email = email.replace(".", "@@@")
    const EmailSnapshot = await db.ref(`emails/${email}`).once('value');
    if (EmailSnapshot.exists()) {
        return 2
    }

    return 0
}

async function OfferVerify(username, token, email) {
    if (email == null) {
        const db = admin.database()
        const EmailSnapshot = await db.ref(`users/${username}/email`).once('value');
        email = EmailSnapshot.val();
    }

    email = email.replace("@@@", ".")

    let link = "https://the-golden-hind.web.app/auth/" + token
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
        console.log("VerE")
      console.error(error)
    })
}

function GenerateToken() {
    return Math.random().toString(36).substr(2) + Math.random().toString(36).substr(2);
}