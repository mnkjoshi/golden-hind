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
            Authenticate(user, token, navigate);
        }
    })

    return (
        <div className= "app-main" id= "app-main">
            <Topbar/>
        
            <div className= "app-display-continue">

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