import { useNavigate } from "react-router-dom";
import React, { useState } from 'react'

let currentSetting = "login";
import Topbar from "../components/topbar"
let user = localStorage.getItem("user")


function Authorize() {

}

export default function Auth() {  
    const [status, setStatus] = useState(0);

    return (
        <div className= "auth-main">
          <Topbar/>
          {status == 0 ? <Login setStatus={setStatus}/> : <Registration setStatus={setStatus}/>}
        </div>
    );
}

export function Login({setStatus}) {
  return(
    <div className= "auth-holder">
      <p className= "auth-title" id= "auth-title">Login</p>

      <div className= "auth-box" id= "username-entry">
        <p className= "auth-box-info" id= "auth-box-info">Username</p>
        <input className= "auth-box-input" id= "auth-user-input"></input>
      </div>

      <div className= "auth-box" id= "password-entry">
        <p className= "auth-box-info" id= "auth-box-info">Password</p>
        <input className= "auth-box-input" id= "auth-pass-input" type= "password"></input>
      </div>

      <button className= "auth-entry">ENTER</button>
      <button className= "auth-switch" onClick={() => setStatus(1)} onMouseEnter={() => document.getElementById("auth-switch-underline").style.width = "12%"} onMouseLeave={() => document.getElementById("auth-switch-underline").style.width = "0%"}>Don't have an account?</button>
      <div className= "auth-switch-underline" id= "auth-switch-underline"/>
    </div>
  );
}

export function Registration ({setStatus}) {
  return(
    <div className= "auth-holder">
      <p className= "auth-title" id= "auth-title">Register</p>

      <div className= "auth-box" id= "username-entry">
        <p className= "auth-box-info" id= "auth-box-info">Username</p>
        <input className= "auth-box-input" id= "auth-user-input"></input>
      </div>

      <div className= "auth-box" id= "password-entry">
        <p className= "auth-box-info" id= "auth-box-info">Password</p>
        <input className= "auth-box-input" id= "auth-pass-input" type= "password"></input>
      </div>

      <button className= "auth-entry">ENTER</button>
      <button className= "auth-switch" onClick={() => setStatus(0)} onMouseEnter={() => document.getElementById("auth-switch-underline").style.width = "12%"} onMouseLeave={() => document.getElementById("auth-switch-underline").style.width = "0%"}>Already have an account?</button>
      <div className= "auth-switch-underline" id= "auth-switch-underline"/>
    </div>
  );
}