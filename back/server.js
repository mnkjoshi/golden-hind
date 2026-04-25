import express from 'express';
import { MailerSend, EmailParams, Sender, Recipient } from "mailersend";
import dotenv from 'dotenv'

import cors from 'cors'
import admin from "firebase-admin";
import Search from "./endpoints/search.js"
import axios from 'axios';
import * as cheerio from 'cheerio';
import { create as createYtDlp } from 'yt-dlp-exec';
const ytDlpExec = createYtDlp('/usr/local/bin/yt-dlp');
import ytdl from '@distube/ytdl-core';
import os from 'os';
import fs from 'fs';
import path from 'path';

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



const mailerSend = new MailerSend({ apiKey: process.env.MAILERSEND_API_KEY });
const verifyEmailSender = new Sender("verify@goldenhind.tech", "Francis Drake");

app.get('/', (request, response) => {
    response.status(200);
    response.send("Yarrr! Ahoy there, matey!");
});

app.post('/debug/subtitle-trace', (request, response) => {
    const body = request.body || {};
    console.log('[subtitle-trace]', JSON.stringify({
        at: new Date().toISOString(),
        event: body.event,
        id: body.id,
        user: body.user,
        currentTime: body.currentTime,
        duration: body.duration,
        presentationMode: body.presentationMode,
        tracks: body.tracks,
        detail: body.detail,
    }));
    response.status(204).end();
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

// Trailer endpoint — returns a YouTube trailer key for a given TMDB id
app.post('/home-trailer', async (request, response) => {
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    const { user, token, tmdbId, mediaType } = request.body;
    if (!await Authenticate(user, token)) return response.status(202).send("UNV");
    try {
        const cacheKey = `${mediaType}-${tmdbId}`;
        if (trailerCache.has(cacheKey)) return response.status(200).json(trailerCache.get(cacheKey));
        const url = `https://api.themoviedb.org/3/${mediaType}/${tmdbId}/videos?api_key=${process.env.TMDB_Credentials}`;
        const res = await axios.get(url);
        const videos = res.data.results || [];
        const trailer = videos.find(v => v.site === 'YouTube' && v.type === 'Trailer')
                     || videos.find(v => v.site === 'YouTube' && v.type === 'Teaser')
                     || videos.find(v => v.site === 'YouTube');
        const result = { key: trailer?.key || null };
        trailerCache.set(cacheKey, result);
        response.status(200).json(result);
    } catch (error) {
        logError(user, '/home-trailer', error).catch(() => {});
        response.status(200).json({ key: null });
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

            const top5 = (Trending.data.results || []).slice(0, 5);
            const enriched = await Promise.all(top5.map(async item => {
                const mediaType = item.media_type === 'movie' ? 'movie' : 'tv';
                const logo_path = await getTMDBLogo(mediaType, item.id).catch(() => null);
                return { ...item, logo_path };
            }));
            const trendingData = { ...Trending.data, results: [...enriched, ...(Trending.data.results || []).slice(5)] };

            response.status(200);
            response.json({ trendingData });
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
const trailerCache = new Map();
const detailCache = new Map();
const seasonCache = new Map();
const similarCache = new Map();

async function getTMDBLogo(mediaType, id) {
    const key = `${mediaType}-${id}`;
    if (logoCache.has(key)) return logoCache.get(key);
    try {
        // Fetch all logos without language restriction — TMDB tagging is inconsistent
        const url = `https://api.themoviedb.org/3/${mediaType}/${id}/images?api_key=${process.env.TMDB_Credentials}`;
        const res = await axios.get(url);
        const logos = res.data.logos || [];
        // Prefer English, then null-language, then highest-voted anything
        const sorted = [
            ...logos.filter(l => l.iso_639_1 === 'en').sort((a, b) => b.vote_average - a.vote_average),
            ...logos.filter(l => l.iso_639_1 == null).sort((a, b) => b.vote_average - a.vote_average),
            ...logos.filter(l => l.iso_639_1 !== 'en' && l.iso_639_1 != null).sort((a, b) => b.vote_average - a.vote_average),
        ];
        const path = sorted[0]?.file_path || null;
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
            if (similarCache.has(ID)) return response.status(200).send(JSON.stringify(similarCache.get(ID)));
            const Key = ID.slice(1, 100000)
            const Link = (ID.slice(0, 1) == "t" ? 'https://api.themoviedb.org/3/tv/' + Key + '/similar?api_key=' + process.env.TMDB_Credentials : 'https://api.themoviedb.org/3/movie/' + Key + '/similar?api_key=' + process.env.TMDB_Credentials)

            const apiResponse = await axios({
                method: 'get',
                url: Link,
            });
            const results = apiResponse.data.results.slice(0,4);
            similarCache.set(ID, results);
            response.status(200)
            response.send(JSON.stringify(results))
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
            if (tmdbCache.has('m' + movie)) return response.status(200).send(JSON.stringify(tmdbCache.get('m' + movie)));
            const apiResponse = await axios({
                method: 'get',
                url: 'https://api.themoviedb.org/3/movie/' + movie + '?api_key=' + process.env.TMDB_Credentials,
            });
            tmdbCache.set('m' + movie, apiResponse.data);
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
            if (tmdbCache.has('t' + series)) return response.status(200).send(JSON.stringify(tmdbCache.get('t' + series)));
            const apiResponse = await axios({
                method: 'get',
                url: 'https://api.themoviedb.org/3/tv/' + series + '?api_key=' + process.env.TMDB_Credentials,
            });
            tmdbCache.set('t' + series, apiResponse.data);
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

app.post('/detail', async (request, response) => {
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    const { user, token, tmdbId, mediaType } = request.body;
    if (Authenticate(user, token)) {
        try {
            const cacheKey = `${mediaType}-${tmdbId}`;
            if (detailCache.has(cacheKey)) return response.status(200).json(detailCache.get(cacheKey));
            const append = mediaType === 'movie' ? 'credits,release_dates,images' : 'credits,content_ratings,images';
            const url = mediaType === 'movie'
                ? `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${process.env.TMDB_Credentials}&append_to_response=${append}&include_image_language=en,null`
                : `https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${process.env.TMDB_Credentials}&append_to_response=${append}&include_image_language=en,null`;
            const apiResponse = await axios.get(url);
            detailCache.set(cacheKey, apiResponse.data);
            response.status(200).json(apiResponse.data);
        } catch (error) {
            console.log(error);
            response.status(202).send("UKE");
        }
    } else {
        response.status(202).send("UNV");
    }
});

app.post('/season', async (request, response) => {
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    const { user, token, seriesId, seasonNumber } = request.body;
    if (Authenticate(user, token)) {
        try {
            const cacheKey = `${seriesId}-S${seasonNumber}`;
            if (seasonCache.has(cacheKey)) return response.status(200).json(seasonCache.get(cacheKey));
            const url = `https://api.themoviedb.org/3/tv/${seriesId}/season/${seasonNumber}?api_key=${process.env.TMDB_Credentials}`;
            const apiResponse = await axios.get(url);
            seasonCache.set(cacheKey, apiResponse.data);
            response.status(200).json(apiResponse.data);
        } catch (error) {
            console.log(error);
            response.status(202).send("UKE");
        }
    } else {
        response.status(202).send("UNV");
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



// ── Reviews — one review per user per content, publicly readable ──
app.post('/review', async (req, res) => {
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    const { user, token, contentId, rating, text } = req.body;
    if (!await Authenticate(user, token)) return res.status(202).send("UNV");

    const r = parseInt(rating);
    if (!contentId || isNaN(r) || r < 1 || r > 5) return res.status(400).json({ error: 'Invalid data' });

    const db = admin.database();
    await db.ref(`reviews/${contentId}/${user}`).set({
        username: user,
        rating: r,
        text: String(text || '').trim().slice(0, 3000),
        timestamp: Date.now(),
    });
    res.json({ success: true });
});

app.get('/reviews', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const { contentId } = req.query;
    if (!contentId) return res.json({ reviews: [] });

    const db = admin.database();
    const snap = await db.ref(`reviews/${contentId}`).once('value');
    const val = snap.val();
    const reviews = val
        ? Object.values(val).sort((a, b) => b.timestamp - a.timestamp)
        : [];
    res.json({ reviews });
});

app.get('/recently-reviewed', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    try {
        const db = admin.database();
        const snap = await db.ref('reviews').once('value');
        const val = snap.val();
        if (!val) return res.json({ items: [] });

        // For each contentId find the most recent review timestamp
        const contentLatest = Object.entries(val).map(([contentId, userReviews]) => {
            const latest = Math.max(...Object.values(userReviews).map(r => r.timestamp || 0));
            return { contentId, latest };
        });

        // Sort by most recent, take top 5 unique titles
        contentLatest.sort((a, b) => b.latest - a.latest);
        const top5 = contentLatest.slice(0, 5);

        const items = await Promise.all(top5.map(async ({ contentId, latest }) => {
            try {
                const data = await GetInfo(contentId);
                if (!data) return null;
                const mediaType = contentId.slice(0, 1) === 'm' ? 'movie' : 'tv';
                const logo_path = await getTMDBLogo(mediaType, data.id);
                return { ...data, logo_path, _reviewedAt: latest };
            } catch {
                return null;
            }
        }));

        res.json({ items: items.filter(Boolean) });
    } catch (e) {
        console.error('[recently-reviewed]', e.message);
        res.status(500).json({ items: [] });
    }
});

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

app.post('/admin/user-stats', async (request, response) => {
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    const { user, token, targetUser } = request.body;
    if (!await AuthenticateAdmin(user, token)) {
        return response.status(403).send("Forbidden");
    }
    try {
        const db = admin.database();
        const sessionsSnap = await db.ref(`users/${targetUser}/watch_sessions`).orderByChild('timestamp').limitToLast(50).once('value');
        const sessions = sessionsSnap.val()
            ? Object.values(sessionsSnap.val()).sort((a, b) => b.timestamp - a.timestamp)
            : [];
        const totalSeconds = sessions.reduce((sum, s) => sum + (s.duration || 0), 0);
        response.status(200).json({ sessions, totalSeconds });
    } catch (error) {
        logError('manav', '/admin/user-stats', error).catch(() => {});
        response.status(200).json({ sessions: [], totalSeconds: 0 });
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

        const llmRecs = await getRecommendationsWithRetry(contentInfo, 'lifetime');

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
        console.error('[/recommendations/lifetime] error:', error?.response?.status, error?.response?.data ?? error?.message);
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

        const llmRecs = await getRecommendationsWithRetry(contentInfo, 'recent');

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
        console.error('[/recommendations/recent] error:', error?.response?.status, error?.response?.data ?? error?.message);
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
        const db = admin.database();
        const EmailSnapshot = await db.ref(`users/${username}/email`).once('value');
        email = EmailSnapshot.val();
    }

    email = email.replace("@@@", ".");

    const link = "https://the-golden-hind.web.app/auth/" + token;

    const emailParams = new EmailParams()
        .setFrom(verifyEmailSender)
        .setTo([new Recipient(email, username)])
        .setReplyTo(verifyEmailSender)
        .setSubject("Verify your Golden Hind account")
        .setTemplateId('3yxj6lje7j0gdo2r')
        .setPersonalization([{
            email,
            data: {
                message: [
                    {
                        url: link,
                        image: "https://bucket.mailersendapp.com/351ndgwzmqgzqx8k/pzkmgq7092nl059v/images/a1876ca7-ded6-4072-89d5-a7ec0c9742d4.png",
                        price: "",
                        title: username,
                        priceOld: "",
                        description: "Click the button below to verify your account and set sail.",
                    }
                ]
            }
        }]);

    mailerSend.email.send(emailParams)
        .then(() => console.log(`[verify] Email sent to ${email}`))
        .catch((error) => console.error('[verify] Email error:', error?.response?.body || error.message));
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

// ── LookMovie helpers ─────────────────────────────────────────────────────────

async function getIMDBId(tmdbId, mediaType) {
    const url = `https://api.themoviedb.org/3/${mediaType}/${tmdbId}/external_ids?api_key=${process.env.TMDB_Credentials}`;
    const res = await axios.get(url);
    return res.data.imdb_id || null; // e.g. "tt0317219"
}

function slugify(title) {
    return title.toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

const lookmovieHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.lookmovie2.to/',
};

// In-memory cache for LookMovie internal IDs (keyed by TMDB content ID e.g. "m123")
const lmIdCache = new Map();

async function getOrFetchLookmovieId(contentId, imdbId, mediaType, title, year, dbg) {
    // 1. In-memory hit
    if (lmIdCache.has(contentId)) {
        dbg.push(`LM ID cache hit (memory): ${lmIdCache.get(contentId)}`);
        return lmIdCache.get(contentId);
    }

    // 2. Firebase hit
    const db = admin.database();
    const snap = await db.ref(`lookmovie/${contentId}`).once('value');
    if (snap.exists()) {
        const lmId = snap.val();
        dbg.push(`LM ID cache hit (Firebase): ${lmId}`);
        lmIdCache.set(contentId, lmId);
        return lmId;
    }

    // 3. Scrape and persist
    dbg.push('LM ID not cached — scraping page...');
    const { id: lmId } = await getLookmovieInternalId(imdbId, mediaType, title, year, dbg);
    db.ref(`lookmovie/${contentId}`).set(lmId).catch(() => {});
    lmIdCache.set(contentId, lmId);
    return lmId;
}

async function getLookmovieInternalId(imdbId, mediaType, title, year, dbg) {
    const numericId = imdbId.replace('tt', '');
    const slug = slugify(title);
    const contentPath = mediaType === 'tv' ? 'shows' : 'movies';
    const url = `https://www.lookmovie2.to/${contentPath}/view/${numericId}-${slug}-${year}`;

    dbg.push(`Fetching page: ${url}`);

    const res = await axios.get(url, { headers: lookmovieHeaders, timeout: 20000 });
    const html = res.data;

    dbg.push(`HTTP ${res.status} — response length: ${html.length} chars`);
    dbg.push(`First 400 chars: ${html.slice(0, 400)}`);

    // Extract all inline script tag contents to search within them
    const scriptBlocks = [];
    const scriptRe = /<script(?:\s[^>]*)?>([^<]{20,})<\/script>/gi;
    let sm;
    while ((sm = scriptRe.exec(html)) !== null) scriptBlocks.push(sm[1]);
    dbg.push(`Found ${scriptBlocks.length} non-empty inline script blocks`);

    // Patterns ordered by specificity — IDs can be as small as 2 digits
    const patterns = [
        { label: 'episode/list?id=',        re: /episode\/list\?id=(\d+)/ },
        { label: 'manifest?id=',             re: /manifest\?id=(\d+)/ },
        { label: 'id_show key',              re: /['"](id_show)['"]\s*[=:]\s*['"]*(\d+)/ },
        { label: 'id_movie key',             re: /['"](id_movie)['"]\s*[=:]\s*['"]*(\d+)/ },
        { label: '"show":{"id":N',           re: /"show"\s*:\s*\{[^}]*?"id"\s*:\s*(\d+)/ },
        { label: '"movie":{"id":N',          re: /"movie"\s*:\s*\{[^}]*?"id"\s*:\s*(\d+)/ },
        { label: 'id_show:N (bare)',         re: /id_show\s*[=:]\s*(\d+)/ },
        { label: 'id_movie:N (bare)',        re: /id_movie\s*[=:]\s*(\d+)/ },
        { label: "show_id/movie_id",         re: /(?:show|movie)_id\s*[=:]\s*['"]*(\d+)/ },
        { label: '"id":N any (≥2 digits)',   re: /"id"\s*:\s*(\d{2,})/ },
    ];

    // Search each script block with each pattern
    for (const block of scriptBlocks) {
        for (const { label, re } of patterns) {
            const m = block.match(re);
            if (m) {
                const captured = m[2] || m[1]; // some patterns have 2 groups
                dbg.push(`Found ID "${captured}" in script block via "${label}"`);
                return { id: captured, url };
            }
        }
    }

    // Also try the full HTML as a last resort
    for (const { label, re } of patterns) {
        const m = html.match(re);
        if (m) {
            const captured = m[2] || m[1];
            dbg.push(`Found ID "${captured}" in full HTML via "${label}"`);
            return { id: captured, url };
        }
    }

    // Dump script block samples so we can see what's actually there
    scriptBlocks.forEach((b, i) => {
        dbg.push(`Script block ${i} (first 300 chars): ${b.trim().slice(0, 300)}`);
    });

    throw new Error(`Could not find LookMovie ID at ${url}`);
}

async function getLookmovieEpisodeId(showInternalId, season, episode, dbg) {
    const url = `https://www.lookmovie2.to/api/v2/download/episode/list?id=${showInternalId}`;
    dbg.push(`Fetching episode list: ${url}`);
    const res = await axios.get(url, { headers: lookmovieHeaders, timeout: 10000 });
    dbg.push(`Episode list HTTP ${res.status}, seasons available: ${Object.keys(res.data?.list || {}).join(', ')}`);
    const epId = res.data?.list?.[String(season)]?.[String(episode)]?.id_episode;
    if (!epId) {
        dbg.push(`S${season}E${episode} not found. Season ${season} data: ${JSON.stringify(res.data?.list?.[String(season)])}`);
        throw new Error(`S${season}E${episode} not found in LookMovie episode list`);
    }
    dbg.push(`Episode ID for S${season}E${episode}: ${epId}`);
    return String(epId);
}

async function getLookmovieStreamUrl(internalId, mediaType, dbg) {
    const endpoint = mediaType === 'tv' ? 'episode-access' : 'movie-access';
    const param    = mediaType === 'tv' ? 'id_episode'    : 'id_movie';
    const url = `https://www.lookmovie2.to/api/v1/security/${endpoint}?${param}=${internalId}&expires=9999999999`;

    dbg.push(`Fetching stream access: ${url}`);
    const res = await axios.get(url, { headers: lookmovieHeaders, timeout: 10000 });
    dbg.push(`Stream access HTTP ${res.status}, success: ${res.data.success}, streams: ${JSON.stringify(res.data.streams)}`);
    if (!res.data.success) throw new Error('LookMovie stream access denied');

    const s = res.data.streams;
    // Movies use keys with 'p' (1080p/720p/480p); TV episodes use plain numbers (1080/720/480)
    const streamUrl = s['1080p'] || s['720p'] || s['480p'] || s['1080'] || s['720'] || s['480'];
    if (!streamUrl) throw new Error('No stream URL in LookMovie response');

    return { streamUrl, subtitles: res.data.subtitles || [] };
}

function absolutizeManifestUrl(baseUrl, value) {
    return new URL(value, baseUrl).toString();
}

function proxiedHlsUrl(url) {
    return `/proxy/hls?url=${encodeURIComponent(url)}`;
}

function rewriteManifestUriAttributes(line, baseUrl) {
    return line.replace(/URI="([^"]+)"/g, (_, uri) => {
        if (uri.startsWith('data:')) return `URI="${uri}"`;
        const abs = absolutizeManifestUrl(baseUrl, uri);
        return `URI="${proxiedHlsUrl(abs)}"`;
    });
}

function forceQuotedManifestAttribute(line, attr, value) {
    const re = new RegExp(`(,${attr}=)("[^"]*"|[^,]*)`);
    if (re.test(line)) return line.replace(re, `$1"${value}"`);
    return `${line},${attr}="${value}"`;
}

function rewriteHlsManifest(manifestText, manifestUrl, { subtitleGroupId = null } = {}) {
    return manifestText.split('\n').map(line => {
        const t = line.trim();
        if (!t) return line;

        if (t.startsWith('#')) {
            let out = rewriteManifestUriAttributes(line, manifestUrl);
            if (subtitleGroupId && t.startsWith('#EXT-X-STREAM-INF')) {
                out = forceQuotedManifestAttribute(out, 'SUBTITLES', subtitleGroupId);
            }
            return out;
        }

        const abs = absolutizeManifestUrl(manifestUrl, t);
        return proxiedHlsUrl(abs);
    }).join('\n');
}

function buildSingleVariantMaster({ originalUrl, rewrittenMediaUrl, subMediaLines }) {
    return [
        '#EXTM3U',
        '#EXT-X-VERSION:3',
        ...subMediaLines,
        '#EXT-X-STREAM-INF:BANDWIDTH=5000000,AVERAGE-BANDWIDTH=4500000,SUBTITLES="subs"',
        rewrittenMediaUrl || proxiedHlsUrl(originalUrl),
    ].join('\n');
}

function hlsLanguageCode(sub, index) {
    const raw = String(sub.language || sub.lang || sub.label || '').toLowerCase();
    const file = String(sub.file || sub.url || '').toLowerCase();
    const text = `${raw} ${file}`;
    const languageMap = [
        ['en', /\b(en|eng|english)\b/],
        ['es', /\b(es|spa|spanish|espanol|español)\b/],
        ['fr', /\b(fr|fre|fra|french)\b/],
        ['de', /\b(de|ger|deu|german)\b/],
        ['it', /\b(it|ita|italian)\b/],
        ['pt', /\b(pt|por|portuguese)\b/],
        ['nl', /\b(nl|dut|nld|dutch)\b/],
        ['ru', /\b(ru|rus|russian)\b/],
        ['uk', /\b(uk|ukr|ukrainian)\b/],
        ['cs', /\b(cs|cze|ces|czech)\b/],
        ['el', /\b(el|gre|ell|greek)\b/],
        ['hi', /\b(hi|hin|hindi)\b/],
        ['id', /\b(id|ind|indonesian)\b/],
        ['sv', /\b(sv|swe|swedish)\b/],
        ['no', /\b(no|nor|norwegian)\b/],
        ['da', /\b(da|dan|danish)\b/],
        ['fi', /\b(fi|fin|finnish)\b/],
        ['pl', /\b(pl|pol|polish)\b/],
        ['tr', /\b(tr|tur|turkish)\b/],
        ['ar', /\b(ar|ara|arabic)\b/],
        ['ja', /\b(ja|jpn|japanese)\b/],
        ['ko', /\b(ko|kor|korean)\b/],
        ['zh', /\b(zh|chi|zho|chinese)\b/],
    ];
    const directTag = raw.match(/\b([a-z]{2})(?:[-_][a-z]{2})?\b/)?.[1];
    if (directTag && languageMap.some(([tag]) => tag === directTag)) return directTag;
    const found = languageMap.find(([, re]) => re.test(text));
    return found?.[0] || (index === 0 ? 'en' : 'und');
}

function normalizeSubtitleToVtt(data, { pts = 0, includeTimestampMap = false } = {}) {
    let text = String(data || '')
        .replace(/^\uFEFF/, '')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .trimStart();

    const startsAsVtt = /^WEBVTT(?:\s|$)/i.test(text);
    if (startsAsVtt) {
        text = text.replace(/^WEBVTT[^\n]*/i, 'WEBVTT');
    } else {
        text = text
            .replace(/^\d+\s*\n(?=\d{1,2}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*)/gm, '')
            .replace(/(\d{1,2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
        text = `WEBVTT\n\n${text}`;
    }

    text = text
        .replace(/\nX-TIMESTAMP-MAP=.*(?=\n)/gi, '')
        .replace(/(\d{1,2}:\d{2}:\d{2})\.(\d{1,2})(?!\d)/g, (_, t, ms) => `${t}.${ms.padEnd(3, '0')}`)
        .replace(/(\d{1,2}):(\d{2}:\d{2}\.\d{3})/g, (_, h, rest) => `${h.padStart(2, '0')}:${rest}`)
        .trimEnd();

    if (includeTimestampMap) {
        text = text.replace(
            /^WEBVTT/,
            `WEBVTT\nX-TIMESTAMP-MAP=MPEGTS:${pts},LOCAL:00:00:00.000`
        );
    }

    return `${text}\n`;
}

function buildHelloSubtitleVtt({ duration = 21600, pts = 0, mapMode = 'pts', start = 0, span = null } = {}) {
    const safeDuration = Math.max(1, Math.min(Math.ceil(duration), 12 * 60 * 60));
    const cueStart = Math.max(0, start);
    const cueEnd = Math.min(cueStart + (span || safeDuration), safeDuration);
    const lines = ['WEBVTT'];
    if (mapMode === 'pts') {
        lines.push(`X-TIMESTAMP-MAP=MPEGTS:${pts},LOCAL:00:00:00.000`);
    } else if (mapMode === 'zero') {
        lines.push('X-TIMESTAMP-MAP=MPEGTS:0,LOCAL:00:00:00.000');
    } else if (mapMode === 'localfirst') {
        lines.push(`X-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:${pts}`);
    }
    lines.push('');

    for (let cursor = cueStart; cursor < cueEnd; cursor += 5) {
        const end = Math.min(cursor + 4.5, cueEnd);
        lines.push(`${formatVttTime(cursor)} --> ${formatVttTime(end)}`);
        lines.push('HELLO!');
        lines.push('');
    }

    return lines.join('\n');
}

function parseHlsDurationInfo(playlistText) {
    const durations = [];
    for (const line of String(playlistText || '').split('\n')) {
        const match = line.trim().match(/^#EXTINF:([0-9.]+)/);
        if (match) durations.push(parseFloat(match[1]));
    }
    const total = durations.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
    const max = Math.max(...durations.filter(Number.isFinite), 0);
    return {
        duration: Math.max(1, Math.ceil(total || 21600)),
        targetDuration: Math.max(1, Math.ceil(max || total || 21600)),
    };
}

async function getHlsDurationInfo(manifestText, manifestUrl) {
    const lines = String(manifestText || '').split('\n');
    for (let i = 0; i < lines.length; i++) {
        const t = lines[i].trim();
        if (t.startsWith('#EXT-X-STREAM-INF')) {
            const next = lines[i + 1]?.trim();
            if (!next || next.startsWith('#')) continue;
            try {
                const variantUrl = absolutizeManifestUrl(manifestUrl, next);
                const variant = await axios.get(variantUrl, {
                    headers: { 'Referer': 'https://www.lookmovie2.to/', 'User-Agent': lookmovieHeaders['User-Agent'] },
                    responseType: 'text',
                    timeout: 8000,
                });
                return parseHlsDurationInfo(variant.data);
            } catch (e) {
                console.error(`[hls-duration] failed variant duration parse: ${e.message}`);
                return parseHlsDurationInfo('');
            }
        }
    }
    return parseHlsDurationInfo(manifestText);
}

// HLS proxy — manifests are rewritten, segments are piped (never buffered)
app.get('/proxy/hls', async (req, res) => {
    const raw = req.query.url;
    if (!raw) return res.status(400).send('Missing url');
    const url = decodeURIComponent(raw);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');

    const isManifest = url.includes('.m3u8');

    try {
        if (isManifest) {
            // Fetch manifest as text, rewrite segment lines/URI attributes, return immediately
            const upstream = await axios.get(url, {
                headers: { 'Referer': 'https://www.lookmovie2.to/', 'User-Agent': lookmovieHeaders['User-Agent'] },
                responseType: 'text',
                timeout: 15000,
            });
            const rewritten = rewriteHlsManifest(upstream.data, url);
            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
            return res.send(rewritten);
        }

        // Segment — pipe directly, never buffer in memory
        const upstream = await axios.get(url, {
            headers: {
                'Referer': 'https://www.lookmovie2.to/',
                'User-Agent': lookmovieHeaders['User-Agent'],
                ...(req.headers.range ? { 'Range': req.headers.range } : {}),
            },
            responseType: 'stream',
            timeout: 30000,
        });

        res.setHeader('Content-Type', upstream.headers['content-type'] || 'video/MP2T');
        if (upstream.headers['content-length']) res.setHeader('Content-Length', upstream.headers['content-length']);
        if (upstream.headers['content-range']) res.setHeader('Content-Range', upstream.headers['content-range']);
        res.status(upstream.status);
        upstream.data.pipe(res);
    } catch (e) {
        if (!res.headersSent) res.status(502).send(e.message);
    }
});

// Subtitle proxy — fetches SRT, converts to WebVTT, serves to browser/iOS AVPlayer
async function handleSubtitleProxy(req, res) {
    const raw = req.query.url;
    if (!raw) return res.status(400).send('Missing url');
    const url = decodeURIComponent(raw);
    const pts = parseInt(req.query.pts || '0', 10) || 0;

    console.log(`[sub] fetch: ${url}`);
    if (req.query.trace === '1') {
        console.log('[subtitle-trace]', JSON.stringify({
            at: new Date().toISOString(),
            event: 'subtitle-vtt-request',
            url,
            pts,
            hls: req.query.hls === '1',
            hello: req.query.hello === '1',
            map: req.query.map,
            range: req.headers.range || null,
            userAgent: req.headers['user-agent'] || null,
        }));
    }

    // Reject obviously malformed URLs (metadata entries that slipped through)
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        console.log(`[sub] rejected invalid url`);
        return res.status(400).send('WEBVTT\n\nNOTE invalid subtitle url');
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'text/vtt');

    if (req.query.hello === '1') {
        const duration = parseFloat(req.query.duration || '0') || 21600;
        const mapMode = req.query.map || (req.query.hls === '1' ? 'pts' : 'none');
        const vtt = buildHelloSubtitleVtt({ duration, pts, mapMode });
        console.log(`[sub] HELLO test vtt map=${mapMode} pts=${pts} duration=${duration}`);
        return res.send(vtt);
    }

    try {
        const resp = await axios.get(url, {
            headers: {
                ...lookmovieHeaders,
                'Accept': 'text/vtt, text/plain, */*',
            },
            responseType: 'text',
            timeout: 15000,
        });
        const data = resp.data;
        console.log(`[sub] upstream status=${resp.status} content-type=${resp.headers['content-type']} bytes=${data.length} preview=${JSON.stringify(data.slice(0, 80))}`);

        const includeTimestampMap = req.query.hls === '1';
        const vtt = normalizeSubtitleToVtt(data, { pts, includeTimestampMap });
        console.log(`[sub] normalized vtt hls=${includeTimestampMap} pts=${pts}`);

        console.log(`[sub] sending ${vtt.length} bytes, first line: ${JSON.stringify(vtt.slice(0, 120))}`);
        res.send(vtt);
    } catch (e) {
        const status = e.response?.status || 'no-response';
        const msg = e.message || 'unknown error';
        console.error(`[sub] FAILED status=${status} msg=${msg} url=${url}`);
        res.status(502).send(`WEBVTT\n\nNOTE subtitle fetch failed: ${status} ${msg}`);
    }
}

app.get('/proxy/subtitle', handleSubtitleProxy);
app.get('/proxy/subtitle.vtt', handleSubtitleProxy);

// Detects the first video frame PTS from an HLS master manifest's first segment.
// Returns the PTS value (90kHz clock units), or 0 on failure.
async function detectFirstVideoPTS(masterManifestText, masterUrl) {
    try {
        const masterLines = masterManifestText.split('\n');
        let playlistUrl = null;
        let playlistText = masterManifestText;
        for (let i = 0; i < masterLines.length; i++) {
            const t = masterLines[i].trim();
            if (t.startsWith('#EXT-X-STREAM-INF')) {
                const next = masterLines[i + 1]?.trim();
                if (next && !next.startsWith('#')) {
                    playlistUrl = absolutizeManifestUrl(masterUrl, next);
                    break;
                }
            }
        }
        if (playlistUrl) {
            const varResp = await axios.get(playlistUrl, {
                headers: { 'Referer': 'https://www.lookmovie2.to/', 'User-Agent': lookmovieHeaders['User-Agent'] },
                responseType: 'text', timeout: 8000,
            });
            playlistText = varResp.data;
        } else {
            playlistUrl = masterUrl;
            console.log('[pts-detect] no variants; treating input as media playlist');
        }

        let segmentUrl = null;
        for (const line of playlistText.split('\n')) {
            const t = line.trim();
            if (t && !t.startsWith('#')) {
                segmentUrl = absolutizeManifestUrl(playlistUrl, t);
                break;
            }
        }
        if (!segmentUrl) { console.log('[pts-detect] no segment URL found'); return 0; }

        console.log(`[pts-detect] fetching first segment: ${segmentUrl}`);
        const segResp = await axios.get(segmentUrl, {
            headers: { ...lookmovieHeaders, 'Range': 'bytes=0-32767' },
            responseType: 'arraybuffer', timeout: 8000,
        });
        const buf = Buffer.from(segResp.data);
        let offset = 0;
        while (offset + 188 <= buf.length) {
            if (buf[offset] !== 0x47) { offset++; continue; }
            const payloadUnitStart = (buf[offset + 1] & 0x40) !== 0;
            const adaptFieldCtrl = (buf[offset + 3] >> 4) & 0x3;
            let payloadOff = 4;
            if (adaptFieldCtrl === 2 || adaptFieldCtrl === 3) payloadOff += 1 + buf[offset + 4];
            if (payloadUnitStart && (adaptFieldCtrl & 1)) {
                const p = offset + payloadOff;
                if (p + 14 < buf.length && buf[p] === 0x00 && buf[p+1] === 0x00 && buf[p+2] === 0x01) {
                    const streamId = buf[p + 3];
                    if ((streamId & 0xF0) === 0xE0) {
                        const ptsDtsFlags = (buf[p + 7] >> 6) & 0x3;
                        if (ptsDtsFlags & 0x2) {
                            const pts =
                                ((buf[p+9]  & 0x0E) >> 1) * 1073741824 +
                                buf[p+10]              * 4194304 +
                                ((buf[p+11] & 0xFE) >> 1) * 32768 +
                                buf[p+12]              * 128 +
                                ((buf[p+13] & 0xFE) >> 1);
                            console.log(`[pts-detect] first video PTS = ${pts} (${(pts/90000).toFixed(3)}s)`);
                            return pts;
                        }
                    }
                }
            }
            offset += 188;
        }
        console.log('[pts-detect] no video PTS found in first 32KB');
        return 0;
    } catch (e) {
        console.error(`[pts-detect] failed: ${e.message}`);
        return 0;
    }
}

// Returns a minimal HLS media playlist for a single subtitle file.
// iOS AVPlayer can reference this from #EXT-X-MEDIA in the master manifest.
function handleSubtitlePlaylist(req, res) {
    const raw = req.query.url;
    if (!raw) return res.status(400).send('Missing url');
    const url = decodeURIComponent(raw);
    const pts = req.query.pts || '0';
    const duration = Math.max(1, Math.ceil(parseFloat(req.query.duration || '0') || 21600));
    console.log(`[sub-playlist] serving playlist for: ${url} pts=${pts} duration=${duration}`);
    if (req.query.trace === '1') {
        console.log('[subtitle-trace]', JSON.stringify({
            at: new Date().toISOString(),
            event: 'subtitle-playlist-request',
            url,
            pts,
            duration,
            hello: req.query.hello === '1',
            map: req.query.map,
            userAgent: req.headers['user-agent'] || null,
        }));
    }
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    const forceHello = req.query.hello === '1';
    if (forceHello) {
        const mapMode = req.query.map || 'pts';
        const segmentDuration = 5;
        const playlist = [
            '#EXTM3U',
            '#EXT-X-VERSION:3',
            `#EXT-X-TARGETDURATION:${segmentDuration}`,
            '#EXT-X-PLAYLIST-TYPE:VOD',
            '#EXT-X-MEDIA-SEQUENCE:0',
        ];
        for (let start = 0; start < duration; start += segmentDuration) {
            const segmentLength = Math.min(segmentDuration, duration - start);
            playlist.push(`#EXTINF:${segmentLength.toFixed(3)},`);
            playlist.push(`https://goldenhind.tech/proxy/subtitle-hello.vtt?start=${start}&duration=${duration}&span=${segmentLength}&pts=${pts}&map=${mapMode}${req.query.trace === '1' ? '&trace=1' : ''}`);
        }
        playlist.push('#EXT-X-ENDLIST');
        const output = playlist.join('\n');
        console.log(`[sub-playlist] sending segmented HELLO map=${mapMode}, segments=${Math.ceil(duration / segmentDuration)}`);
        return res.send(output);
    }

    const proxied = `https://goldenhind.tech/proxy/subtitle.vtt?url=${encodeURIComponent(url)}&pts=${pts}&duration=${duration}&hls=1${req.query.trace === '1' ? '&trace=1' : ''}`;
    const playlist = [
        '#EXTM3U',
        '#EXT-X-VERSION:3',
        `#EXT-X-TARGETDURATION:${duration}`,
        '#EXT-X-PLAYLIST-TYPE:VOD',
        '#EXT-X-MEDIA-SEQUENCE:0',
        `#EXTINF:${duration.toFixed(3)},`,
        proxied,
        '#EXT-X-ENDLIST',
    ].join('\n');
    console.log(`[sub-playlist] sending:\n${playlist}`);
    res.send(playlist);
}

app.get('/proxy/subtitle-playlist', handleSubtitlePlaylist);
app.get('/proxy/subtitle-playlist.m3u8', handleSubtitlePlaylist);

function formatVttTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

function handleSubtitleHelloVtt(req, res) {
    const duration = parseFloat(req.query.duration || '0') || 21600;
    const start = parseFloat(req.query.start || '0') || 0;
    const span = parseFloat(req.query.span || '5') || 5;
    const pts = parseInt(req.query.pts || '0', 10) || 0;
    const mapMode = req.query.map || 'pts';
    const vtt = buildHelloSubtitleVtt({ duration, pts, mapMode, start, span });
    if (req.query.trace === '1') {
        console.log('[subtitle-trace]', JSON.stringify({
            at: new Date().toISOString(),
            event: 'subtitle-hello-vtt-request',
            start,
            span,
            duration,
            pts,
            map: mapMode,
            range: req.headers.range || null,
            userAgent: req.headers['user-agent'] || null,
        }));
    }
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'text/vtt');
    res.send(vtt);
}

app.get('/proxy/subtitle-hello.vtt', handleSubtitleHelloVtt);

function handleSubtitleDebugPlaylist(req, res) {
    const duration = Math.max(60, Math.ceil(parseFloat(req.query.duration || '0') || 600));
    const pts = req.query.pts || '0';
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.send([
        '#EXTM3U',
        '#EXT-X-VERSION:3',
        `#EXT-X-TARGETDURATION:${duration}`,
        '#EXT-X-PLAYLIST-TYPE:VOD',
        '#EXT-X-MEDIA-SEQUENCE:0',
        `#EXTINF:${duration.toFixed(3)},`,
        `https://goldenhind.tech/proxy/subtitle-debug.vtt?duration=${duration}&pts=${pts}`,
        '#EXT-X-ENDLIST',
    ].join('\n'));
}

function handleSubtitleDebugVtt(req, res) {
    const duration = Math.max(60, Math.ceil(parseFloat(req.query.duration || '0') || 600));
    const pts = parseInt(req.query.pts || '0', 10) || 0;
    const cues = ['WEBVTT', `X-TIMESTAMP-MAP=MPEGTS:${pts},LOCAL:00:00:00.000`, ''];
    for (let start = 0; start < Math.min(duration, 900); start += 10) {
        cues.push(`${formatVttTime(start)} --> ${formatVttTime(start + 8)}`);
        cues.push('Golden Hind subtitle test');
        cues.push('');
    }
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'text/vtt');
    res.send(cues.join('\n'));
}

app.get('/proxy/subtitle-debug-playlist.m3u8', handleSubtitleDebugPlaylist);
app.get('/proxy/subtitle-debug.vtt', handleSubtitleDebugVtt);

// Master HLS manifest rewriter that injects subtitle tracks.
// Used by iOS Safari so AVPlayer sees subtitles in native fullscreen.
app.get('/proxy/hls-with-subs', async (req, res) => {
    const raw = req.query.url;
    const rawSubs = req.query.subs;
    if (!raw) return res.status(400).send('Missing url');
    const url = decodeURIComponent(raw);
    const includeDebugSub = req.query.debug === '1';
    const includeHelloSub = req.query.hello === '1';
    const includeTrace = req.query.trace === '1';
    let subs = [];
    try { subs = JSON.parse(rawSubs || '[]'); } catch (e) {
        console.error(`[hls-with-subs] failed to parse subs JSON: ${e.message} — raw: ${rawSubs?.slice(0, 200)}`);
    }

    console.log(`[hls-with-subs] url=${url} subs_count=${subs.length}`);
    subs.forEach((s, i) => console.log(`[hls-with-subs]   sub[${i}]: file=${s.file} url=${s.url} lang=${s.language || s.lang}`));

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');

    try {
        const upstream = await axios.get(url, {
            headers: { 'Referer': 'https://www.lookmovie2.to/', 'User-Agent': lookmovieHeaders['User-Agent'] },
            responseType: 'text',
            timeout: 15000,
        });
        console.log(`[hls-with-subs] upstream status=${upstream.status} bytes=${upstream.data.length}`);

        // Detect the first video frame PTS so subtitle X-TIMESTAMP-MAP is accurate
        const videoPts = await detectFirstVideoPTS(upstream.data, url);
        console.log(`[hls-with-subs] detected videoPts=${videoPts}`);
        const durationInfo = await getHlsDurationInfo(upstream.data, url);
        console.log(`[hls-with-subs] duration=${durationInfo.duration}s target=${durationInfo.targetDuration}s`);

        // Build #EXT-X-MEDIA lines for each subtitle track
        const subMediaLines = subs
            .filter(sub => { const u = String(sub.file || sub.url || ''); return u.startsWith('/') || u.startsWith('http'); })
            .map((sub, i) => {
                const rawSub = String(sub.file || sub.url || '');
                const absSubUrl = rawSub.startsWith('http') ? rawSub : `https://www.lookmovie2.to${rawSub}`;
                const playlistUri = `https://goldenhind.tech/proxy/subtitle-playlist.m3u8?url=${encodeURIComponent(absSubUrl)}&pts=${videoPts}&duration=${durationInfo.duration}${includeHelloSub ? '&hello=1' : ''}${includeTrace ? '&trace=1' : ''}`;
                const name = (sub.language || sub.lang || `Track ${i + 1}`).replace(/"/g, "'");
                const language = hlsLanguageCode(sub, i);
                const line = `#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="${name}",DEFAULT=${i === 0 && !includeDebugSub && !includeHelloSub ? 'YES' : 'NO'},AUTOSELECT=YES,FORCED=NO,URI="${playlistUri}",LANGUAGE="${language}"`;
                console.log(`[hls-with-subs]   injecting: ${line}`);
                return line;
            });

        if (includeHelloSub) {
            subMediaLines.unshift(
                `#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="HELLO PTS Map",DEFAULT=YES,AUTOSELECT=YES,FORCED=NO,URI="https://goldenhind.tech/proxy/subtitle-playlist.m3u8?url=${encodeURIComponent('https://goldenhind.tech/hello.vtt')}&pts=${videoPts}&duration=${durationInfo.duration}&hello=1&map=pts${includeTrace ? '&trace=1' : ''}",LANGUAGE="en"`,
                `#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="HELLO Zero Map",DEFAULT=NO,AUTOSELECT=YES,FORCED=NO,URI="https://goldenhind.tech/proxy/subtitle-playlist.m3u8?url=${encodeURIComponent('https://goldenhind.tech/hello.vtt')}&pts=${videoPts}&duration=${durationInfo.duration}&hello=1&map=zero${includeTrace ? '&trace=1' : ''}",LANGUAGE="en"`,
                `#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="HELLO No Map",DEFAULT=NO,AUTOSELECT=YES,FORCED=NO,URI="https://goldenhind.tech/proxy/subtitle-playlist.m3u8?url=${encodeURIComponent('https://goldenhind.tech/hello.vtt')}&pts=${videoPts}&duration=${durationInfo.duration}&hello=1&map=none${includeTrace ? '&trace=1' : ''}",LANGUAGE="en"`,
                `#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="HELLO Local First",DEFAULT=NO,AUTOSELECT=YES,FORCED=NO,URI="https://goldenhind.tech/proxy/subtitle-playlist.m3u8?url=${encodeURIComponent('https://goldenhind.tech/hello.vtt')}&pts=${videoPts}&duration=${durationInfo.duration}&hello=1&map=localfirst${includeTrace ? '&trace=1' : ''}",LANGUAGE="en"`
            );
        }

        if (includeDebugSub) {
            subMediaLines.unshift(
                `#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Subtitle Test",DEFAULT=YES,AUTOSELECT=YES,FORCED=NO,URI="https://goldenhind.tech/proxy/subtitle-debug-playlist.m3u8?duration=${durationInfo.duration}&pts=${videoPts}",LANGUAGE="en"`
            );
        }

        // Rewrite URLs and force variants to reference our injected subtitle group.
        const rewritten = rewriteHlsManifest(upstream.data, url, { subtitleGroupId: 'subs' }).split('\n');
        const streamInfCount = upstream.data.split('\n').filter(line => line.trim().startsWith('#EXT-X-STREAM-INF')).length;
        console.log(`[hls-with-subs] stream variants found=${streamInfCount} subtitle tracks injected=${subMediaLines.length}`);

        if (streamInfCount === 0 && subMediaLines.length > 0) {
            const output = buildSingleVariantMaster({
                originalUrl: url,
                rewrittenMediaUrl: proxiedHlsUrl(url),
                subMediaLines,
            });
            console.log(`[hls-with-subs] upstream is media playlist; wrapped in master:\n${output.slice(0, 600)}`);
            return res.send(output);
        }

        // Insert #EXT-X-MEDIA lines right after #EXTM3U
        const extm3uIdx = rewritten.findIndex(l => l.trim().startsWith('#EXTM3U'));
        rewritten.splice(extm3uIdx >= 0 ? extm3uIdx + 1 : 0, 0, ...subMediaLines);

        const output = rewritten.join('\n');
        console.log(`[hls-with-subs] final manifest (first 600 chars):\n${output.slice(0, 600)}`);
        res.send(output);
    } catch (e) {
        console.error(`[hls-with-subs] FAILED: ${e.message}`);
        if (!res.headersSent) res.status(502).send(e.message);
    }
});

app.post('/server/lookmovie', async (request, response) => {
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    const { user, token, id, season, episode } = request.body;
    if (!await Authenticate(user, token)) return response.status(202).send("UNV");

    const dbg = [];
    try {
        const mediaType = id.startsWith('t') ? 'tv' : 'movie';
        const tmdbId    = id.slice(1);

        const info   = await GetInfo(id);
        const title  = info.title || info.name;
        const year   = new Date(info.release_date || info.first_air_date || '2000').getFullYear();
        dbg.push(`Content: "${title}" (${year}), mediaType: ${mediaType}, tmdbId: ${tmdbId}`);

        const imdbId = await getIMDBId(tmdbId, mediaType);
        dbg.push(`IMDB ID: ${imdbId}`);
        if (!imdbId) throw new Error('No IMDB ID found for this title');

        const lmId = await getOrFetchLookmovieId(id, imdbId, mediaType, title, year, dbg);
        dbg.push(`LookMovie internal ID: ${lmId}`);

        let targetId = lmId;
        if (mediaType === 'tv') {
            targetId = await getLookmovieEpisodeId(lmId, season || 1, episode || 1, dbg);
        }

        const { streamUrl, subtitles } = await getLookmovieStreamUrl(targetId, mediaType, dbg);
        response.json({ success: true, url: streamUrl, subtitles, dbg });
    } catch (error) {
        logError(user, '/server/lookmovie', error).catch(() => {});
        dbg.push(`ERROR: ${error.message}`);
        response.status(200).json({ success: false, error: error.message, dbg });
    }
});

// ─────────────────────────────────────────────────────────────────────────────

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

async function getRecommendationsWithRetry(contentList, mode, maxRetries = 2) {
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
        try {
            return await getRecommendations(contentList, mode);
        } catch (e) {
            if (e?.response?.status === 503 && attempt <= maxRetries) {
                console.log(`[getRecommendations:${mode}] 503, retry ${attempt}/${maxRetries}…`);
                await new Promise(r => setTimeout(r, 1500 * attempt));
            } else {
                throw e;
            }
        }
    }
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

    console.log(`[getRecommendations:${mode}] HTTP ${resp.status} | finish:`, resp.data?.candidates?.[0]?.finishReason);
    const text = resp.data.candidates[0].content.parts[0].text.trim();
    console.log(`[getRecommendations:${mode}] raw text:`, text.slice(0, 300));
    const match = text.match(/\[[\s\S]*\]/);  // greedy — captures full array including nested brackets
    if (!match) throw new Error('No JSON array found in Gemini response');
    return JSON.parse(match[0]);
}

// Extract YouTube stream URL without downloading — browser fetches + converts client-side
app.post('/music/url', async (req, res) => {
    const { user, token, url } = req.body;
    if (!await Authenticate(user, token)) return res.status(401).json({ error: 'Unauthorized' });

    if (!url || !/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(url)) {
        return res.status(400).json({ error: 'Invalid YouTube URL' });
    }

    console.log(`[music/url] extracting: ${url}`);

    try {
        const videoId = url.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/)?.[1];
        if (!videoId) return res.status(400).json({ error: 'Could not extract video ID from URL' });

        // Primary: cobalt.tools — purpose-built downloader, handles YouTube bot detection
        const cobaltInstances = [
            process.env.COBALT_URL || 'http://localhost:9000',  // self-hosted (no auth)
            'https://cobalt.api.timelessnesses.me',
            'https://cobalt.synth.zip',
        ];
        for (const cobaltBase of cobaltInstances) {
            try {
                const cobalt = await axios.post(`${cobaltBase}/`,
                    { url: `https://www.youtube.com/watch?v=${videoId}`, downloadMode: 'audio', audioFormat: 'best' },
                    { headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }, timeout: 15000 }
                );
                const { status, url: streamUrl, filename } = cobalt.data;
                console.log(`[music/url] cobalt ${cobaltBase} response: status=${status} url=${!!streamUrl} filename=${filename}`);
                if ((status === 'tunnel' || status === 'redirect') && streamUrl) {
                    const title = (filename || videoId).replace(/\.(webm|mp4|m4a|opus)$/i, '').replace(/[/\\?%*:|"<>]/g, '-');
                    console.log(`[music/url] ok via cobalt ${cobaltBase}: "${title}"`);
                    return res.json({ streamUrl, title, ext: 'webm' });
                }
                throw new Error(`cobalt status=${status} data=${JSON.stringify(cobalt.data).slice(0, 200)}`);
            } catch (e) {
                console.error(`[music/url] cobalt ${cobaltBase} failed: ${e.response?.data ? JSON.stringify(e.response.data).slice(0, 200) : e.message.split('\n')[0]}`);
            }
        }

        // Fallback: dynamically fetch healthiest Invidious instances then try each
        try {
            const listResp = await axios.get('https://api.invidious.io/instances.json', { timeout: 6000 });
            const liveInstances = listResp.data
                .filter(([, d]) => d.type === 'https' && d.api === true && d.monitor?.statusCode === 200)
                .map(([name]) => `https://${name}`)
                .slice(0, 5);

            for (const instance of liveInstances) {
                try {
                    const resp = await axios.get(`${instance}/api/v1/videos/${videoId}`, {
                        timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' },
                    });
                    const audioFormats = (resp.data.adaptiveFormats || [])
                        .filter(f => f.type?.startsWith('audio/'))
                        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
                    if (!audioFormats.length) throw new Error('No audio formats');
                    const best = audioFormats[0];
                    const ext = best.type?.includes('mp4') ? 'm4a' : 'webm';
                    const title = (resp.data.title || videoId).replace(/[/\\?%*:|"<>]/g, '-');
                    console.log(`[music/url] ok via invidious ${instance}: "${title}"`);
                    return res.json({ streamUrl: best.url, title, ext });
                } catch (e) {
                    console.error(`[music/url] ${instance} failed: ${e.message.split('\n')[0]}`);
                }
            }
        } catch (e) {
            console.error(`[music/url] invidious fallback failed: ${e.message.split('\n')[0]}`);
        }

        throw new Error('All stream sources exhausted');
    } catch (e) {
        console.error('[music/url] all attempts failed:', e.message.split('\n')[0]);
        res.status(500).json({ error: 'Failed to extract stream URL. Try again in a moment.' });
    }
});

// Download a YouTube video's audio as MP3 via yt-dlp
app.post('/music/download', async (req, res) => {
    const { user, token, url } = req.body;
    if (!await Authenticate(user, token)) return res.status(401).json({ error: 'Unauthorized' });

    if (!url || !/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(url)) {
        return res.status(400).json({ error: 'Invalid YouTube URL' });
    }

    const tempDir = path.join(os.tmpdir(), `music-${crypto.randomUUID()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    console.log(`[music] download start: ${url} → ${tempDir}`);

    try {
        const cookiesPath = path.join(process.cwd(), 'youtube-cookies.txt');
        const hasCookies = fs.existsSync(cookiesPath);
        console.log(`[music] cookies file: ${hasCookies ? cookiesPath : 'not found'}`);

        await ytDlpExec(url, {
            'extract-audio': true,
            'audio-format': 'mp3',
            'audio-quality': '0',
            'output': path.join(tempDir, '%(title)s.%(ext)s'),
            'no-playlist': true,
            'format': 'bestaudio/best',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'referer': 'https://www.youtube.com/',
            'extractor-args': 'youtube:player_client=android_vr,web',
            'no-check-certificate': true,
            'prefer-free-formats': true,
            ...(hasCookies ? { 'cookies': cookiesPath } : {}),
        });

        const files = fs.readdirSync(tempDir).filter(f => f.endsWith('.mp3'));
        if (files.length === 0) {
            fs.rmSync(tempDir, { recursive: true, force: true });
            return res.status(500).json({ error: 'Download completed but MP3 not found' });
        }

        const filePath = path.join(tempDir, files[0]);
        const safeFileName = files[0].replace(/[^\w\s.\-()]/g, '_');
        console.log(`[music] serving: ${safeFileName} (${fs.statSync(filePath).size} bytes)`);

        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(safeFileName)}`);

        const stream = fs.createReadStream(filePath);
        stream.pipe(res);
        const cleanup = () => fs.rmSync(tempDir, { recursive: true, force: true });
        res.on('finish', cleanup);
        res.on('close', cleanup);
        stream.on('error', (e) => {
            console.error('[music] stream error:', e.message);
            cleanup();
            if (!res.headersSent) res.status(500).json({ error: 'Stream error' });
        });
    } catch (e) {
        fs.rmSync(tempDir, { recursive: true, force: true });
        console.error('[music] yt-dlp failed:', e.message);

        let errorMsg = 'Download failed';
        if (e.message.includes('403') || e.message.includes('Forbidden')) {
            errorMsg = 'YouTube blocked the download. Try a different video.';
        } else if (e.message.includes('404') || e.message.includes('Not Found')) {
            errorMsg = 'Video not found. It may be private or deleted.';
        } else if (e.message.includes('age')) {
            errorMsg = 'Age-restricted content cannot be downloaded.';
        } else if (e.message.includes('copyright')) {
            errorMsg = 'This video is copyright-protected and cannot be downloaded.';
        } else if (e.message.includes('Sign in') || e.message.includes('login')) {
            errorMsg = 'This video requires login. Try a different video.';
        } else {
            errorMsg = `Download failed: ${e.message.split('\n')[0]}`;
        }

        res.status(500).json({ error: errorMsg });
    }
});
