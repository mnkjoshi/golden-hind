import { useNavigate, useRouteError, useParams, useLocation } from "react-router-dom";
import React, { useEffect, useState } from 'react';
import axios from 'axios'
import Authenticate  from "../components/authenticate.jsx";
import Topbar from "../components/topbar"



export default function Search() {  
    const navigate = useNavigate();
    const { state } = useLocation();
    const { searched } = state;

    let SearchResults = null;

    let user = localStorage.getItem("user")
    let token = localStorage.getItem("token")
    useEffect(() => {
        if (user == null) {
            navigate('/auth')
        } else {
            Authenticate(user, token, navigate);
        }
    })

    axios({
        method: 'post',
        url: 'https://golden-hind.onrender.com/search',
        data: {
            query: searched,
        }
    }).then((response) => {
        console.log(response.data)
    });

    return (
        <div className= "search-main">
            <Topbar/>
            <p className="search-title">
                Results for "{searched}":
            </p>
            <div className= "search-results">
                {SearchResults ? SearchResults.stack.map( result =>
                    <div className= "search-results-component"> 
                        <img className= "search-results-component-poster"/>
                    </div>
                 ) : "Loading Results.."}
            </div>
        </div>
    );
  }

