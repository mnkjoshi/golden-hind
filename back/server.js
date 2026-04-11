import express from 'express';
import sgMail from '@sendgrid/mail'
import dotenv from 'dotenv'

import cors from 'cors'
import admin from "firebase-admin";
import Search from "./endpoints/search.js"
import axios from 'axios';
import * as cheerio from 'cheerio';

//https://dashboard.render.com/web/srv-crcllkqj1k6c73coiv10/events
//https://console.firebase.google.com/u/0/project/the-golden-hind/database/the-golden-hind-default-rtdb/data/~2F


const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true}));



app.use(cors({
  origin: ["https://the-golden-hind.web.app", "http://localhost:5173", "https://ghind.tech", "http://ghind.tech"],
  credentials: true,
}));

app.options("*", cors());


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

app.get('/book-search', async (request, response) => {
    const query = request.query.q || 'red rising';
    
    try {
        // Use libgen.li which is currently working
        const searchUrl = `https://libgen.li/index.php?req=${encodeURIComponent(query)}&columns[]=t&columns[]=a&columns[]=s&columns[]=y&columns[]=p&columns[]=i&objects[]=f&objects[]=e&objects[]=s&objects[]=a&topics[]=l&topics[]=c&res=25&filesuns=all`;
        
        console.log(`Searching LibGen for: "${query}"`);
        
        const { data } = await axios.get(searchUrl, {
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html'
            }
        });
        
        // Parse HTML with cheerio
        const $ = cheerio.load(data);
        const results = [];
        
        // Try different selectors
        let rows = $('table.catalog tbody tr');
        if (rows.length === 0) {
            rows = $('table tbody tr');
        }
        if (rows.length === 0) {
            rows = $('table tr');
        }
        
        // LibGen table structure - find all book rows
        rows.each((i, row) => {
            try {
                const $row = $(row);
                const cells = $row.find('td');
                
                // Only process rows with 9 cells (actual book entries)
                if (cells.length === 9) {
                    // Extract data from the 9 cells
                    // Typical order: Author, Title, Publisher, Year, Pages, Language, Size, Extension, Download
                    const author = cells.eq(0).text().trim();
                    const title = cells.eq(1).find('a').first().text().trim() || cells.eq(1).text().trim();
                    const publisher = cells.eq(2).text().trim();
                    const year = cells.eq(3).text().trim();
                    const pages = cells.eq(4).text().trim();
                    const language = cells.eq(5).text().trim();
                    const size = cells.eq(6).text().trim();
                    const extension = cells.eq(7).text().trim();
                    
                    // Get download link from last cell
                    const downloadLink = cells.eq(8).find('a').attr('href');
                    
                    if (title) {
                        results.push({
                            title,
                            author,
                            publisher,
                            year,
                            pages,
                            language,
                            size,
                            extension,
                            downloadLink: downloadLink ? (downloadLink.startsWith('http') ? downloadLink : `https://libgen.li${downloadLink}`) : null
                        });
                    }
                }
            } catch (err) {
                console.error('Error parsing row:', err.message);
            }
        });
        
        console.log(`Found ${results.length} results`);
        
        response.status(200).json({
            success: true,
            count: results.length,
            results: results,
            source: 'LibGen'
        });
        
    } catch (err) {
        console.error('LibGen error:', err.message);
        logError('anonymous', '/book-search', err).catch(() => {});
        response.status(500).json({
            success: false,
            error: err.message
        });
    }
});

app.post('/login', async (request, response) => {

    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
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
        logError(username || 'unknown', '/login', error).catch(() => {});
        response.status(202);
        response.send(error.message); //Unknown error
    }
});

app.post('/register', async (request, response) => {

    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
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

    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
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

    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    const { query } = request.body;
    Search(query).then((Data) => {
        response.status(200);
        response.send(Data);
    })
});

// Mini endpoint - returns last 10 items quickly for initial page load
app.post('/home-mini', async (request, response) => {

    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    const { user, token } = request.body
    const db = admin.database();

    if (await Authenticate(user, token)) {
        const [favourites, continues] = await Promise.all([
            db.ref(`users/${user}/favourites`).once('value'),
            db.ref(`users/${user}/continues`).once('value')
        ]);
        let favArray = JSON.parse(favourites.val())
        let conArray = JSON.parse(continues.val())

        // Get only last 10 items for quick initial load
        const favMini = favArray.slice(-10).reverse();
        const conMini = conArray.slice(-10).reverse();

        const favData = await Promise.all(favMini.map(item => GetInfo(item)));
        const conData = await Promise.all(conMini.map(item => GetInfo(item)));
        response.status(200);
        response.json({ 
            favourites: favourites.val(), 
            continues: continues.val(), 
            favouritesData: favData, 
            continuesData: conData 
        });
    } else {
        response.status(202);
        response.send("UDE");
    }
});

// Full favourites endpoint
app.post('/home-favourites', async (request, response) => {

    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    const { user, token } = request.body
    const db = admin.database();

    if (await Authenticate(user, token)) {
        const favourites = await db.ref(`users/${user}/favourites`).once('value');
        let favArray = JSON.parse(favourites.val())

        const favData = await Promise.all(favArray.map(item => GetInfo(item)));

        response.status(200);
        response.json({ 
            favourites: favourites.val(), 
            favouritesData: favData 
        });
    } else {
        response.status(202);
        response.send("UDE");
    }
});

// Full continues endpoint
app.post('/home-continues', async (request, response) => {

    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    const { user, token } = request.body
    const db = admin.database();
    
    if (await Authenticate(user, token)) {
        const continues = await db.ref(`users/${user}/continues`).once('value');
        let conArray = JSON.parse(continues.val())

        const conData = await Promise.all(conArray.map(item => GetInfo(item)));

        response.status(200);
        response.json({ 
            continues: continues.val(), 
            continuesData: conData 
        });
    } else {
        response.status(202);
        response.send("UDE");
    }
});

// Trending endpoint
app.post('/home-trending', async (request, response) => {

    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    const { user, token } = request.body

    if (await Authenticate(user, token)) {
        try {
            const Trending = await axios({
                method: 'get',
                url: 'https://api.themoviedb.org/3/trending/all/week?api_key=' + process.env.TMDB_Credentials,
            });

            response.status(200);
            response.json({ trendingData: Trending.data });
        } catch(error) {
            logError(user, '/home-trending', error).catch(() => {});
            console.log(error);
            response.status(202);
            response.send("UKE");
        }
    } else {
        response.status(202);
        response.send("UNV");
    }
});

const tmdbCache = new Map();
const logoCache = new Map();

async function getTMDBLogo(mediaType, id) {
    const key = `${mediaType}-${id}`;
    if (logoCache.has(key)) return logoCache.get(key);
    try {
        const url = `https://api.themoviedb.org/3/${mediaType}/${id}/images?api_key=${process.env.TMDB_Credentials}&include_image_language=en,null`;
        const res = await axios.get(url);
        const logos = (res.data.logos || []).filter(l => l.iso_639_1 === 'en' || l.iso_639_1 == null);
        logos.sort((a, b) => b.vote_average - a.vote_average);
        const path = logos[0]?.file_path || null;
        logoCache.set(key, path);
        return path;
    } catch {
        return null;
    }
}

async function GetInfo(ID) {
    if (tmdbCache.has(ID)) {
        return tmdbCache.get(ID);
    } else {
        const data = await TMDBFetch(ID);
        if (data) {tmdbCache.set(ID, data);}
        
        return data;
    }
}

async function TMDBFetch(ID) {
    const Key = ID.slice(1, 100000)
    const Link = (ID.slice(0, 1) == "t" ? 'https://api.themoviedb.org/3/tv/' + Key + '?api_key=' + process.env.TMDB_Credentials: 'https://api.themoviedb.org/3/movie/' + Key + '?api_key=' + process.env.TMDB_Credentials)
    try {
        const apiResponse = await axios({
            method: 'get',
            url: Link,
        });
        
        // Return only essential fields to reduce payload size
        const data = apiResponse.data;
        return {
            id: data.id,
            name: data.name || data.title,
            title: data.title || data.name,
            poster_path: data.poster_path,
            backdrop_path: data.backdrop_path,
            vote_average: data.vote_average,
            number_of_episodes: data.number_of_episodes,
            media_type: ID.slice(0, 1) == "t" ? "tv" : "movie",
            release_date: data.release_date,
            first_air_date: data.first_air_date,
            original_language: data.original_language,
            overview: data.overview,
            genre_ids: data.genres ? data.genres.map(g => g.id) : data.genre_ids || [],
            popularity: data.popularity
        };
    } catch(error) {
        console.log(error)
        return null;
    }
}

app.post('/similar', async (request, response) => {

    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
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
            logError(user, '/similar', error).catch(() => {});
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

    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
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
            logError(user, '/eretrieve', error).catch(() => {});
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

    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
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
            logError(user, '/mretrieve', error).catch(() => {});
            response.status(202)
            response.send("UKE")
        }
    } else {
        response.status(202)
        response.send("UNV")
    }

});

app.post('/sretrieve', async (request, response) => {

    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
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
            logError(user, '/sretrieve', error).catch(() => {});
            response.status(202)
            response.send("UKE")
        }
    } else {
        response.status(202)
        response.send("UNV")
    }

});

app.post('/favourite', async (request, response) => {

    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
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

    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    const {user, token, favId} = request.body
    const db = admin.database();
    console.log(favId);
    if (Authenticate(user, token)) {
        console.log("Auth passed");
        const snapshot = await db.ref(`users/${user}/favourites`).once('value');
        if (snapshot.val() == "nil") {
            response.status(202)
            response.send("UFE")
            console.log("No favs");
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

    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    const {user, token, favId} = request.body
    const db = admin.database();

    if (Authenticate(user, token)) {
        const snapshot = await db.ref(`users/${user}/continues`).once('value');
        if (snapshot.val() == "nil") {
            db.ref(`users/${user}`).set({ continues: JSON.stringify([favId])})
        } else {
            let continues = JSON.parse(snapshot.val())
           if (continues.includes(favId)){
                continues.splice(continues.indexOf(favId), 1)
                continues.push(favId)
                db.ref(`users/${user}`).update({ continues: JSON.stringify(continues)})
           } else {
                continues.push(favId)
                db.ref(`users/${user}`).update({ continues: JSON.stringify(continues)})
           }
        }
        response.status(200)
        response.send("Success")
    } else {
        response.status(202)
        response.send("UNV")
    }
})

app.post('/uncontinue', async (request, response) => {

    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
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


app.post('/progress_update', async (request, response) => {

    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    const {user, token, progID, progStatus} = request.body
    const db = admin.database();

    if (Authenticate(user, token)) {
        const snapshot = await db.ref(`users/${user}/progress/${progID}`).once('value');
        
        if (snapshot.exists()) {
            await db.ref(`users/${user}/progress/${progID}`).update({status: progStatus })
        } else {
            // add data
            await db.ref(`users/${user}/progress/${progID}`).set({status: progStatus })
        }
        response.status(200)
        response.send("Success")
    } else {
        response.status(202)
        response.send("UNV")
    }
})

app.post('/progress_retrieve', async (request, response) => {

    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    const {user, token, progID} = request.body
    const db = admin.database();

    if (Authenticate(user, token)) {
        const snapshot = await db.ref(`users/${user}/progress/${progID}`).once('value');

        if (snapshot.exists()) {
            let ReturnVal = snapshot.val()
            response.status(200)
            response.send({
                season: ReturnVal.status.split(";")[0],
                episode: ReturnVal.status.split(";")[1]
            })
        } else {
            response.status(404)
            response.send("VNF")
        }
        
    } else {
        response.status(202)
        response.send("UNV")
    }
})



app.post('/track', async (request, response) => {
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    const { user, token, event, data } = request.body;
    if (!await Authenticate(user, token)) {
        return response.status(202).send("UNV");
    }
    logAnalytic(user, event, data).catch(() => {});
    response.status(200).send("OK");
});

app.post('/admin/data', async (request, response) => {
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    const { user, token } = request.body;
    if (!await AuthenticateAdmin(user, token)) {
        return response.status(403).send("Forbidden");
    }
    try {
        const db = admin.database();
        const [errorsSnap, analyticsSnap, usersSnap] = await Promise.all([
            db.ref('admin/errors').orderByChild('timestamp').limitToLast(100).once('value'),
            db.ref('admin/analytics/events').orderByChild('timestamp').limitToLast(200).once('value'),
            db.ref('users').once('value')
        ]);
        const errors = errorsSnap.val()
            ? Object.values(errorsSnap.val()).sort((a, b) => b.timestamp - a.timestamp)
            : [];
        const analytics = analyticsSnap.val()
            ? Object.values(analyticsSnap.val()).sort((a, b) => b.timestamp - a.timestamp)
            : [];
        const users = usersSnap.val() ? Object.keys(usersSnap.val()) : [];
        response.status(200).json({ errors, analytics, users });
    } catch (error) {
        logError('manav', '/admin/data', error).catch(() => {});
        response.status(200).json({ errors: [], analytics: [], users: [], fetchError: error.message });
    }
});

app.post('/watch-time', async (request, response) => {
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    const { user, token, contentId, contentName, duration } = request.body;
    if (!await Authenticate(user, token)) {
        return response.status(202).send("UNV");
    }
    try {
        if (!duration || duration < 10) { response.status(200).send("OK"); return; }
        const db = admin.database();
        await db.ref(`users/${user}/watch_sessions`).push({
            contentId: contentId || '',
            contentName: contentName || 'Unknown',
            duration: Math.round(duration),
            timestamp: Date.now()
        });
        response.status(200).send("OK");
    } catch (error) {
        logError(user, '/watch-time', error).catch(() => {});
        response.status(500).send(error.message);
    }
});

app.post('/user/stats', async (request, response) => {
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    const { user, token } = request.body;
    if (!await Authenticate(user, token)) {
        return response.status(202).send("UNV");
    }
    try {
        const db = admin.database();
        const sessionsSnap = await db.ref(`users/${user}/watch_sessions`)
            .orderByChild('timestamp')
            .limitToLast(50)
            .once('value');
        const sessions = sessionsSnap.val()
            ? Object.values(sessionsSnap.val()).sort((a, b) => b.timestamp - a.timestamp)
            : [];
        const totalSeconds = sessions.reduce((sum, s) => sum + (s.duration || 0), 0);
        response.status(200).json({ sessions, totalSeconds });
    } catch (error) {
        logError(user, '/user/stats', error).catch(() => {});
        response.status(200).json({ sessions: [], totalSeconds: 0 });
    }
});

app.post('/account/info', async (request, response) => {
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    const { user, token } = request.body;
    if (!await Authenticate(user, token)) {
        return response.status(202).send("UNV");
    }
    try {
        const db = admin.database();
        const emailSnap = await db.ref(`users/${user}/email`).once('value');
        response.status(200).json({ username: user, email: emailSnap.val() || '' });
    } catch (error) {
        logError(user, '/account/info', error).catch(() => {});
        response.status(500).send(error.message);
    }
});

app.post('/account/change-password', async (request, response) => {
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    const { user, token, currentPassword, newPassword } = request.body;
    if (!await Authenticate(user, token)) {
        return response.status(202).send("UNV");
    }
    try {
        if (!newPassword || newPassword.length < 6) {
            return response.status(200).send("PWS");
        }
        const db = admin.database();
        const storedPwSnap = await db.ref(`users/${user}/password`).once('value');
        if (storedPwSnap.val() !== currentPassword) {
            return response.status(200).send("ILD");
        }
        await db.ref(`users/${user}`).update({ password: newPassword });
        // Invalidate cache so new password takes effect
        userCache.delete(user);
        response.status(200).send("PUS");
    } catch (error) {
        logError(user, '/account/change-password', error).catch(() => {});
        response.status(500).send(error.message);
    }
});

app.post('/recommendations/lifetime', async (request, response) => {
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    const { user, token } = request.body;
    if (!await Authenticate(user, token)) return response.status(202).send("UNV");

    try {
        const db = admin.database();
        const [favsSnap, contsSnap] = await Promise.all([
            db.ref(`users/${user}/favourites`).once('value'),
            db.ref(`users/${user}/continues`).once('value')
        ]);

        const favIds  = JSON.parse(favsSnap.val()  || '[]');
        const contIds = JSON.parse(contsSnap.val() || '[]');

        // All bookmarks + last 5 continues; bookmarks are the emphasis
        const ids = [...favIds, ...contIds.slice(-5)];
        if (ids.length === 0) return response.status(200).json([]);

        const contentInfo = (await Promise.all(ids.map(id => GetInfo(id).catch(() => null)))).filter(Boolean);
        if (contentInfo.length === 0) return response.status(200).json([]);

        // Build set of existing TMDB IDs so we can filter them out of recommendations
        const existingIdSet = new Set([...favIds, ...contIds].map(id => String(id.slice(1))));

        const llmRecs = await getRecommendations(contentInfo, 'lifetime');

        const recDetails = (await Promise.all(llmRecs.map(async rec => {
            try {
                const found = await searchTMDBByTitle(rec.title, rec.year, rec.type);
                if (!found) return null;
                const info = await GetInfo((found.type === 'tv' ? 't' : 'm') + found.id);
                if (!info) return null;
                info.logo_path = await getTMDBLogo(found.type, found.id);
                return info;
            } catch { return null; }
        }))).filter(r => r && !existingIdSet.has(String(r.id)));

        response.status(200).json(recDetails.slice(0, 5));
    } catch (error) {
        logError(user, '/recommendations/lifetime', error).catch(() => {});
        response.status(200).json([]);
    }
});

app.post('/recommendations/recent', async (request, response) => {
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    const { user, token } = request.body;
    if (!await Authenticate(user, token)) return response.status(202).send("UNV");

    try {
        const db = admin.database();
        const [favsSnap2, contsSnap2] = await Promise.all([
            db.ref(`users/${user}/favourites`).once('value'),
            db.ref(`users/${user}/continues`).once('value')
        ]);
        const favIds2  = JSON.parse(favsSnap2.val()  || '[]');
        const contIds2 = JSON.parse(contsSnap2.val() || '[]');
        const recent5  = contIds2.slice(-5);

        if (recent5.length === 0) return response.status(200).json([]);

        const contentInfo = (await Promise.all(recent5.map(id => GetInfo(id).catch(() => null)))).filter(Boolean);
        if (contentInfo.length === 0) return response.status(200).json([]);

        // Filter out anything already in favourites or continue-watching
        const existingIdSet2 = new Set([...favIds2, ...contIds2].map(id => String(id.slice(1))));

        const llmRecs = await getRecommendations(contentInfo, 'recent');

        const recDetails = (await Promise.all(llmRecs.map(async rec => {
            try {
                const found = await searchTMDBByTitle(rec.title, rec.year, rec.type);
                if (!found) return null;
                const info = await GetInfo((found.type === 'tv' ? 't' : 'm') + found.id);
                if (!info) return null;
                info.logo_path = await getTMDBLogo(found.type, found.id);
                return info;
            } catch { return null; }
        }))).filter(r => r && !existingIdSet2.has(String(r.id)));

        response.status(200).json(recDetails.slice(0, 5));
    } catch (error) {
        logError(user, '/recommendations/recent', error).catch(() => {});
        response.status(200).json([]);
    }
});

app.post('/admin/create-user', async (request, response) => {
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    const { user, token, newUsername, newPassword, newEmail } = request.body;
    if (!await AuthenticateAdmin(user, token)) {
        return response.status(403).send("Forbidden");
    }
    try {
        const exists = await CheckUser(newUsername, newEmail);
        if (exists === 1) { response.status(200).send("UNT"); return; }
        if (exists === 2) { response.status(200).send("ET"); return; }
        const db = admin.database();
        const newToken = GenerateToken();
        await db.ref(`users/${newUsername}`).set({
            password: newPassword,
            email: newEmail,
            favourites: "[]",
            continues: "[]",
            token: newToken,
        });
        const escapedEmail = newEmail.replace(".", "@@@");
        await db.ref(`emails/${escapedEmail}`).set({ user: newUsername });
        response.status(200).send("UCS");
    } catch (error) {
        logError('manav', '/admin/create-user', error).catch(() => {});
        response.status(500).send(error.message);
    }
});

//process.env.PORT
const listener = app.listen(3001, (error) => {
    if (error == null) {
        console.log("Server now running on port " + listener.address().port)
        console.log("http://localhost:" + listener.address().port)
    } else {
        console.log(error)
    }
});

const userCache = new Map();

async function Authenticate(user, token) {
    if (userCache.has(user)) {
        if (userCache.get(user).token == token) {
            return true
        } else {
            return false
        }
    } else {
        const db = admin.database();

        const snapshot = await db.ref(`users/${user}/token`).once('value');
        if (snapshot.exists()) {
            if (token == snapshot.val()) {
                userCache.set(user, {
                    token: token,
                    expires: Date.now() + 30 * 24 * 60 * 60 * 1000 // Cache for 1 month
                })
                return true
            }
        }
        return false
    }
    
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

async function AuthenticateAdmin(user, token) {
    if (user !== 'manav') return false;
    return await Authenticate(user, token);
}

async function logError(user, endpoint, error) {
    try {
        const db = admin.database();
        await db.ref('admin/errors').push({
            user: user || 'anonymous',
            endpoint,
            message: error.message || String(error),
            timestamp: Date.now()
        });
    } catch (_) {}
}

async function logAnalytic(user, event, data) {
    try {
        const db = admin.database();
        await db.ref('admin/analytics/events').push({
            user: user || 'anonymous',
            event,
            data: data || {},
            timestamp: Date.now()
        });
    } catch (_) {}
}

async function searchTMDBByTitle(title, year, type) {
    const endpoint = type === 'tv' ? 'tv' : 'movie';
    const yearParam = type === 'tv' ? 'first_air_date_year' : 'year';
    try {
        const r1 = await axios.get(
            `https://api.themoviedb.org/3/search/${endpoint}?api_key=${process.env.TMDB_Credentials}&query=${encodeURIComponent(title)}&${yearParam}=${year}`
        );
        if (r1.data.results?.length) return { id: r1.data.results[0].id, type };
        // Fallback without year constraint
        const r2 = await axios.get(
            `https://api.themoviedb.org/3/search/${endpoint}?api_key=${process.env.TMDB_Credentials}&query=${encodeURIComponent(title)}`
        );
        if (r2.data.results?.length) return { id: r2.data.results[0].id, type };
    } catch {}
    return null;
}

async function getRecommendations(contentList, mode) {
    if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured');

    const items = contentList.slice(0, 20).map(item => {
        const title = item.name || item.title || 'Unknown';
        const type = item.media_type === 'tv' ? 'TV Show' : 'Movie';
        const overview = item.overview ? item.overview.slice(0, 120) : '';
        return `- "${title}" (${type}${overview ? ` — ${overview}` : ''})`;
    }).join('\n');

    const modeDesc = mode === 'lifetime'
        ? "the user's all-time favourites and watch history (weight the bookmarks heavily)"
        : "the user's 5 most recently watched titles (match their current viewing mood)";

    const prompt = `You are a movie and TV show recommendation engine. Here are ${modeDesc}:\n\n${items}\n\nRecommend exactly 10 movies or TV shows they would enjoy that are NOT already in the list above. Include a variety of genres and types.\nReturn ONLY a raw JSON array with no markdown, no explanation, no code fences:\n[{"title":"Title 1","year":2021,"type":"movie"},{"title":"Title 2","year":2019,"type":"tv"},...]`;

    const resp = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${process.env.GEMINI_API_KEY}`,
        { contents: [{ parts: [{ text: prompt }] }] }
    );

    const text = resp.data.candidates[0].content.parts[0].text.trim();
    const match = text.match(/\[[\s\S]*?\]/);
    if (!match) throw new Error('No JSON array found in Gemini response');
    return JSON.parse(match[0]);
}