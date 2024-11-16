import { useNavigate, useRouteError, useParams, useLocation } from "react-router-dom";
import React, { useEffect, useState } from 'react';
import axios from 'axios'
import Authenticate  from "../components/authenticate.jsx";
import Topbar from "../components/topbar"

import BookmarkIcon from "../assets/bookmark.png"
import StarIcon from "../assets/star.png"



export default function Search() {  
    const navigate = useNavigate();
    const [results, displayResults] = useState("");
    const [currSearch, UpdateSearch] = useState("");
    const [page, changePage] = useState(0);
    const { state } = useLocation();
    const { searched } = state;
    
    let user = localStorage.getItem("user")
    let token = localStorage.getItem("token")
    useEffect(() => {
        if (user == null) {
            navigate('/auth')
        } else {
            Authenticate(user, token, navigate);
        }
        console.log(searched)
        if (!(searched === currSearch)) {
            axios({
                method: 'post',
                url: 'https:/golden-hind.onrender.com/search',
                data: {
                    query: searched,
                }
            }).then((response) => {
                UpdateSearch(searched)
                changePage(0)
                displayResults(response.data)
            });
        } 
    })

    

    return (
        <div className= "search-main">
            <Topbar/>
            <div className= "search-title-options">
                <p className="search-title">
                    Results for "{searched}":
                </p>
                <div className= "search-options">
                    {page == 0 ? 
                    <button className= "search-options-arrow" onClick={() => changePage(page - 1)}>
                        {" "}
                    </button>
                    : 
                    <button className= "search-options-arrow" onClick={() => changePage(page - 1)}>
                        {"<"}
                    </button>
                    }
                    <p className= "search-options-title">
                        Page {page + 1}
                    </p>
                    {(page + 1) >= (results.length/8) ? 
                    <button className= "search-options-arrow">
                        {" "}
                    </button>
                    :
                    <button className= "search-options-arrow" onClick={() => changePage(page + 1)}>
                        {">"}
                    </button>
                    }
                    
                </div>
            </div>
            <div className= "search-results">
                {console.log(results)}
                {console.log(results.slice((page * 8), (page * 8) + 8))}
                {results === "" ? <p className= "search-results-loading">Loading Results...</p> : 
                    (results.slice((page * 8), (page * 8) + 8)).map( result =>
                        <div className= "search-results-component"> 
                            <div className= "search-results-component-details">
                                <img className= "search-results-component-poster" src={"https://image.tmdb.org/t/p/original/" + result.poster_path} onClick={() => {if (result.media_type == "movie") {navigate("/watch/m" + result.id)} else {navigate("/watch/t" + result.id)} }}/>
                                <div className= "search-results-component-info">
                                    <p className= "search-results-component-title">{result.name == null ? (result.title == null ? "Untitled" : result.title) : result.name}</p>
                                    <p className= "search-results-component-overview">{result.overview.slice(0, 450)}</p>
                                    {result.overview.length > 450 ? <button className= "search-results-component-expand" onClick={() => {document.getElementById("search-results-component-overview-expanded" + result.id).style.visibility = "visible"; document.getElementById("search-results-component-overview-expanded" + result.id).style.zIndex = 6}}>EXPAND</button> : null}
                                </div>  
                            </div>
                            <p className= "search-results-component-overview-expanded" id= {"search-results-component-overview-expanded" + result.id} onClick={() => {document.getElementById("search-results-component-overview-expanded" + result.id).style.visibility = "hidden"; document.getElementById("search-results-component-overview-expanded" + result.id).style.zIndex = -1}}>{result.overview}</p>
                            <div className= "search-results-component-options">
                                <div className= "search-results-component-options-top">
                                    {result.media_type == "movie" ? 
                                    <p id="search-results-component-format" className= "search-results-component-format search-results-component-data search-movie">mv</p>
                                    :
                                    <p id="search-results-component-format" className= "search-results-component-format search-results-component-data search-tv">{result.media_type}</p>
                                    }
                                    <p id="search-results-component-rating" className= "search-results-component-rating search-results-component-data" style={{background: `color-mix(in srgb, red ${( 1- result.vote_average/10) * 100}%, green ${(result.vote_average/10) * 100}%)`}}>{result.vote_average}</p>
                                    <p className= "search-results-component-language search-results-component-data">{result.original_language}</p>
                                    {result.first_air_date == null ? 
                                    (result.release_date == null ? <p className= "search-results-component-date search-results-component-data">0000-00-00</p> : <p className= "search-results-component-date search-results-component-data">{result.release_date}</p>) : <p className= "search-results-component-date search-results-component-data">{result.first_air_date}</p>}
                                    {result.origin_country == null ? <img className="search-results-component-country" src={`https://flagsapi.com/AQ/flat/64.png`}/> : <img className="search-results-component-country" src={`https://flagsapi.com/${result.origin_country[0]}/flat/64.png`}/>}
                                </div>
                                <div className= "search-results-component-options-bottom">

                                </div>
                            </div>
                        </div>
                     ) 
                }
            </div>
        </div>
    );
  }

