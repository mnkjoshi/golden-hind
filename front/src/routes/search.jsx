import { useNavigate, useRouteError, useParams, useLocation } from "react-router-dom";
import React, { useEffect, useState } from 'react';
import axios from 'axios'
import Authenticate  from "../components/authenticate.jsx";
import Topbar from "../components/topbar"



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
                url: 'https://golden-hind.onrender.com/search',
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
                    {page == 0 ? null : 
                    <button className= "search-options-arrow" onClick={() => changePage(page - 1)}>
                        {"<"}
                    </button>
                    }
                    <p className= "search-options-title">
                        Page {page + 1}
                    </p>
                    {(page + 1) >= (results.length/8) ? null :
                    <button className= "search-options-arrow" onClick={() => changePage(page + 1)}>
                        {">"}
                    </button>
                    }
                    
                </div>
            </div>
            <div className= "search-results">
                {console.log(results)}
                {console.log(results.slice((page * 8), (page * 8) + 8))}
                {results === "" ? <p>Loading Results...</p> : 
                    (results.slice((page * 8), (page * 8) + 8)).map( result =>
                        <div className= "search-results-component"> 
                            <div className= "search-results-component-details">
                                <img className= "search-results-component-poster" src={"https://image.tmdb.org/t/p/original/" + result.poster_path} onClick={() => navigate("/watch/" + result.id)}/>
                                <div className= "search-results-component-info">
                                    <p className= "search-results-component-title">{result.name == null ? (result.title == null ? "Untitled" : result.title) : result.name}</p>
                                    <p className= "search-results-component-overview">{result.overview.slice(0, 570)}</p>
                                </div>  
                            </div>
                            <div className= "search-results-component-options">

                            </div>
                        </div>
                     ) 
                }
            </div>
        </div>
    );
  }

