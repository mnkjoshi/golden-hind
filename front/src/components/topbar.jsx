import { useNavigate, useLocation } from "react-router-dom";
import DropDown from "../assets/dropDown.png"
import React, { useState } from 'react'
let currRotation = 180;

function DropTable(toggle, data, currentStatus) {
    console.log(document.getElementById("topbar-main"))
    switch(toggle) {
        case 0: //drop it
            currRotation += 180;
            document.getElementById("topbar-account-arrow").style.transform = "rotate(" + currRotation + "deg)"
            document.getElementById("topbar-dropdown").style.transform = "translateY(0px)";
            document.getElementById("topbar-dropdown").style.opacity = 1;
            document.getElementById("topbar-main").style.zIndex = 2;
            document.getElementById("topbar-dropdown").style.zIndex = 10;
            data(1);
            break;
        case 1: //lift it
            currRotation += 180;
            document.getElementById("topbar-account-arrow").style.transform = "rotate(" + currRotation + "deg)"
            document.getElementById("topbar-dropdown").style.transform = "translateY(-15px)";
            document.getElementById("topbar-dropdown").style.opacity = 0;
            document.getElementById("topbar-main").style.zIndex = 1;
            document.getElementById("topbar-dropdown").style.zIndex = -1;
            data(0);
            break;
        case 4:
            if (currentStatus == 1) {
                if (localStorage.getItem("user")) {
                    localStorage.removeItem("user");
                    localStorage.removeItem("token");
                    data("/auth");
                    DropTable(1);
                }
            }
    }
}

export default function Topbar ({ Account }) {
    const [status, setStatus] = useState(0);
    const navigate = useNavigate();
    const location = useLocation();

    function KeyUpSearch(event) {
        if (event.key == "Enter") {navigate('/search', {
            state: {searched: document.getElementById("topbar-search-input").value}
        }
    )}
    }

    function OnInputSearch() {
        if (location.pathname == "/search") { navigate('/search', {
            state: {searched: document.getElementById("topbar-search-input").value}
        }
    )}
    }

    return (
        <div className= "topbar-main" id= "topbar-main">
            <button className= "topbar-title" onClick={() => navigate("/app")}>TGH</button>
            <div className= "topbar-gap"/>
            <div className= "topbar-search">
                <input className= "topbar-search-input" placeholder= "Search.." id= "topbar-search-input" onKeyUp={KeyUpSearch} autoComplete="off"
                />
                <div className= "topbar-search-underline"/>
            </div>
            <div className= "topbar-account">
                <img className= "topbar-account-arrow" id= "topbar-account-arrow" src= {DropDown}/>
                <p className= "topbar-account-display">{localStorage.getItem("user") == null ? "Unknown" : localStorage.getItem("user")}</p>
                <div className= "topbar-dropdown" id= "topbar-dropdown">
                    <button className= "topbar-dropdown-option" onClick={() => DropTable(2)}>Account</button>
                    <button className= "topbar-dropdown-option" onClick={() => DropTable(3)}>Activity</button>
                    <button className= "topbar-dropdown-option" onClick={() => DropTable(4, navigate, status)}>Logout</button>
                </div>
                <button className= "topbar-account-button" onClick= {() => DropTable(status, setStatus)}>
                    HOLDER
                </button>
            </div>
        </div>
    );
}

