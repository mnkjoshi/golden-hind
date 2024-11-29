import { Outlet, useNavigate, useLocation } from "react-router-dom";
import axios from 'axios'
import Authenticate  from "../components/authenticate.jsx";
import React, { useEffect, useState } from 'react';
import Topbar from "../components/topbar"
let DisplayData

export default function App() {  
    let location = useLocation();
    const navigate = useNavigate();
    let PageLength = 4;
    if (window.innerWidth < 800) {
        PageLength = 2;
    }
    const [bookmarkData, setBookmarkData] = useState("")
    const [continueData, setContinueData] = useState("")
    const [trendingData, setTrendingData] = useState("")

    const [bookmarkPage, setBookmarkPage] = useState(0)
    const [continuePage, setContinuePage] = useState(0)
    const [trendingPage, setTrandingPage] = useState(0)


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
                    setBookmarkData(response.data.favouritesData.reverse())
                    setContinueData(response.data.continuesData.reverse())
                    setTrendingData(response.data.trendingData)
                });
            }
        }
    })

    function removeHandle(isMovie, ID, isBookmark) {
        axios({
            method: 'post',
            url: 'https://golden-hind.onrender.com/' + (isBookmark == true ? "unfavourite" : "uncontinue"),
            data: {
                user: user,
                token: token,
                favId: (isMovie == true ? "m" : "t") + ID,
            }
        })

        setBookmarkPage(0)
        setBookmarkData("")

        setContinuePage(0)
        setContinueData("")

        setTrandingPage(0)
        setTrendingData("")
    }

    return (
        <div className= "app-main" id= "app-main">
            <Topbar/>
            {!(trendingData == null) ? (!(trendingData.results == null) ? <img className= "app-backdrop" src = {"https://image.tmdb.org/t/p/original/" + trendingData.results[Math.round(Math.random() * 3)].backdrop_path}/>  : null): null}
            <div className= "app-display">
                <div className= "app-display-title-box">
                    <p className= "app-display-title">Trending Now</p>
                    <div className= "app-display-page-box">
                        {trendingPage == 0 ? <button className= "app-display-page-arrow">{" "}</button> : <button className= "app-display-page-arrow" onClick={() => setTrandingPage(parseInt(trendingPage) - 1)}>{"<"}</button>}
                        <p className= "app-display-page-title">Page {trendingPage + 1}</p>
                        {trendingData == "" ? null :
                            trendingPage == Math.ceil(trendingData.results.length/PageLength) - 1 ?
                            <button className= "app-display-page-arrow">{" "}</button> :
                            <button className= "app-display-page-arrow" onClick={() => setTrandingPage(parseInt(trendingPage) + 1)}>{">"}</button>
                        }
                    </div>
                </div>
                <div className= "app-display-results">
                
                {trendingData == "" ? "" : 
                    (trendingData.results.slice((trendingPage * PageLength), (trendingPage * PageLength) + PageLength).map( result =>
                        <div className= "app-results-component"> 
                            <div className= "app-results-component-details">
                                <img className= "app-results-component-poster" src={"https://image.tmdb.org/t/p/original/" + result.poster_path} onClick={() => {if (result.media_type == "movie") {navigate("/watch/m" + result.id)} else {navigate("/watch/t" + result.id)} }}/>
                                <div className= "app-results-component-info">
                                    <p className= "app-results-component-title">{result.name == null ? (result.title == null ? "Untitled" : result.title) : result.name}</p>
                                    <p className= "app-results-component-overview">{result.overview.slice(0, (PageLength == 4 ? (PageLength == 4 ? 450 : 200) : 200))}</p>
                                    {result.overview.length > (PageLength == 4 ? 450 : 200) ? <button className= "app-results-component-expand" onClick={() => {document.getElementById("app-results-component-overview-expanded" + result.id).style.visibility = "visible"; document.getElementById("app-results-component-overview-expanded" + result.id).style.zIndex = 6}}>EXPAND</button> : null}
                                </div>  
                            </div>
                            <p className= "app-results-component-overview-expanded" id= {"app-results-component-overview-expanded" + result.id} onClick={() => {document.getElementById("app-results-component-overview-expanded" + result.id).style.visibility = "hidden"; document.getElementById("app-results-component-overview-expanded" + result.id).style.zIndex = -1}}>{result.overview}</p>
                            <div className= "app-results-component-options">
                                <div className= "app-results-component-options-top">
                                    {result.media_type == "movie" ? 
                                    <p id="app-results-component-format" className= "app-results-component-format app-results-component-data app-movie">mv</p>
                                    :
                                    <p id="app-results-component-format" className= "app-results-component-format app-results-component-data app-tv">{result.media_type == "movie" ? "mv" : "tv"}</p>
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
                <div className= "app-display-title-box">
                    <p className= "app-display-title">Continue Watching:</p>
                    <div className= "app-display-page-box">
                        {continuePage == 0 ? <button className= "app-display-page-arrow">{" "}</button> : <button className= "app-display-page-arrow" onClick={() => setContinuePage(parseInt(continuePage) - 1)}>{"<"}</button>}
                        <p className= "app-display-page-title">Page {continuePage + 1}</p>
                        {console.log(continuePage == Math.ceil(continueData.length/PageLength))}
                        {continueData == "" ? null :
                            continuePage == Math.ceil(continueData.length/PageLength) - 1 ?
                            <button className= "app-display-page-arrow">{" "}</button>:
                            <button className= "app-display-page-arrow" onClick={() => setContinuePage(parseInt(continuePage) + 1)}>{">"}</button>
                        }
                    </div>
                </div>
                <div className= "app-display-results">
                    {continueData == "" ? "" : 
                    (continueData.slice((continuePage * PageLength), (continuePage * PageLength) + PageLength).map( result =>
                        <div className= "app-results-component"> 
                            <div className= "app-results-component-details">
                                <img className= "app-results-component-poster" src={"https://image.tmdb.org/t/p/original/" + result.poster_path} onClick={() => {if (result.number_of_episodes == null) {navigate("/watch/m" + result.id)} else {navigate("/watch/t" + result.id)} }}/>
                                <div className= "app-results-component-info">
                                    <p className= "app-results-component-title">{result.name == null ? (result.title == null ? "Untitled" : result.title) : result.name}</p>
                                    <p className= "app-results-component-overview">{result.overview.slice(0, (PageLength == 4 ? 450 : 200))}</p>
                                    {result.overview.length > (PageLength == 4 ? 450 : 200) ? <button className= "app-results-component-expand" onClick={() => {document.getElementById("app-results-component-overview-expanded" + result.id).style.visibility = "visible"; document.getElementById("app-results-component-overview-expanded" + result.id).style.zIndex = 6}}>EXPAND</button> : null}
                                </div>  
                            </div>
                            <p className= "app-results-component-overview-expanded" id= {"app-results-component-overview-expanded" + result.id} onClick={() => {document.getElementById("app-results-component-overview-expanded" + result.id).style.visibility = "hidden"; document.getElementById("app-results-component-overview-expanded" + result.id).style.zIndex = -1}}>{result.overview}</p>
                            <div className= "app-results-component-options">
                                <div className= "app-results-component-options-top">
                                    {result.number_of_episodes == null ? 
                                    <p id="app-results-component-format" className= "app-results-component-format app-results-component-data app-movie">mv</p>
                                    :
                                    <p id="app-results-component-format" className= "app-results-component-format app-results-component-data app-tv">{result.number_of_episodes == null ? "mv" : "tv"}</p>
                                    }
                                    <p id="app-results-component-rating" className= "app-results-component-rating app-results-component-data" style={{background: `color-mix(in srgb, red ${( 1- result.vote_average/10) * 100}%, green ${(result.vote_average/10) * 100}%)`}}>{result.vote_average}</p>
                                    <p className= "app-results-component-language app-results-component-data">{result.original_language}</p>
                                    {result.first_air_date == null ? 
                                    (result.release_date == null ? <p className= "app-results-component-date app-results-component-data">0000-00-00</p> : <p className= "app-results-component-date app-results-component-data">{result.release_date}</p>) : <p className= "app-results-component-date app-results-component-data">{result.first_air_date}</p>}
                                    {result.origin_country == null ? <img className="app-results-component-country" src={`https://flagsapi.com/AQ/flat/64.png`}/> : <img className="app-results-component-country" src={`https://flagsapi.com/${result.origin_country[0]}/flat/64.png`}/>}
                                </div>
                                <div className= "app-results-component-options-bottom">
                                    <button className= "app-results-component-button" onClick={() => removeHandle(result.number_of_episodes == null, result.id, false)}>X</button>
                                </div>
                            </div>
                        </div>
                     ))
                    }
                </div>
            </div>

            <div className= "app-display">
                <div className= "app-display-title-box">
                    <p className= "app-display-title">Bookmarked:</p>
                    <div className= "app-display-page-box">
                        {bookmarkPage == 0 ? <button className= "app-display-page-arrow">{" "}</button> : <button className= "app-display-page-arrow" onClick={() => setBookmarkPage(parseInt(bookmarkPage) - 1)}>{"<"}</button>}
                        <p className= "app-display-page-title">Page {bookmarkPage + 1}</p>
                        {console.log(bookmarkPage == Math.ceil(bookmarkData.length/PageLength))}
                        {bookmarkData == "" ? null :
                            bookmarkPage == Math.ceil(bookmarkData.length/PageLength) - 1 ?
                            <button className= "app-display-page-arrow">{" "}</button>:
                            <button className= "app-display-page-arrow" onClick={() => setBookmarkPage(parseInt(bookmarkPage) + 1)}>{">"}</button>
                        }
                    </div>
                </div>
                <div className= "app-display-results">
                {bookmarkData == "" ? "" : 
                    (bookmarkData.slice((bookmarkPage * PageLength), (bookmarkPage * PageLength) + PageLength).map( result =>
                        <div className= "app-results-component"> 
                            <div className= "app-results-component-details">
                                <img className= "app-results-component-poster" src={"https://image.tmdb.org/t/p/original/" + result.poster_path} onClick={() => {if (result.number_of_episodes == null) {navigate("/watch/m" + result.id)} else {navigate("/watch/t" + result.id)} }}/>
                                <div className= "app-results-component-info">
                                    <p className= "app-results-component-title">{result.name == null ? (result.title == null ? "Untitled" : result.title) : result.name}</p>
                                    <p className= "app-results-component-overview">{result.overview.slice(0, (PageLength == 4 ? 450 : 200))}</p>
                                    {result.overview.length > (PageLength == 4 ? 450 : 200) ? <button className= "app-results-component-expand" onClick={() => {document.getElementById("app-results-component-overview-expanded" + result.id).style.visibility = "visible"; document.getElementById("app-results-component-overview-expanded" + result.id).style.zIndex = 6}}>EXPAND</button> : null}
                                </div>  
                            </div>
                            <p className= "app-results-component-overview-expanded" id= {"app-results-component-overview-expanded" + result.id} onClick={() => {document.getElementById("app-results-component-overview-expanded" + result.id).style.visibility = "hidden"; document.getElementById("app-results-component-overview-expanded" + result.id).style.zIndex = -1}}>{result.overview}</p>
                            <div className= "app-results-component-options">
                                <div className= "app-results-component-options-top">
                                    {result.number_of_episodes == null ? 
                                    <p id="app-results-component-format" className= "app-results-component-format app-results-component-data app-movie">mv</p>
                                    :
                                    <p id="app-results-component-format" className= "app-results-component-format app-results-component-data app-tv">{result.number_of_episodes == null ? "mv" : "tv"}</p>
                                    }
                                    <p id="app-results-component-rating" className= "app-results-component-rating app-results-component-data" style={{background: `color-mix(in srgb, red ${( 1- result.vote_average/10) * 100}%, green ${(result.vote_average/10) * 100}%)`}}>{result.vote_average}</p>
                                    <p className= "app-results-component-language app-results-component-data">{result.original_language}</p>
                                    {result.first_air_date == null ? 
                                    (result.release_date == null ? <p className= "app-results-component-date app-results-component-data">0000-00-00</p> : <p className= "app-results-component-date app-results-component-data">{result.release_date}</p>) : <p className= "app-results-component-date app-results-component-data">{result.first_air_date}</p>}
                                    {result.origin_country == null ? <img className="app-results-component-country" src={`https://flagsapi.com/AQ/flat/64.png`}/> : <img className="app-results-component-country" src={`https://flagsapi.com/${result.origin_country[0]}/flat/64.png`}/>}
                                </div>
                                <div className= "app-results-component-options-bottom">
                                    <button className= "app-results-component-button" onClick={() => removeHandle(result.number_of_episodes == null, result.id, true)}>X</button>
                                </div>
                            </div>
                        </div>
                     ))
                    }
                </div>
            </div>

        </div>
    );
  }