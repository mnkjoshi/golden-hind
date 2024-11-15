import { Outlet, useNavigate, useLocation } from "react-router-dom";
import axios from 'axios'
import Authenticate  from "../components/authenticate.jsx";
import React, { useEffect, useState } from 'react';
import Topbar from "../components/topbar"
let DisplayData

export default function App() {  
    let location = useLocation();
    const navigate = useNavigate();
    
    

    let user = localStorage.getItem("user")
    let token = localStorage.getItem("token")
    useEffect(() => {
        if (user == null) {
            navigate('/auth')
        } else {
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
            });
        }
    })

    return (
        <div className= "app-main" id= "app-main">
            <Topbar/>
        
            <div className= "app-display-continue">
                <p className= "app-display-continue-title">Continue Watching..</p>
                <div className= "app-display-continue-results">

                </div>
            </div>

            <div className= "app-display-bookmark">
                <p className= "app-display-bookmark-title">Bookmarked Content</p>
                <div className= "app-display-bookmark-results">
                    
                </div>
            </div>

            <div className= "app-display-row">
                <div className= "app-post-display">
                    <div className= "app-post-holder">

                    </div>
                    <p className= "app-post-quality">

                    </p>
                    <p className= "app-post-ratings">

                    </p>
                    <p className= "app-post-title">

                    </p>
                </div>
            </div>
        </div>
    );
  }