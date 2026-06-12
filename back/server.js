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
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);

// Pure helpers extracted for unit testing (see back/lib + back/test).
import { slugify, rewriteHlsManifest, hlsLanguageCode } from './lib/hls.js';
import { normalizeToVtt } from './lib/subtitles.js';
import { generateToken as GenerateToken, generatePartyCode } from './lib/codes.js';
import { detectShowChanges, collectShowFollowers } from './lib/notifications.js';

//https://dashboard.render.com/web/srv-crcllkqj1k6c73coiv10/events
//https://console.firebase.google.com/u/0/project/the-golden-hind/database/the-golden-hind-default-rtdb/data/~2F


const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true}));



app.use(cors({
  origin: [
    "https://the-golden-hind.web.app",
    "http://localhost:5173",
    "https://ghind.tech",
    "http://ghind.tech",
    "https://goldenhind.tech",
    "http://goldenhind.tech",
    "https://www.goldenhind.tech",
    "http://www.goldenhind.tech",
  ],
  credentials: true,
  exposedHeaders: ['X-Title'],
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
        const [favourites, continues, watchlist] = await Promise.all([
            db.ref(`users/${user}/favourites`).once('value'),
            db.ref(`users/${user}/continues`).once('value'),
            db.ref(`users/${user}/watchlist`).once('value'),
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
            watchlist: watchlist.val() || '[]',
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

    if (await Authenticate(user, token)) {
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

    if (await Authenticate(user, token)) {
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

    if (await Authenticate(user, token)) {
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

    if (await Authenticate(user, token)) {
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
    if (await Authenticate(user, token)) {
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
    if (await Authenticate(user, token)) {
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

// Person details + filmography for /person/:id route
const personCache = new Map();
app.post('/person', async (request, response) => {
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    const { user, token, personId } = request.body;
    if (!await Authenticate(user, token)) return response.status(202).send("UNV");
    try {
        if (personCache.has(personId)) return response.status(200).json(personCache.get(personId));
        const url = `https://api.themoviedb.org/3/person/${personId}?api_key=${process.env.TMDB_Credentials}&append_to_response=combined_credits,external_ids`;
        const apiResponse = await axios.get(url);
        personCache.set(personId, apiResponse.data);
        response.status(200).json(apiResponse.data);
    } catch (error) {
        logError(user, '/person', error).catch(() => {});
        response.status(202).send("UKE");
    }
});

// Collection details for /collection/:id route
const collectionCache = new Map();
app.post('/collection', async (request, response) => {
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    const { user, token, collectionId } = request.body;
    if (!await Authenticate(user, token)) return response.status(202).send("UNV");
    try {
        if (collectionCache.has(collectionId)) return response.status(200).json(collectionCache.get(collectionId));
        const url = `https://api.themoviedb.org/3/collection/${collectionId}?api_key=${process.env.TMDB_Credentials}`;
        const apiResponse = await axios.get(url);
        collectionCache.set(collectionId, apiResponse.data);
        response.status(200).json(apiResponse.data);
    } catch (error) {
        logError(user, '/collection', error).catch(() => {});
        response.status(202).send("UKE");
    }
});

app.post('/favourite', async (request, response) => {

    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    const {user, token, favId} = request.body
    const db = admin.database();

    if (await Authenticate(user, token)) {
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
    if (await Authenticate(user, token)) {
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

app.post('/mylist/add', async (request, response) => {
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    const {user, token, itemId} = request.body;
    const db = admin.database();

    if (await Authenticate(user, token)) {
        const snapshot = await db.ref(`users/${user}/watchlist`).once('value');
        const raw = snapshot.val();
        if (!raw || raw === "nil") {
            db.ref(`users/${user}`).update({ watchlist: JSON.stringify([itemId]) });
        } else {
            let watchlist = JSON.parse(raw);
            if (!watchlist.includes(itemId)) {
                watchlist.push(itemId);
                db.ref(`users/${user}`).update({ watchlist: JSON.stringify(watchlist) });
            }
        }
        response.status(200).send("Success");
    } else {
        response.status(202).send("UNV");
    }
});

app.post('/mylist/remove', async (request, response) => {
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    const {user, token, itemId} = request.body;
    const db = admin.database();

    if (await Authenticate(user, token)) {
        const snapshot = await db.ref(`users/${user}/watchlist`).once('value');
        const raw = snapshot.val();
        if (!raw || raw === "nil") {
            response.status(202).send("UFE");
            return;
        }
        let watchlist = JSON.parse(raw);
        watchlist = watchlist.filter(id => id !== itemId);
        db.ref(`users/${user}`).update({ watchlist: JSON.stringify(watchlist) });
        response.status(200).send("Success");
    } else {
        response.status(202).send("UNV");
    }
});

app.post('/home-mylist', async (request, response) => {
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    const { user, token } = request.body;
    const db = admin.database();

    if (await Authenticate(user, token)) {
        const snap = await db.ref(`users/${user}/watchlist`).once('value');
        const raw = snap.val();
        let watchlistArr = [];
        try { if (raw && raw !== "nil") watchlistArr = JSON.parse(raw); } catch {}
        const watchlistData = await Promise.all(watchlistArr.map(id => GetInfo(id)));
        response.status(200).json({
            watchlist: raw || '[]',
            watchlistData: watchlistData.filter(Boolean).reverse(),
        });
    } else {
        response.status(202).send("UDE");
    }
});

app.post('/continue', async (request, response) => {

    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    const {user, token, favId} = request.body
    const db = admin.database();

    if (await Authenticate(user, token)) {
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

    if (await Authenticate(user, token)) {
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

    if (await Authenticate(user, token)) {
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

    if (await Authenticate(user, token)) {
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

// ── Resume playback position (cross-device) ──────────────────────────────────
// Stored per "posKey": movies use the content id ("m123"); TV episodes use
// "t123_s1_e2" so each episode resumes independently. We also stash a
// series/movie-level percentage under positionsPct/{contentId} so the home
// Continue-Watching cards can render a progress bar without a per-episode key.
// RTDB keys can't contain . # $ [ ] / — the posKey format avoids all of them.

app.post('/position/update', async (request, response) => {
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    const { user, token, posKey, contentId, position, duration, pct } = request.body;
    if (!await Authenticate(user, token)) return response.status(202).send("UNV");
    if (!posKey) return response.status(400).send("posKey required");
    try {
        const db = admin.database();
        const pos = Number(position) || 0;
        const dur = Number(duration) || 0;
        await db.ref(`users/${user}/positions/${posKey}`).set({
            position: pos,
            duration: dur,
            updatedAt: Date.now(),
        });
        // Series/movie-level percentage for Continue-Watching progress bars.
        if (contentId) {
            const ratio = Number(pct);
            const clamped = isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : (dur > 0 ? Math.min(1, pos / dur) : 0);
            await db.ref(`users/${user}/positionsPct/${contentId}`).set(+clamped.toFixed(4));
        }
        response.status(200).send("OK");
    } catch (error) {
        logError(user, '/position/update', error).catch(() => {});
        response.status(500).send(error.message);
    }
});

app.post('/position/retrieve', async (request, response) => {
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    const { user, token, posKey } = request.body;
    if (!await Authenticate(user, token)) return response.status(202).send("UNV");
    if (!posKey) return response.status(400).send("posKey required");
    try {
        const db = admin.database();
        const snap = await db.ref(`users/${user}/positions/${posKey}`).once('value');
        if (!snap.exists()) return response.status(404).send("VNF");
        const v = snap.val();
        response.status(200).json({ position: v.position || 0, duration: v.duration || 0, updatedAt: v.updatedAt || 0 });
    } catch (error) {
        logError(user, '/position/retrieve', error).catch(() => {});
        response.status(500).send(error.message);
    }
});

// Batch percentage map for the home Continue-Watching bars (cross-device).
app.post('/position/percentages', async (request, response) => {
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    const { user, token } = request.body;
    if (!await Authenticate(user, token)) return response.status(202).send("UNV");
    try {
        const db = admin.database();
        const snap = await db.ref(`users/${user}/positionsPct`).once('value');
        response.status(200).json(snap.val() || {});
    } catch (error) {
        logError(user, '/position/percentages', error).catch(() => {});
        response.status(200).json({});
    }
});

// ── New-episode / new-season notifications ───────────────────────────────────
// A daily job compares each followed TV show (from users' watchlists +
// favourites) against TMDB and drops a notification into users/{user}/
// notifications when a new episode or season appears. Detection logic lives in
// lib/notifications.js (pure + unit tested); this wires it to TMDB + Firebase.

async function fetchShowStatus(tvId) {
    try {
        const url = `https://api.themoviedb.org/3/tv/${tvId}?api_key=${process.env.TMDB_Credentials}`;
        const r = await axios.get(url);
        const d = r.data;
        return {
            name: d.name || d.title,
            number_of_seasons: d.number_of_seasons,
            number_of_episodes: d.number_of_episodes,
            last_episode_to_air: d.last_episode_to_air,
            poster_path: d.poster_path,
        };
    } catch {
        return null;
    }
}

let lastNewEpisodeCheck = 0;
async function checkNewEpisodes() {
    const db = admin.database();
    const usersSnap = await db.ref('users').once('value');
    const followers = collectShowFollowers(usersSnap.val() || {});
    let notified = 0;

    for (const [contentId, fans] of followers) {
        try {
            const show = await fetchShowStatus(contentId.slice(1));
            if (!show) continue;
            const prevSnap = await db.ref(`showTracking/${contentId}`).once('value');
            const prev = prevSnap.exists() ? prevSnap.val() : null;
            const { snapshot, notifications } = detectShowChanges(prev, show);
            await db.ref(`showTracking/${contentId}`).set(snapshot);

            for (const note of notifications) {
                for (const username of fans) {
                    await db.ref(`users/${username}/notifications`).push({
                        ...note,
                        contentId,
                        title: show.name || 'A show you follow',
                        poster_path: show.poster_path || null,
                        ts: Date.now(),
                        seen: false,
                    });
                    notified++;
                }
            }
        } catch (e) {
            logError('system', 'checkNewEpisodes', e).catch(() => {});
        }
    }
    lastNewEpisodeCheck = Date.now();
    console.log(`[checkNewEpisodes] ${followers.size} shows checked, ${notified} notifications sent`);
    return { shows: followers.size, notified };
}

// Run daily, and once ~1 min after boot (first run only records baselines).
setInterval(() => { checkNewEpisodes().catch(() => {}); }, 24 * 60 * 60 * 1000);
setTimeout(() => { checkNewEpisodes().catch(() => {}); }, 60 * 1000);

// Manual / external-cron trigger (admin only).
app.post('/admin/check-new-episodes', async (request, response) => {
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    const { user, token } = request.body;
    if (!await AuthenticateAdmin(user, token)) return response.status(403).send("Forbidden");
    try {
        const result = await checkNewEpisodes();
        response.status(200).json({ ok: true, ...result, lastNewEpisodeCheck });
    } catch (error) {
        logError(user, '/admin/check-new-episodes', error).catch(() => {});
        response.status(500).json({ error: error.message });
    }
});

app.post('/notifications', async (request, response) => {
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    const { user, token } = request.body;
    if (!await Authenticate(user, token)) return response.status(202).send("UNV");
    try {
        const db = admin.database();
        const snap = await db.ref(`users/${user}/notifications`).orderByChild('ts').limitToLast(50).once('value');
        const val = snap.val() || {};
        const notifications = Object.entries(val)
            .map(([id, n]) => ({ id, ...n }))
            .sort((a, b) => (b.ts || 0) - (a.ts || 0));
        const unread = notifications.filter(n => !n.seen).length;
        response.status(200).json({ notifications, unread });
    } catch (error) {
        logError(user, '/notifications', error).catch(() => {});
        response.status(200).json({ notifications: [], unread: 0 });
    }
});

app.post('/notifications/seen', async (request, response) => {
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    const { user, token, ids } = request.body;
    if (!await Authenticate(user, token)) return response.status(202).send("UNV");
    try {
        const db = admin.database();
        if (Array.isArray(ids) && ids.length) {
            const updates = {};
            for (const id of ids) updates[`${id}/seen`] = true;
            await db.ref(`users/${user}/notifications`).update(updates);
        } else {
            // Mark all as seen.
            const snap = await db.ref(`users/${user}/notifications`).once('value');
            const val = snap.val() || {};
            const updates = {};
            for (const id of Object.keys(val)) updates[`${id}/seen`] = true;
            if (Object.keys(updates).length) await db.ref(`users/${user}/notifications`).update(updates);
        }
        response.status(200).send("OK");
    } catch (error) {
        logError(user, '/notifications/seen', error).catch(() => {});
        response.status(500).send(error.message);
    }
});



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

// ── Intro / welcome video ────────────────────────────────────────────────────
// A global config (config/introVideo = { enabled, version }) gates the popup;
// each user stores the version they last watched (users/{u}/introSeenVersion).
// Show when enabled AND the user hasn't seen the current version. Admin can
// disable it or bump the version to re-show it to everyone.

async function getIntroConfig() {
    const db = admin.database();
    const snap = await db.ref('config/introVideo').once('value');
    const cfg = snap.val() || {};
    return { enabled: cfg.enabled !== false, version: cfg.version || 1 };
}

app.post('/intro/status', async (request, response) => {
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    const { user, token } = request.body;
    if (!await Authenticate(user, token)) return response.status(202).send("UNV");
    try {
        const db = admin.database();
        const { enabled, version } = await getIntroConfig();
        const seenSnap = await db.ref(`users/${user}/introSeenVersion`).once('value');
        const seenVersion = seenSnap.val() || 0;
        response.status(200).json({ show: enabled && seenVersion < version, version });
    } catch (error) {
        logError(user, '/intro/status', error).catch(() => {});
        response.status(200).json({ show: false, version: 1 });
    }
});

app.post('/intro/seen', async (request, response) => {
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    const { user, token, version } = request.body;
    if (!await Authenticate(user, token)) return response.status(202).send("UNV");
    try {
        const db = admin.database();
        const v = parseInt(version) || (await getIntroConfig()).version;
        await db.ref(`users/${user}`).update({ introSeenVersion: v });
        response.status(200).send("OK");
    } catch (error) {
        logError(user, '/intro/seen', error).catch(() => {});
        response.status(500).send(error.message);
    }
});

app.post('/admin/intro/set', async (request, response) => {
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    const { user, token, enabled, bumpVersion } = request.body;
    if (!await AuthenticateAdmin(user, token)) return response.status(403).send("Forbidden");
    try {
        const db = admin.database();
        const cfg = await getIntroConfig();
        const next = {
            enabled: typeof enabled === 'boolean' ? enabled : cfg.enabled,
            version: bumpVersion ? cfg.version + 1 : cfg.version,
        };
        await db.ref('config/introVideo').set(next);
        response.status(200).json(next);
    } catch (error) {
        logError(user, '/admin/intro/set', error).catch(() => {});
        response.status(500).json({ error: error.message });
    }
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
        const usersVal = usersSnap.val() || {};
        const users = Object.keys(usersVal);
        // Per-user total watch time (seconds) summed from watch_sessions, plus a
        // grand total — computed from the users node we already loaded.
        const watchTotals = {};
        let watchTotalAll = 0;
        for (const [uname, u] of Object.entries(usersVal)) {
            const sessions = u.watch_sessions ? Object.values(u.watch_sessions) : [];
            const secs = sessions.reduce((sum, s) => sum + (s.duration || 0), 0);
            watchTotals[uname] = secs;
            watchTotalAll += secs;
        }
        // How many users have seen the current intro-video version.
        const introCfgSnap = await db.ref('config/introVideo').once('value');
        const introConfig = introCfgSnap.val() || { enabled: true, version: 1 };
        const introSeenCount = Object.values(usersVal)
            .filter(u => (u.introSeenVersion || 0) >= (introConfig.version || 1)).length;
        response.status(200).json({ errors, analytics, users, watchTotals, watchTotalAll, introConfig, introSeenCount });
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

// ── Watch parties ───────────────────────────────────────────────────────────
// Each party is a Firebase RTDB node at /parties/{roomId} holding the shared
// playback state. Clients send state changes via POST and receive updates via
// SSE: the server holds open a `value` listener on the room and pushes every
// change to subscribed clients (except echoing the change back to its actor).


app.post('/party/create', async (request, response) => {
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    const { user, token, contentId, season, episode } = request.body;
    if (!await Authenticate(user, token)) return response.status(202).send("UNV");
    try {
        const db = admin.database();
        // Retry a couple of times in case of a (very rare) code collision
        let roomId;
        for (let i = 0; i < 5; i++) {
            roomId = generatePartyCode();
            const existing = await db.ref(`parties/${roomId}`).once('value');
            if (!existing.exists()) break;
        }
        await db.ref(`parties/${roomId}`).set({
            host: user,
            contentId: contentId || '',
            season: parseInt(season) || 1,
            episode: parseInt(episode) || 1,
            position: 0,
            paused: true,
            actor: user,
            lastUpdate: Date.now(),
        });
        // Auto-cleanup after 6 hours of room creation
        setTimeout(() => db.ref(`parties/${roomId}`).remove().catch(() => {}), 6 * 60 * 60 * 1000);
        response.status(200).json({ roomId });
    } catch (error) {
        logError(user, '/party/create', error).catch(() => {});
        response.status(500).json({ error: error.message });
    }
});

app.post('/party/update', async (request, response) => {
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    const { user, token, roomId, state, clientId } = request.body;
    if (!await Authenticate(user, token)) return response.status(202).send("UNV");
    if (!roomId || !state || typeof state !== 'object') return response.status(400).json({ error: 'roomId + state required' });
    try {
        const db = admin.database();
        // Only allow whitelisted keys — never let clients write actor/host/lastUpdate directly
        const allowed = ['position', 'paused', 'season', 'episode', 'contentId'];
        // The actor is the unique-per-tab clientId when the client sends one
        // (so the SSE echo filter works even with two tabs under one login).
        // Falls back to the username if the client is on an old build.
        const patch = { actor: clientId || user, lastUpdate: Date.now() };
        for (const k of allowed) if (k in state) patch[k] = state[k];
        await db.ref(`parties/${roomId}`).update(patch);
        response.status(200).json({ ok: true });
    } catch (error) {
        logError(user, '/party/update', error).catch(() => {});
        response.status(500).json({ error: error.message });
    }
});

app.post('/party/info', async (request, response) => {
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    const { user, token, roomId } = request.body;
    if (!await Authenticate(user, token)) return response.status(202).send("UNV");
    try {
        const db = admin.database();
        const snap = await db.ref(`parties/${roomId}`).once('value');
        if (!snap.exists()) return response.status(404).json({ error: 'Room not found' });
        response.status(200).json(snap.val());
    } catch (error) {
        logError(user, '/party/info', error).catch(() => {});
        response.status(500).json({ error: error.message });
    }
});

// Post a chat message into the room. Messages live at parties/{roomId}/chat
// and are streamed to every peer via the dedicated `chat` SSE channel below.
app.post('/party/chat', async (request, response) => {
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    const { user, token, roomId, text } = request.body;
    if (!await Authenticate(user, token)) return response.status(202).send("UNV");
    const msg = String(text || '').trim();
    if (!roomId || !msg) return response.status(400).json({ error: 'roomId + text required' });
    try {
        const db = admin.database();
        const exists = await db.ref(`parties/${roomId}`).once('value');
        if (!exists.exists()) return response.status(404).json({ error: 'Room not found' });
        await db.ref(`parties/${roomId}/chat`).push({
            user,
            text: msg.slice(0, 500),
            ts: Date.now(),
        });
        response.status(200).json({ ok: true });
    } catch (error) {
        logError(user, '/party/chat', error).catch(() => {});
        response.status(500).json({ error: error.message });
    }
});

// Emoji reactions. Ephemeral — pushed to parties/{roomId}/reactions and
// streamed to peers who are connected *now* via the `reaction` SSE channel
// (history is not replayed). A small allow-list keeps payloads sane.
const ALLOWED_REACTIONS = ['❤️', '😂', '😮', '😢', '🔥', '👏', '👍', '🎉'];
app.post('/party/react', async (request, response) => {
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    const { user, token, roomId, emoji } = request.body;
    if (!await Authenticate(user, token)) return response.status(202).send("UNV");
    if (!roomId || !ALLOWED_REACTIONS.includes(emoji)) {
        return response.status(400).json({ error: 'roomId + valid emoji required' });
    }
    try {
        const db = admin.database();
        const exists = await db.ref(`parties/${roomId}`).once('value');
        if (!exists.exists()) return response.status(404).json({ error: 'Room not found' });
        await db.ref(`parties/${roomId}/reactions`).push({ user, emoji, ts: Date.now() });
        response.status(200).json({ ok: true });
    } catch (error) {
        logError(user, '/party/react', error).catch(() => {});
        response.status(500).json({ error: error.message });
    }
});

// SSE stream — server pushes every state change on the room to this client.
// Three channels: default (playback state), `chat`, and `presence`.
// Drops echoes back to the same actor that sent them so the originator doesn't
// fight its own updates.
app.get('/party/stream', async (request, response) => {
    const { roomId, user, token, clientId } = request.query;
    if (!await Authenticate(user, token)) return response.status(401).end();
    if (!roomId) return response.status(400).end();

    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.flushHeaders?.();

    // Prime the stream immediately so the client's onopen fires fast and so
    // any reverse-proxy buffer doesn't sit on an empty body for 30s.
    try { response.write(`: connected\n\n`); } catch {}

    const heartbeat = setInterval(() => { try { response.write(':\n\n'); } catch {} }, 25000);

    const db = admin.database();
    const ref = db.ref(`parties/${roomId}`);
    // We filter echoes by the per-tab clientId when present (works correctly
    // with multiple tabs on one user). Falls back to the username for older
    // clients. If neither matches, the update is broadcast.
    const selfActor = clientId || user;
    // Dedupe by the playback signature so chat/presence writes (which don't
    // touch lastUpdate) don't resend identical playback state. Chat history is
    // also stripped from the playback payload so it never bloats these pushes.
    let lastSentSig = null;
    const cb = (snap) => {
        const val = snap.val();
        if (!val) {
            try { response.write(`event: end\ndata: {}\n\n`); } catch {}
            return;
        }
        if (val.actor === selfActor) return;
        const { chat, participants, ...playback } = val;
        const sig = JSON.stringify([playback.position, playback.paused, playback.season, playback.episode, playback.actor, playback.lastUpdate]);
        if (sig === lastSentSig) return;
        lastSentSig = sig;
        try { response.write(`data: ${JSON.stringify(playback)}\n\n`); } catch {}
    };
    ref.on('value', cb);

    // Chat — replays the last 50 messages on connect, then streams new ones.
    // A dedicated channel bypasses the playback echo filter so messages always
    // reach every peer regardless of who last touched playback.
    const chatRef = db.ref(`parties/${roomId}/chat`).limitToLast(50);
    const chatCb = (snap) => {
        const m = snap.val();
        if (!m) return;
        try { response.write(`event: chat\ndata: ${JSON.stringify({ ...m, id: snap.key })}\n\n`); } catch {}
    };
    chatRef.on('child_added', chatCb);

    // Presence — broadcast the participant username list on any join/leave.
    const presenceRef = db.ref(`parties/${roomId}/participants`);
    const presenceCb = (snap) => {
        try { response.write(`event: presence\ndata: ${JSON.stringify(Object.keys(snap.val() || {}))}\n\n`); } catch {}
    };
    presenceRef.on('value', presenceCb);

    // Reactions — ephemeral; only forward ones created AFTER this client
    // connected (no history replay), so a freshly-joined viewer doesn't get a
    // burst of stale emoji.
    const connectedAt = Date.now();
    const reactionsRef = db.ref(`parties/${roomId}/reactions`).limitToLast(5);
    const reactionCb = (snap) => {
        const r = snap.val();
        if (!r || (r.ts || 0) < connectedAt) return;
        try { response.write(`event: reaction\ndata: ${JSON.stringify({ ...r, id: snap.key })}\n\n`); } catch {}
    };
    reactionsRef.on('child_added', reactionCb);

    await db.ref(`parties/${roomId}/participants/${user}`).set(true).catch(() => {});

    const cleanup = () => {
        clearInterval(heartbeat);
        ref.off('value', cb);
        chatRef.off('child_added', chatCb);
        presenceRef.off('value', presenceCb);
        reactionsRef.off('child_added', reactionCb);
        db.ref(`parties/${roomId}/participants/${user}`).remove().catch(() => {});
    };
    request.on('close', cleanup);
    request.on('error', cleanup);
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

// Subtitle proxy — fetches SRT/VTT, normalizes to WebVTT, serves to browser and AVPlayer
app.get('/proxy/subtitle', async (req, res) => {
    const raw = req.query.url;
    if (!raw) return res.status(400).send('Missing url');
    const url = decodeURIComponent(raw);
    const forHls = req.query.hls === '1';

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return res.status(400).send('WEBVTT\n\nNOTE invalid subtitle url');
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'text/vtt; charset=utf-8');

    try {
        const { data } = await axios.get(url, {
            headers: { ...lookmovieHeaders, 'Accept': 'text/vtt, text/plain, */*' },
            responseType: 'text',
            timeout: 15000,
        });

        res.send(normalizeToVtt(data, { forHls }));
    } catch (e) {
        const status = e.response?.status || 'no-response';
        const msg = e.message || 'unknown error';
        console.error(`[proxy/subtitle] failed: ${status} — ${msg} — url: ${url}`);
        res.status(502).send(`WEBVTT\n\nNOTE subtitle fetch failed: ${status} ${msg}`);
    }
});

// Returns a minimal HLS media playlist for a single subtitle file.
// iOS AVPlayer references this from #EXT-X-MEDIA in the master manifest.
app.get('/proxy/subtitle-playlist', (req, res) => {
    const raw = req.query.url;
    if (!raw) return res.status(400).send('Missing url');
    const url = decodeURIComponent(raw);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    // hls=1 tells /proxy/subtitle to include X-TIMESTAMP-MAP for AVPlayer sync
    const proxied = `https://goldenhind.tech/proxy/subtitle?url=${encodeURIComponent(url)}&hls=1`;
    res.send([
        '#EXTM3U',
        '#EXT-X-VERSION:3',
        '#EXT-X-TARGETDURATION:86400',
        '#EXT-X-PLAYLIST-TYPE:VOD',
        '#EXT-X-MEDIA-SEQUENCE:0',
        '#EXTINF:86400.000,',
        proxied,
        '#EXT-X-ENDLIST',
    ].join('\n'));
});

// Master HLS manifest rewriter that injects subtitle tracks.
// Used by iOS Safari so AVPlayer sees subtitles in native fullscreen.
app.get('/proxy/hls-with-subs', async (req, res) => {
    const raw = req.query.url;
    const rawSubs = req.query.subs;
    if (!raw) return res.status(400).send('Missing url');
    const url = decodeURIComponent(raw);
    let subs = [];
    try { subs = JSON.parse(decodeURIComponent(rawSubs || '[]')); } catch {}

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');

    try {
        const upstream = await axios.get(url, {
            headers: { 'Referer': 'https://www.lookmovie2.to/', 'User-Agent': lookmovieHeaders['User-Agent'] },
            responseType: 'text',
            timeout: 15000,
        });
        const base = url.substring(0, url.lastIndexOf('/') + 1);

        // Build #EXT-X-MEDIA lines for each subtitle track
        const subMediaLines = subs
            .filter(sub => { const u = String(sub.file || sub.url || ''); return u.startsWith('/') || u.startsWith('http'); })
            .map((sub, i) => {
                const rawSub = String(sub.file || sub.url || '');
                const absSubUrl = rawSub.startsWith('http') ? rawSub : `https://www.lookmovie2.to${rawSub}`;
                const playlistUri = `https://goldenhind.tech/proxy/subtitle-playlist?url=${encodeURIComponent(absSubUrl)}`;
                const name = (sub.language || sub.lang || `Track ${i + 1}`).replace(/"/g, "'");
                const lang = hlsLanguageCode(sub, i);
                return `#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="${name}",DEFAULT=${i === 0 ? 'YES' : 'NO'},AUTOSELECT=${i === 0 ? 'YES' : 'NO'},FORCED=NO,URI="${playlistUri}",LANGUAGE="${lang}"`;
            });

        // Rewrite segment/variant URLs and add SUBTITLES attr to STREAM-INF lines
        const lines = upstream.data.split('\n');
        const rewritten = [];
        for (const line of lines) {
            const t = line.trim();
            if (!t) { rewritten.push(line); continue; }
            if (t.startsWith('#EXT-X-STREAM-INF')) {
                rewritten.push(t.includes('SUBTITLES=') ? t : t + ',SUBTITLES="subs"');
            } else if (!t.startsWith('#')) {
                const abs = t.startsWith('http') ? t : base + t;
                rewritten.push(`/proxy/hls?url=${encodeURIComponent(abs)}`);
            } else {
                rewritten.push(line);
            }
        }

        // Insert #EXT-X-MEDIA lines right after #EXTM3U
        const extm3uIdx = rewritten.findIndex(l => l.trim().startsWith('#EXTM3U'));
        rewritten.splice(extm3uIdx >= 0 ? extm3uIdx + 1 : 0, 0, ...subMediaLines);

        res.send(rewritten.join('\n'));
    } catch (e) {
        if (!res.headersSent) res.status(502).send(e.message);
    }
});

// Resolve a playable LookMovie HLS stream (+ subtitles + a human title) for a
// given content id / season / episode. Shared by the streaming endpoint and
// the download endpoint.
async function resolveLookmovieStream(id, season, episode, dbg) {
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
    return { streamUrl, subtitles, title, year, mediaType };
}

app.post('/server/lookmovie', async (request, response) => {
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    const { user, token, id, season, episode } = request.body;
    if (!await Authenticate(user, token)) return response.status(202).send("UNV");

    const dbg = [];
    try {
        const { streamUrl, subtitles } = await resolveLookmovieStream(id, season, episode, dbg);
        response.json({ success: true, url: streamUrl, subtitles, dbg });
    } catch (error) {
        logError(user, '/server/lookmovie', error).catch(() => {});
        dbg.push(`ERROR: ${error.message}`);
        response.status(200).json({ success: false, error: error.message, dbg });
    }
});

// Download a movie/episode as MP4. Resolves the LookMovie HLS stream, then
// ffmpeg remuxes it (no re-encode — fast, lossless) and streams the fragmented
// MP4 straight to the browser as an attachment. Auth is via query params so the
// URL can be opened directly / via a download manager.
app.get('/download/video', async (request, response) => {
    const { user, token, id, season, episode } = request.query;
    if (!await Authenticate(user, token)) return response.status(401).send('Unauthorized');
    if (!id) return response.status(400).send('Missing id');

    const dbg = [];
    let streamUrl, title, mediaType;
    try {
        ({ streamUrl, title, mediaType } = await resolveLookmovieStream(id, season, episode, dbg));
    } catch (error) {
        logError(user, '/download/video', error).catch(() => {});
        return response.status(502).send(`Could not resolve stream: ${error.message}`);
    }

    // Build a friendly filename: "Title.mp4" or "Title.S01E02.mp4"
    const safeTitle = String(title || 'video').replace(/[/\\?%*:|"<>]/g, '-').trim() || 'video';
    const pad = (n) => String(parseInt(n) || 1).padStart(2, '0');
    const fileName = mediaType === 'tv'
        ? `${safeTitle}.S${pad(season)}E${pad(episode)}.mp4`
        : `${safeTitle}.mp4`;

    response.setHeader('Content-Type', 'video/mp4');
    response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    response.setHeader('Access-Control-Allow-Origin', '*');

    console.log(`[download/video] ${id} S${season}E${episode} → "${fileName}"`);

    // -c copy: remux only (no transcode). aac_adtstoasc fixes HLS AAC for MP4.
    // frag_keyframe+empty_moov makes the MP4 streamable without seeking stdout.
    const ffmpeg = spawn('ffmpeg', [
        '-headers', `Referer: https://www.lookmovie2.to/\r\nUser-Agent: ${lookmovieHeaders['User-Agent']}\r\n`,
        '-i', streamUrl,
        '-c', 'copy',
        '-bsf:a', 'aac_adtstoasc',
        '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
        '-f', 'mp4', '-'
    ]);

    ffmpeg.stdout.pipe(response);
    ffmpeg.stderr.on('data', () => {});
    ffmpeg.on('error', (e) => {
        console.error('[download/video] ffmpeg error:', e.message);
        if (!response.headersSent) response.status(500).send('Conversion failed');
    });
    ffmpeg.on('close', code => console.log(`[download/video] done "${fileName}" code=${code}`));
    // If the client aborts the download, kill ffmpeg so we don't leak processes.
    request.on('close', () => { try { ffmpeg.kill('SIGKILL'); } catch {} });
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

    const videoId = url.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/)?.[1];
    if (!videoId) return res.status(400).json({ error: 'Could not extract video ID from URL' });

    console.log(`[music/url] extracting: ${videoId}`);

    try {
        const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const env = { ...process.env, PATH: `/root/.deno/bin:${process.env.PATH}` };
        const { stdout } = await execAsync(
            `yt-dlp --cookies /root/yt_cookies.txt --no-playlist -f "bestaudio[ext=webm]/bestaudio" --print "%(title)s" --print "%(url)s" "${ytUrl}"`,
            { timeout: 30000, env }
        );
        const lines = stdout.trim().split('\n');
        const streamUrl = lines.pop();
        const title = lines.join(' ').replace(/[/\\?%*:|"<>]/g, '-') || videoId;
        if (!streamUrl?.startsWith('http')) throw new Error('No stream URL returned');
        console.log(`[music/url] ok: "${title}"`);
        return res.json({ streamUrl, title, ext: 'webm' });
    } catch (e) {
        console.error('[music/url] failed:', e.message.split('\n')[0]);
        res.status(500).json({ error: 'Failed to extract stream URL. Try again in a moment.' });
    }
});

// Download a YouTube video's audio as MP3: yt-dlp extracts CDN URL, ffmpeg downloads+converts, streams to browser
app.post('/music/download', async (req, res) => {
    const { user, token, url } = req.body;
    if (!await Authenticate(user, token)) return res.status(401).json({ error: 'Unauthorized' });

    if (!url || !/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(url)) {
        return res.status(400).json({ error: 'Invalid YouTube URL' });
    }

    const videoId = url.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/)?.[1];
    if (!videoId) return res.status(400).json({ error: 'Could not extract video ID' });

    console.log(`[music/download] ${videoId}`);

    const env = { ...process.env, PATH: `/root/.deno/bin:${process.env.PATH}` };
    const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;

    try {
        const { stdout } = await execAsync(
            `yt-dlp --cookies /root/yt_cookies.txt --no-playlist -f "bestaudio[ext=webm]/bestaudio" --print "%(title)s" --print "%(uploader)s" --print "%(upload_date)s" --print "%(url)s" "${ytUrl}"`,
            { timeout: 30000, env }
        );
        const lines = stdout.trim().split('\n');
        const streamUrl = lines.pop();
        const uploadDate = lines.pop() || '';
        const artist = lines.pop() || '';
        const title = (lines.join(' ') || videoId).replace(/[/\\?%*:|"<>]/g, '-');
        const year = uploadDate.slice(0, 4);

        if (!streamUrl?.startsWith('http')) throw new Error('No stream URL returned');

        console.log(`[music/download] streaming: "${title}" by ${artist}`);
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(title)}.mp3`);
        res.setHeader('X-Title', encodeURIComponent(title));
        res.setHeader('Access-Control-Expose-Headers', 'X-Title');

        const ffmpeg = spawn('ffmpeg', [
            '-i', streamUrl,
            '-codec:a', 'libmp3lame', '-q:a', '2',
            '-id3v2_version', '3',
            '-metadata', `title=${title}`,
            '-metadata', `artist=${artist}`,
            '-metadata', `album=YouTube`,
            ...(year ? ['-metadata', `date=${year}`] : []),
            '-f', 'mp3', '-'
        ], { env });

        ffmpeg.stdout.pipe(res);
        ffmpeg.stderr.on('data', () => {});
        ffmpeg.on('error', e => {
            console.error('[music/download] ffmpeg error:', e.message);
            if (!res.headersSent) res.status(500).json({ error: 'Conversion failed' });
        });
        ffmpeg.on('close', code => console.log(`[music/download] done: "${title}" code=${code}`));
    } catch (e) {
        console.error('[music/download] failed:', e.message.split('\n')[0]);
        if (!res.headersSent) res.status(500).json({ error: 'Download failed. Try again in a moment.' });
    }
});
