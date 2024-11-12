import { Outlet, useNavigate, useLocation } from "react-router-dom";
import axios from 'axios'
import React, { useEffect, useState } from 'react';
import Topbar from "../components/topbar"
let DisplayData

export default function App() {  
    const [status, setStatus] = useState(0);
    const [movement, setMove] = useState(0);
    const [videoSrc, setVideoSrc] = useState(null);
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
                DisplayData = response.data
            });
        }
    })
    

    useEffect(() => {
        fetch("https://gbf7wrqapjg1js045ye8.com/53f6d143-8366-4208-882d-7246fa7c097b", {
            mode: 'cors'
        })
        .then(response => response.blob())
        .then(blob => {
            const url = URL.createObjectURL(blob);
            setVideoSrc(url);
        })
        .catch(error => console.error("Error loading video:", error));
    }, []);

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