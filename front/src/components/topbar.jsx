import { useNavigate } from "react-router-dom";
import DropDown from "../assets/dropDown.png"
import React, { useState } from 'react'
let currRotation = 180;

function DropTable(toggle, data) {
    console.log(toggle)
    switch(toggle) {
        case 0: //drop it
            currRotation += 180;
            document.getElementById("topbar-account-arrow").style.transform = "rotate(" + currRotation + "deg)"
            document.getElementById("topbar-dropdown").style.transform = "translateY(0px)";
            document.getElementById("topbar-dropdown").style.opacity = 1;
            data(1);
            break;
        case 1: //lift it
            currRotation += 180;
            document.getElementById("topbar-account-arrow").style.transform = "rotate(" + currRotation + "deg)"
            document.getElementById("topbar-dropdown").style.transform = "translateY(-15px)";
            document.getElementById("topbar-dropdown").style.opacity = 0;
            data(0);
            break;
        case 4:
            if (localStorage.getItem("user")) {
                localStorage.removeItem("user");
                localStorage.removeItem("token");
                data("/auth");
                DropTable(1);
            }
    }
}

export default function Topbar ({ Account }) {
    const [status, setStatus] = useState(0);
    const navigate = useNavigate();

    return (
        <div className= "topbar-main">
            <button className= "topbar-title" onClick={() => navigate("/app")}>TGH</button>
            <div className= "topbar-gap"/>
            <div className= "topbar-search">
                <input className= "topbar-search-input" placeholder= "Search.." id= "topbar-search-input" onKeyUp={(event) => { if (event.key == "Enter") {navigate('/search', {
                    
                    state: {searched: document.getElementById("topbar-search-input").value}})}}}
                />
                <div className= "topbar-search-underline"/>
            </div>
            <div className= "topbar-account">
                <img className= "topbar-account-arrow" id= "topbar-account-arrow" src= {DropDown}/>
                <p className= "topbar-account-display">{localStorage.getItem("user") == null ? "Unknown" : localStorage.getItem("user")}</p>
                <div className= "topbar-dropdown" id= "topbar-dropdown">
                    <button className= "topbar-dropdown-option" onClick={() => DropTable(2)}>Account</button>
                    <button className= "topbar-dropdown-option" onClick={() => DropTable(3)}>Activity</button>
                    <button className= "topbar-dropdown-option" onClick={() => DropTable(4, navigate)}>Logout</button>
                </div>
                <button className= "topbar-account-button" onClick= {() => DropTable(status, setStatus)}>
                    HOLDER
                </button>
            </div>
        </div>
    );
}

