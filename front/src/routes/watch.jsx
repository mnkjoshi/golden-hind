import { Outlet, useNavigate, useLocation, useParams } from "react-router-dom";
import axios from 'axios'
import React, { useEffect, useState } from 'react';
import Topbar from "../components/topbar"

import ListIcon from "../assets/list.png"
import BookmarkIcon from "../assets/bookmark.png"
import ReloadIcon from "../assets/reload.png"
import StarIcon from "../assets/star.png"
import SimilarIcon from "../assets/GoldenHind.png"
import ServerIcon from "../assets/server.png"

let video = "null"

let DisplayData

export default function App() {  
    const [season, setSeason] = useState(1);
    const [episode, setEpisode] = useState(1);

    const [first, setFirst] = useState(0);

    const [relData, reloadVideo] = useState(1);

    const [maxEp, setMaxEp] = useState(1);
    const [maxSe, setMaxSe] = useState(1);

    const [provider, setProvider] = useState(1);

    const[bookmarked, setBookmark] = useState(-1);
    const[similarOn, setSimilar] = useState(-1);

    const [episodeID, setEpisodeID] = useState("")
    
    const [movID, setMovID] = useState("")
    const [data, setData] = useState({})
    const [voteAvg, setVotes] = useState(0.000);

    const[similarData, setSimilarData] = useState("")

    const [seriesData, setSeriesData] = useState("")
    const [seriesID, setSeriesID] = useState("")

    const [listStatus, openList] = useState(-1);

    let location = useLocation();
    const navigate = useNavigate();
    const { id } = useParams();
    let type = id.slice(0, 1)
    let vidID = id.slice(1, 100000)
    if (type == "m") {
        type = "movie"
    } else if (type == "t") {
        type = "tv"
    } else {
        useEffect(() => {
            navigate('/app')
        })
    }

    if (!(id == null)) {
        if (provider == 1) {
            if (type == 'movie') {
                video = `https://vidlink.pro/${type}/${vidID}/?primaryColor=3FA3FF&secondaryColor=6db8ff&autoplay=false&poster=true`
            } else {
                video = `https://vidlink.pro/${type}/${vidID}/${season}/${episode}?primaryColor=3FA3FF&secondaryColor=6db8ff&autoplay=false&poster=true`
            }
        } else if (provider == 2) {
            if (type == 'movie') {
                video = `https://vidsrc.me/embed/${type}?tmdb=${vidID}`
            } else {
                video = `https://vidsrc.me/embed/${type}?tmdb=${vidID}&season=${season}&episode=${episode}`
            }
        } else if(provider == 3) {
            if (type == 'movie') {
                video = `https://vidsrc.icu/embed/${type}/${vidID}`
            } else {
                video = `https://vidsrc.icu/embed/${type}/${vidID}/${season}/${episode}`
            }
        }
        
    }
    let user = localStorage.getItem("user")
    let token = localStorage.getItem("token")
    useEffect(() => {
        if (user == null) {
            navigate('/auth')
        }

        if (!(localStorage.getItem("provider" + vidID) == null)) {
            if(localStorage.getItem("provider" + vidID) == 1 || localStorage.getItem("provider" + vidID) == 2 || localStorage.getItem("provider" + vidID) == 3) {
                setProvider(localStorage.getItem("provider" + vidID))
            } else {
                localStorage.setItem("provider" + vidID, 1)
                setProvider(1)
            }
        }

        if (type == "movie") {
            if (!(vidID == movID) && !(vidID == null) && !(vidID == "")) {
                axios({
                    method: 'post',
                    url: 'https://golden-hind.onrender.com/mretrieve',
                    data: {
                        user: user,
                        token: token,
                        movie: vidID,
                    }
                }).then((response) => {
                    setMovID(vidID)
                    const ToData = response.data
                    setVotes(response.data.vote_average)
                    setData(ToData)
                });

                axios({
                    method: 'post',
                    url: 'https://golden-hind.onrender.com/similar',
                    data: {
                        user: user,
                        token: token,
                        ID: id,
                    }
                }).then((response) => {
                    setSimilarData(response.data)
                    console.log(response.data)
                });
            }
        } else if (type == "tv") {
            if (!((vidID + episode + season) == episodeID) && !(vidID == null) && !(vidID == "")) {
                axios({
                    method: 'post',
                    url: 'https://golden-hind.onrender.com/eretrieve',
                    data: {
                        user: user,
                        token: token,
                        series: vidID,
                        season: season,
                        episode: episode
                    }
                }).then((response) => {
                    setEpisodeID(vidID + episode + season)
                    const ToData = response.data
                    setVotes(response.data.vote_average)
                    setData(ToData)               
                });
            }

            if (!(vidID == seriesID)  && !(vidID == null) && !(vidID == "")){
                axios({
                    method: 'post',
                    url: 'https://golden-hind.onrender.com/sretrieve',
                    data: {
                        user: user,
                        token: token,
                        series: vidID,
                    }
                }).then((response) => {
                    setSeriesID(vidID)
                    const ToData = response.data
                    setSeriesData(ToData)
            
                    const currentSeason = ToData.seasons.find(s => s.season_number === season);
                    if (currentSeason) {
                        setMaxSe(ToData.seasons.length);
                        setMaxEp(currentSeason.episode_count);
                    } else {
                        setMaxSe(response.data.seasons.length)
                        setMaxEp(response.data.seasons[season - 1].episode_count)
                    }
                });

                axios({
                    method: 'post',
                    url: 'https://golden-hind.onrender.com/similar',
                    data: {
                        user: user,
                        token: token,
                        ID: id,
                    }
                }).then((response) => {
                    setSimilarData(response.data)
                    console.log(response.data)
                });
            }



            if (season == 1 && episode == 1) {
                if (localStorage.getItem("episode" + id)) {
                    if (!(localStorage.getItem("episode" + id) == episode)) {
                        if (first == 0) {
                            console.log("Retrieving data")
                            axios({
                                method: 'post',
                                url: 'https://golden-hind.onrender.com/progress_retrieve',
                                data: {
                                    user: user,
                                    token: token,
                                    progID: id
                                }
                            }).then((response) => {
                                const ToData = response.data
                                if (ToData !== "VNF") {
                                    localStorage.setItem("episode" + id, response.data.episode)
                                    localStorage.setItem("season" + id, response.data.season)
                                }
                                console.log(response.data);
                            });
                            setFirst(1)
                        }

                        setEpisode(localStorage.getItem("episode" + id))
                    }
                } else {
                    localStorage.setItem("episode" + id, episode)
                }
    
                if (localStorage.getItem("season" + id)) {
                    if (!(localStorage.getItem("season" + id) == season)) {
                        setSeason(localStorage.getItem("season" + id))
                    }
                } else {
                    localStorage.setItem("season" + id, season)
                }
            } else {
                if (first == 1) {
                    console.log("Setting data")
                    axios({
                        method: 'post',
                        url: 'https://golden-hind.onrender.com/progress_update',
                        data: {
                            user: user,
                            token: token,
                            progID: id,
                            progStatus: String(season).concat(";").concat(episode)
                        }
                    })
                }
            }
        }

        if (!(localStorage.getItem("bookmarks").indexOf(id) == -1) && bookmarked == -1) {
            setBookmark(1)
        }

        if(localStorage.getItem("continues").indexOf(id) == -1) { 
            let continues = localStorage.getItem("continues")
            continues = JSON.parse(continues)

            continues.push(id)
            continues = JSON.stringify(continues)
            localStorage.setItem("continues", continues)

            axios({
                method: 'post',
                url: 'https://golden-hind.onrender.com/continue',
                data: {
                    user: user,
                    token: token,
                    favId: id,
                }
            });
        }

    })

    window.open = function (open) {
        return function (url, name, features) {
            // set name if missing here
            console.log("window!")
        };
    }(window.open);

    const blockPopups = () => {
        const originalOpen = window.open;
        window.open = () => null; // Block all popup attempts
    
        // Ensure original open is restored after the iframe interaction
        setTimeout(() => {
            window.open = originalOpen;
        }, 10000); // Adjust based on interaction timing
    };
    
    useEffect(() => {
        blockPopups();
    }, []);

    const arrayRange = (start, stop, step) =>
        Array.from(
        { length: (stop - start) / step + 1 },
        (value, index) => start + index * step
    );

    function Bookmark() {
        let bookmarks = localStorage.getItem("bookmarks")
        bookmarks = JSON.parse(bookmarks)
        
        if (bookmarks.indexOf(id) == -1) {
            bookmarks.push(id)
            bookmarks = JSON.stringify(bookmarks)
            localStorage.setItem("bookmarks", bookmarks)

            axios({
                method: 'post',
                url: 'https://golden-hind.onrender.com/favourite',
                data: {
                    user: user,
                    token: token,
                    favId: id,
                }
            });
            setBookmark(1)
        } else {
            bookmarks.splice(bookmarks.indexOf(id), 1)
            bookmarks = JSON.stringify(bookmarks)
            localStorage.setItem("bookmarks", bookmarks)

            axios({
                method: 'post',
                url: 'https://golden-hind.onrender.com/unfavourite',
                data: {
                    user: user,
                    token: token,
                    favId: id,
                }
            });
            setBookmark(-1)
        }
    }

    if(similarOn == -1 && document.getElementById("watch-similar") && document.getElementById("watch-holder")) {
        document.getElementById("watch-similar").style.right = "-22%"
        document.getElementById("watch-holder").style.marginRight = "0%"
    } else if (document.getElementById("watch-similar") && document.getElementById("watch-holder")) {
        document.getElementById("watch-similar").style.right = "0.5%"
        document.getElementById("watch-holder").style.marginRight = "19.5%"
    }


    // async function HandleNextEpisode(eventType, episode, season, maxEp, maxSe, setSeason, setEpisode, currentTime, duration) {
    //     if (currentTime == duration) {
    //         console.log("it's over")
    //         if (episode == maxEp) {
    //             if (season == maxSe) {
    //                 //It's the latest ep, do nothing.
    //             } else {
    //                 localStorage.setItem("season" + id, parseInt(season) + 1)
    //                 localStorage.setItem("episode" + id, 1)
    //                 setSeason(parseInt(season) + 1)
    //                 setEpisode(1)
    //             }
    //         } else {
    //             localStorage.setItem("episode" + id, parseInt(episode) + 1)
    //             setEpisode(parseInt(episode) + 1)
    //         }
    //     }
    // }

    
    // if (type == "tv" && !(document.getElementById("watch-player-file") == null)) {
    //     document.getElementById("watch-player-file").addEventListener("message" , async (event) => {
    //         console.log("Event!")
    
    //         if (event.data?.type === 'PLAYER_EVENT') {
    //             const { event: eventType, currentTime, duration } = event.data.data;
    //             console.log("actual event")
    //             // Handle the event
    //             await HandleNextEpisode(eventType, episode, season, maxEp, maxSe, setSeason, setEpisode, currentTime, duration)
    //         }
    //     })
    // }

    return (
        <div className= "watch-main" id= "watch-main">
            {!(seriesData == null) ? (!(seriesData.backdrop_path == null) ? <img className= "watch-backdrop" src = {"https://image.tmdb.org/t/p/original/" + seriesData.backdrop_path}/>  : null): null}
            {!(data == null) ? (!(data.backdrop_path == null) ? <img className= "watch-backdrop" src = {"https://image.tmdb.org/t/p/original/" + data.backdrop_path}/>  : null): null}
            <Topbar/>
            <div className= "watch-holder" id= "watch-holder">
                <div className= "watch-system">
                <div className= "watch-player">
                    <iframe className= "watch-player-file" id="watch-player-file" src= {video} frameBorder="0" allowFullScreen="yes" allow="autoplay"></iframe>
                </div>
                <div className= "watch-options">
                    <div className= "watch-left">
                        
                        {type == "movie" ? <MovieDisplay data= {data}/> : <EpisodeDisplay data = {data} season = {season} episode = {episode} setSeason = {setSeason} setEpisode = {setEpisode} maxEp= {maxEp} maxSe= {maxSe} id= {id}/>}

                        <div className= "watch-toggles1">
                            {type == "tv" ? 
                            <button className = "watch-toggles-button watch-toggles-list" onClick={() => openList(-1 * listStatus)}>
                                <img className = "watch-toggles-button-icon watch-toggles-list-icon" src = {ListIcon}/>
                            </button> : null
                            }
                            {listStatus == 1 ? 
                            <div className = "watch-list" style= {{width: (maxEp * 3)+ "%"}}>
                                {arrayRange(1, maxEp, 1).map( result =>
                                    <button className= "watch-list-episode" onClick={() => {localStorage.setItem("episode" + id, result); setEpisode(result)}}>
                                        {result}
                                    </button>
                                )}
                            </div>
                            :
                            <div className = "watch-list" style= {{width: "0%", visibility: "false", border: "none", padding: "0px"}}>
                            </div>
                            }
                            {localStorage.getItem("bookmarks").indexOf(id) == -1 ? 
                            <button className = "watch-toggles-button" onClick={() => Bookmark()}>
                                <img className = "watch-toggles-button-icon" src = {BookmarkIcon}/>
                            </button>
                            :
                            <button className = "watch-toggles-button-selected" onClick={() => Bookmark()}>
                                <img className = "watch-toggles-button-icon" src = {BookmarkIcon}/>
                            </button>
                            }
                            <button className = "watch-toggles-button watch-toggles-reload" onClick={() => {reloadVideo(relData + 1); console.log(relData); window.location.reload()}}>
                                <img className = "watch-toggles-button-icon watch-toggles-reload-icon" src = {ReloadIcon}/>
                            </button>
                        </div>
                    </div>
                    <div className= "watch-right">
                        <div className= "watch-rating">
                            <div className= "watch-rating-info">
                                <p className= "watch-rating-score">
                                    {voteAvg}
                                </p>
                                <div className= "watch-rating-stars">
                                    {voteAvg >= 2 ? <img className= "watch-star-icon watch-star-full" src= {StarIcon}/> : (voteAvg > 1.5 ? <img className= "watch-star-icon watch-star-half" src= {StarIcon}/> : <img className= "watch-star-icon watch-star-empty" src= {StarIcon}/>)}
                                    {voteAvg >= 4 ? <img className= "watch-star-icon watch-star-full" src= {StarIcon}/> : (voteAvg > 3.5 ? <img className= "watch-star-icon watch-star-half" src= {StarIcon}/> : <img className= "watch-star-icon watch-star-empty" src= {StarIcon}/>)}
                                    {voteAvg >= 6 ? <img className= "watch-star-icon watch-star-full" src= {StarIcon}/> : (voteAvg > 5.5 ? <img className= "watch-star-icon watch-star-half" src= {StarIcon}/> : <img className= "watch-star-icon watch-star-empty" src= {StarIcon}/>)}
                                    {voteAvg >= 8 ? <img className= "watch-star-icon watch-star-full" src= {StarIcon}/> : (voteAvg > 7.5 ? <img className= "watch-star-icon watch-star-half" src= {StarIcon}/> : <img className= "watch-star-icon watch-star-empty" src= {StarIcon}/>)}
                                    {voteAvg >= 9.5 ? <img className= "watch-star-icon watch-star-full" src= {StarIcon}/> : (voteAvg >= 8.5 ? <img className= "watch-star-icon watch-star-half" src= {StarIcon}/> : <img className= "watch-star-icon watch-star-empty" src= {StarIcon}/>)}
                                </div>
                            </div>
                            {/* <div className= "watch-rating-underline"/> */}
                        </div>
                        <div className= "watch-toggles2">
                            <button className = "watch-toggles-button watch-toggles-server" onClick={() => {if (parseInt(provider) >= 3) {setProvider(1); localStorage.setItem("provider" + vidID, parseInt(1))} else {console.log("setting provider" + parseInt(parseInt(provider) + 1)); setProvider(parseInt(provider) + 1); localStorage.setItem("provider" + vidID, parseInt(parseInt(provider) + parseInt(1)))}}}>
                                <img className = "watch-toggles-button-icon watch-toggles-server-icon" src = {ServerIcon}/>
                            </button>
                            {window.innerWidth < 800 ? <button className = "watch-toggles-button watch-toggles-review" onClick={() => {
                                setSimilar(-1 * similarOn)
                            }}>
                                <img className = "watch-toggles-button-icon watch-toggles-similar-icon" src = {SimilarIcon}/>
                            </button> : null}
                        </div>
                    </div>
                </div>
                </div>
                
            </div>
            {window.innerWidth < 800 ? null : <div className= "watch-similar" id= "watch-similar">
                    {similarData == "" ? "" : 
                    (similarData.map( result =>
                        <div className= "watch-results-component"> 
                            <div className= "watch-results-component-details">
                                <img className= "watch-results-component-poster" src={"https://image.tmdb.org/t/p/original/" + result.poster_path} onClick={() => {setSimilar(-1 * similarOn); if (type == "movie") {navigate("/watch/m" + result.id)} else {navigate("/watch/t" + result.id)} }}/>
                                <div className= "watch-results-component-info">
                                    <p className= "watch-results-component-title">{result.name == null ? (result.title == null ? "Untitled" : result.title) : result.name}</p>
                                    <p className= "watch-results-component-overview">{result.overview.slice(0, 200)}</p>
                                    {result.overview.length > 200 ? <button className= "watch-results-component-expand" onClick={() => {document.getElementById("watch-results-component-overview-expanded" + result.id).style.visibility = "visible"; document.getElementById("watch-results-component-overview-expanded" + result.id).style.zIndex = 6}}>EXPAND</button> : null}
                                </div>  
                            </div>
                            <p className= "watch-results-component-overview-expanded" id= {"watch-results-component-overview-expanded" + result.id} onClick={() => {document.getElementById("watch-results-component-overview-expanded" + result.id).style.visibility = "hidden"; document.getElementById("watch-results-component-overview-expanded" + result.id).style.zIndex = -1}}>{result.overview}</p>
                            <div className= "watch-results-component-options">
                                <div className= "watch-results-component-options-top">
                                    {type == "movie" ? 
                                    <p id="watch-results-component-format" className= "watch-results-component-format watch-results-component-data watch-results-component-movie">mv</p>
                                    :
                                    <p id="watch-results-component-format" className= "watch-results-component-format watch-results-component-data watch-results-component-tv">{result.media_type}</p>
                                    }
                                    <p id="watch-results-component-rating" className= "watch-results-component-rating watch-results-component-data" style={{background: `color-mix(in srgb, red ${( 1- result.vote_average/10) * 100}%, green ${(result.vote_average/10) * 100}%)`}}>{result.vote_average}</p>
                                    <p className= "watch-results-component-language watch-results-component-data">{result.original_language}</p>
                                    {result.first_air_date == null ? 
                                    (result.release_date == null ? <p className= "watch-results-component-date watch-results-component-data">0000-00-00</p> : <p className= "watch-results-component-date watch-results-component-data">{result.release_date}</p>) : <p className= "watch-results-component-date watch-results-component-data">{result.first_air_date}</p>}
                                    {result.origin_country == null ? <img className="watch-results-component-country" src={`https://flagsapi.com/AQ/flat/64.png`}/> : <img className="watch-results-component-country" src={`https://flagsapi.com/${result.origin_country[0]}/flat/64.png`}/>}
                                </div>
                                <div className= "watch-results-component-options-bottom">

                                </div>
                            </div>
                        </div>
                    ))}
                </div>}
            
        </div>
    );
  }

export function EpisodeDisplay(input) {
    const {data, season, episode, setSeason, setEpisode, maxEp, maxSe, id} = input
    return (
    <div className="watch-episode">
        {episode == 1 ? <button className="watch-episode-arrow">{" "}</button> : <button className="watch-episode-arrow" onClick={() => {localStorage.setItem("episode" + id, parseInt(episode) - 1); setEpisode(parseInt(episode) - 1)}}>{"<<"}</button>}
        <div className="watch-episode-display">
            <p className="watch-episode-display-title">{data == null ? "Loading.." : "Ep " + episode+ ": " + data.name}</p>
            <div className="watch-season-display">
                {season == 1 ? <button className="watch-season-arrow">{" "}</button> : <button className="watch-season-arrow" onClick={() => {localStorage.setItem("season" + id, parseInt(season) - 1); localStorage.setItem("episode" + id, 1); setSeason(parseInt(season) - 1); setEpisode(1)}}>{"<<"}</button>}
                <p className="watch-season-title">{"SEASON " + season}</p>
                {season == maxSe ? <button className="watch-season-arrow">{" "}</button> : <button className="watch-season-arrow" onClick={() => {localStorage.setItem("season" + id, parseInt(season) + 1); localStorage.setItem("episode" + id, 1); setSeason(parseInt(season) + 1); setEpisode(1)}}>{">>"}</button>}
            </div>
        </div>
        {episode == maxEp ? <button className="watch-episode-arrow" onClick={() => {localStorage.setItem("episode" + id, parseInt(episode) + 1); setEpisode(parseInt(episode) + 1)}}>{" >"}</button> : <button className="watch-episode-arrow" onClick={() => {localStorage.setItem("episode" + id, parseInt(episode) + 1); setEpisode(parseInt(episode) + 1)}}>{">>"}</button>}
    </div>
    );
  }

export function MovieDisplay(data) {
    console.log(data)
    return (
    <div className= "watch-movie">
        <p className= "watch-movie-title">{data == "" ? "Loading.." : data.data.title}</p>
    </div>
    );
}


  // <iframe id="player_iframe" src="https://gbf7wrqapjg1js045ye8.com/prorcp/NjFkNzc0YTU0YTBhZDI5OGZjYWQzYWYyNmNjNjk2MDc6Y1RGNVFuaFNia3BUUnpWa2RDdHpZMHQwVTJwaVNWUkNPVk41YlVKcVdGQnFiVTAyZDBGdVRGWnpSbXB5ZFVsMk4weFBZVWc0T0ZkeGNHMTBjMnM1WkhKV1JYZGFNVk5PVlU4MWJGWjVXbk52Y204eGVYUTNjbGR1TlUxYWRVMXBOMmRvTUd4RlpWUllkbkpVU2tGVlRFWkRNV2xuZFhWaE0xQkRWRTV6V21WMUt6bHhlR1UwWlU0M1owSk5aWHBPVURSbWNERlFWMkU1Y21sWU9WbExaVEJKVEd0SVJuWTFZaTl0TWxORmNrMW1RbEUzTjJkMVlsSkRhekZ1Um1sRlNXOW1XalJZZDJkbFdYcDNVWEpCWm1OaWVtUm9hR1o2Y25oMFN6TXlNbkV3Ukd0bFdVcFlVRFZzYUdSdlJWRXdNMjV2UlhCWmMwcE9XV1l5WnpKUVRWQnVibkpxS3pRMFNXUmthV3h1YkRSWFVXWkdiRFl5T1Rjd2RWWkVTbFpwZGxGNFRsTnVSakZLTDBWRVZuUTBLMU5EUmxsRGJEWkxlSEJTTDFsYU1XSmxTM2REVnpsR1lXaHpNRFpOV2paRWJVb3ZablpPV2k4NVZXeERNa1EzTURCS2FHSkVhV3Q0YTFvM1VtbHNSRzQwVFRNMWVqZFlSV3hxU21Kak4weFdWRXBxWjBkeGJqYzRWR05zVFRGdVFVeHRiRXR0WldadFRGVjFhek5LWmtkbVREaEphazVrUWpVMFJrbGlRMFpqYUd3dlQyNVljRUZuUld0SWFYZFhhbTFJTDBsQlZsSlhTVEJNT0dkQ2VYQm1jbVE0VkN0blIwdFljRGRGVkVZck1WVlliR2h2VXpkNk4zVkNMM0pCTDFBMGJFdzJlbWxZVm0xV1QxbEdibXBGWjNWTFJVbEpVR2hKWkZoVVpVdEpWa2wxVlhKTmNXdDRZMEpUYnpoQ2NIaEhNa2xvVkhad1VrdE9jRVpSZGxWUk1scFlUMmd4Y1hkaFRFOU1NV3hZZUU5ak9YaE9jRWhMYldSaFYzUkdkVFpuWkdWRWIyVnVPV0pNY0RWSE1FWmlaMmhDYVdoUlZFSjNjR1kzTjFaMGNXWkpWMGhIUVVFcmJuSmFjaXRvVlU5SFVtdzFjVkpWWTNob1RqQlBkV3BIWW1nM1FVaDJOMjVMYWsweWVXWmlTV2g1UkRKUVZ6UnNXRzVTVkVaQ09XcExjRUpsZDFJdmJVNUZXWEJZVG5sdVIyZHFheTlFU3paU09YRm1ZM0pRWmpoNVEwOUdjM2MwYlRkUE4wSmlaakl3VEc1T1JVSktkV1ZzTlVRMlNrZDVhRGxGYUhCd2FrRndiMEZ2YlVoTVlrVXZXbkZ1VUhWYVNEZFNiVXh4WW1oMFlWaFJibk42UVhsTGNsZEZkV3hsV0daWmVEaERiR1Z2TVhsSWNYVkZPR3B0WmpoT2NtRnBiWHBxYWs1bk5GWTNXRmM1ZDFscGJHOWxTbWx3WTBGUmRXRXZPR2xGYVhaNksxUnhWWGxzUld4eFFuUkpRbVpYVkdzdlJIVnNiMmRWWTFod2VVZFpjMjFoVEhadGMybEdiblZxV2xKVU1XTk5kR1pqY0Uxa2ExaHlPRlF2VlZoc2VWVTVUV05uUjJ3NUsxUjFTamwxYjFVdmR6UjFkbWxNZWt3elVWaFVlalZqWjNCcVNqTm1ZbWhJWVU1T1VYRTFOM1p1WkVVNVRtZG9RbFV5YVc1R2VUUTFMMFppVEVrMVQzSkpXR1JDYTFwSWJXaFZNV1ZFUld4WU5UTXdhMFppWkVOR2FWaGlLM1IwVm5oNGNUQmFkaXQyYUU5cWF6TkRZVnBKZFc1MlQxZFJabWRXUjBjeUsyRlRTMlZPSzNacmFWQmhNVlV2VUhsSFl6ZFRabGhZUkc4M2FFZG1ibXBxTnpsQlptbHhXR3BtSzI5bVVVdFRURWwwVDNvckwzVXJkRVowVDNaV1FWcHVaRTVFYVVKc1pXRjZORTB6UzJ3MFIwSnVTbE5FWmpsYU9Dc3JLMlJ6WTFSVmJFVlBTRnB0YTBKUGFIQkpkVkI0WWxSSldFUlVOSEJLU1UxTk5GSjVZVVp2VFhWWmVXRjBjVzlxVnpadGR6SjRLMEpxYjBGQ09IWnVaRzhyV2s5UE1tcFRZMjlLWVd4S2Rrb3ZhREJDVUdvclVUZ3lPRk16ZFRrcmJtYzBZMmhQVkhSV2FXcFpPV1phTXpOMGNqQmtUMVp0ZFRsWWRFcFRaaTluTVZkVlMxZHdLMlJNWVhGU1RqVmxhVVF2ZGxwVWJuVjNabEppU1ZvMFZUUk1lWFZFWm1WRllXOW5kVUZQY0dwcGRYTlRXbGhTVDJ0d1MwcERWbXhtTTFWclVGTjBUa056WTNFeGNuSnpkbm92UjNaS2FtZHlaejA5" frameborder="0" scrolling="no" allowfullscreen="yes" allow="autoplay"></iframe>