import { Outlet, useNavigate, useLocation, useParams } from "react-router-dom";
import axios from 'axios'
import React, { useEffect, useState } from 'react';
import Topbar from "../components/topbar"

import ListIcon from "../assets/list.png"
import BookmarkIcon from "../assets/bookmark.png"
import ReloadIcon from "../assets/reload.png"
import StarIcon from "../assets/star.png"
import ReviewIcon from "../assets/review.png"
import ServerIcon from "../assets/server.png"

let video = "null"

let DisplayData

export default function App() {  
    const [season, setSeason] = useState(1);
    const [episode, setEpisode] = useState(1);
    const [episodeID, setEpisodeID] = useState("")
    
    const [movID, setMovID] = useState("")
    const [data, setData] = useState({})
    const [voteAvg, setVotes] = useState(0.000);

    const [seriesData, setSeriesData] = useState("")
    const [seriesID, setSeriesID] = useState("")

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
        if (type == 'movie') {
            video = `https://vidlink.pro/${type}/${vidID}/?primaryColor=3FA3FF&secondaryColor=6db8ff&autoplay=true&poster=true&muted=false`
        } else {
            video = `https://vidlink.pro/${type}/${vidID}/${season}/${episode}?primaryColor=3FA3FF&secondaryColor=6db8ff&autoplay=true&poster=true&muted=false`
        }
    }
    let user = localStorage.getItem("user")
    let token = localStorage.getItem("token")
    useEffect(() => {
        if (user == null) {
            navigate('/auth')
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
                    console.log(seriesData)
                });
            }
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
    
    return (
        <div className= "watch-main" id= "watch-main">
            <Topbar/>
            <div className= "watch-system">
                <div className= "watch-player">
                    <iframe className= "watch-player-file" id="watch-player-file" src= {video} frameBorder="0" allowFullScreen="yes" allow="autoplay"></iframe>
                </div>
                <div className= "watch-options">
                    <div className= "watch-left">
                        
                        {type == "movie" ? <MovieDisplay data= {data}/> : <EpisodeDisplay data = {data} season = {season} episode = {episode} setSeason = {setSeason} setEpisode = {setEpisode}/>}

                        <div className= "watch-toggles1">
                            <button className = "watch-toggles-button watch-toggles-list" onClick={() => console.log("Test")}>
                                <img className = "watch-toggles-button-icon watch-toggles-list-icon" src = {ListIcon}/>
                            </button>
                            <button className = "watch-toggles-button watch-toggles-bookmark" onClick={() => console.log("Test")}>
                                <img className = "watch-toggles-button-icon watch-toggles-bookmark-icon" src = {BookmarkIcon}/>
                            </button>
                            <button className = "watch-toggles-button watch-toggles-reload" onClick={() => console.log("Test")}>
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
                                    <img className= "watch-star-icon" src= {StarIcon}/>
                                    <img className= "watch-star-icon" src= {StarIcon}/>
                                    <img className= "watch-star-icon" src= {StarIcon}/>
                                    <img className= "watch-star-icon" src= {StarIcon}/>
                                    <img className= "watch-star-icon" src= {StarIcon}/>
                                </div>
                            </div>
                            <div className= "watch-rating-underline"/>
                        </div>
                        <div className= "watch-toggles2">
                            <button className = "watch-toggles-button watch-toggles-server" onClick={() => console.log("Test")}>
                                <img className = "watch-toggles-button-icon watch-toggles-server-icon" src = {ServerIcon}/>
                            </button>
                            <button className = "watch-toggles-button watch-toggles-review" onClick={() => console.log("Test")}>
                                <img className = "watch-toggles-button-icon watch-toggles-review-icon" src = {ReviewIcon}/>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
  }

export function EpisodeDisplay(input) {
    const {data, season, episode, setSeason, setEpisode} = input
    return (
    <div className="watch-episode">
        <button className="watch-episode-arrow" onClick={() => setEpisode(episode + - 1)}>{"<<"}</button>
        <div className="watch-episode-display">
            <p className="watch-episode-display-title">{data == null ? "Loading.." : "Ep " + episode+ ": " + data.name}</p>
            <div className="watch-season-display">
                <button className="watch-season-arrow" onClick={() => setSeason(season - 1)}>{"<<"}</button>
                <p className="watch-season-title">{"SEASON " + season}</p>
                <button className="watch-season-arrow" onClick={() => setSeason(season + 1)}>{">>"}</button>
            </div>
        </div>
        <button className="watch-episode-arrow" onClick={() => setEpisode(episode + 1)}>{">>"}</button>
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