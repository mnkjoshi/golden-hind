import { Outlet, useNavigate, useLocation } from "react-router-dom";
import axios from 'axios'
import Authenticate  from "../components/authenticate.jsx";
import React, { useEffect, useState } from 'react';
import Topbar from "../components/topbar"
let DisplayData

export default function App() {  
    let location = useLocation();
    const navigate = useNavigate();
    
    const [bookmarkData, setBookmarkData] = useState("")
    const [continueData, setContinueData] = useState("")
    const [trendingData, setTrendingData] = useState("")

    const [bookmarkPage, setBookmarkPage] = useState(1)
    const [continuePage, setContinuePage] = useState(1)
    const [trendingPage, setTrandingPage] = useState(1)


    let user = localStorage.getItem("user")
    let token = localStorage.getItem("token")
    useEffect(() => {
        if (user == null) {
            navigate('/auth')
        } else {
            if (bookmarkData == "" && continueData == "" && trendingData == "") {
                axios({
                    method: 'post',
                    url: 'https://golden-hind.onrender.com/home',
                    data: {
                        user: user,
                        token: token,
                    }
                }).then((response) => {
                    localStorage.setItem("bookmarks", response.data.favourites)
                    localStorage.setItem("continues", response.data.continues)
                    console.log(response.data.favouritesData)
                    console.log(response.data.continuesData)
                    setBookmarkData(response.data.favouritesData)
                    setContinueData(response.data.continuesData)
                });
            }
        }
    })

    return (
        <div className= "app-main" id= "app-main">
            <Topbar/>
        
            <div className= "app-display">
                <p className= "app-display-title">Trending Now</p>
                <div className= "app-display-results">
                    {

                    }
                </div>
            </div>

            <div className= "app-display">
                <p className= "app-display-title">Continue Watching..</p>
                <div className= "app-display-results">
                    {continueData == "" ? "Loading Data.." : 
                    (continueData.map( result =>
                        <div className= "app-results-component"> 
                            <div className= "app-results-component-details">
                                <img className= "app-results-component-poster" src={"https://image.tmdb.org/t/p/original/" + result.poster_path} onClick={() => {if (result.media_type == "movie") {navigate("/watch/m" + result.id)} else {navigate("/watch/t" + result.id)} }}/>
                                <div className= "app-results-component-info">
                                    <p className= "app-results-component-title">{result.name == null ? (result.title == null ? "Untitled" : result.title) : result.name}</p>
                                    <p className= "app-results-component-overview">{result.overview.slice(0, 450)}</p>
                                    {result.overview.length > 450 ? <button className= "app-results-component-expand" onClick={() => {document.getElementById("app-results-component-overview-expanded" + result.id).style.visibility = "visible"; document.getElementById("app-results-component-overview-expanded" + result.id).style.zIndex = 6}}>EXPAND</button> : null}
                                </div>  
                            </div>
                            <p className= "app-results-component-overview-expanded" id= {"app-results-component-overview-expanded" + result.id} onClick={() => {document.getElementById("app-results-component-overview-expanded" + result.id).style.visibility = "hidden"; document.getElementById("app-results-component-overview-expanded" + result.id).style.zIndex = -1}}>{result.overview}</p>
                            <div className= "app-results-component-options">
                                <div className= "app-results-component-options-top">
                                    {result.media_type == "movie" ? 
                                    <p id="app-results-component-format" className= "app-results-component-format app-results-component-data app-movie">mv</p>
                                    :
                                    <p id="app-results-component-format" className= "app-results-component-format app-results-component-data app-tv">{result.media_type}</p>
                                    }
                                    <p id="app-results-component-rating" className= "app-results-component-rating app-results-component-data" style={{background: `color-mix(in srgb, red ${( 1- result.vote_average/10) * 100}%, green ${(result.vote_average/10) * 100}%)`}}>{result.vote_average}</p>
                                    <p className= "app-results-component-language app-results-component-data">{result.original_language}</p>
                                    {result.first_air_date == null ? 
                                    (result.release_date == null ? <p className= "app-results-component-date app-results-component-data">0000-00-00</p> : <p className= "app-results-component-date app-results-component-data">{result.release_date}</p>) : <p className= "app-results-component-date app-results-component-data">{result.first_air_date}</p>}
                                    {result.origin_country == null ? <img className="app-results-component-country" src={`https://flagsapi.com/AQ/flat/64.png`}/> : <img className="app-results-component-country" src={`https://flagsapi.com/${result.origin_country[0]}/flat/64.png`}/>}
                                </div>
                                <div className= "app-results-component-options-bottom">
    
                                </div>
                            </div>
                        </div>
                     ))
                    }
                </div>
            </div>

            <div className= "app-display">
                <p className= "app-display-title">Bookmarked Content</p>
                <div className= "app-display-results">
                    
                </div>
            </div>

        </div>
    );
  }