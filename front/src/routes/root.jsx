import { Outlet, useNavigate, useLocation } from "react-router-dom";
let currentRoute = 1;
let device = 1;
let transferring = false;
import React, { useState } from 'react'

import hind_entry from "../assets/HindEntry.png";


function Landing() {
    setTimeout(function() {
        document.getElementById("landing-welcome").style.opacity = 1
        document.getElementById("landing-welcome").style.transform = "translateY(10px)"
        setTimeout(function() {
            document.getElementById("landing-title").style.opacity = 1
            document.getElementById("landing-banner").style.opacity = 1
            setTimeout(function() {
                document.getElementById("landing-entry").style.opacity = 1
            }, 1500)
        }, 1000)
    }, 1000)
}



Landing();

function Clear(navigate) {
    document.getElementById("landing-welcome").style.opacity = 0
    document.getElementById("landing-title").style.opacity = 0
    document.getElementById("landing-banner").style.opacity = 0
    document.getElementById("landing-entry").style.opacity = 0
    document.getElementById("landing-entry-underline").style.opacity = 0
    setTimeout(function() {
        navigate("/auth")
    }, 1200)
}

export default function Root() {  
    const [status, setStatus] = useState(0);
    const [movement, setMove] = useState(0);
    let location = useLocation();
    const navigate = useNavigate();
    
    let first = localStorage.getItem("initial")
    if (!(first == null)) {
        navigate('/auth')
    }

    return (
        <div className= "landing-main" id= "landing-main">
            <p className= "landing-welcome" id= "landing-welcome">Welcome to</p>
            <p className= "landing-title" id= "landing-title"><span className= "landing-title-special">T</span>he <span className= "landing-title-special">G</span>olden <span className= "landing-title-special">H</span>ind</p>
            <img className= "landing-banner" id= "landing-banner" src= {hind_entry}></img>
            <button className= "landing-entry" id= "landing-entry" onClick= {() => Clear(navigate)} onMouseEnter={() => document.getElementById("landing-entry-underline").style.width = "10%"} onMouseLeave={() => document.getElementById("landing-entry-underline").style.width = "0%"}>ENTER</button>
            <div className= "landing-entry-underline" id= "landing-entry-underline"/>
        </div>
    );
  }