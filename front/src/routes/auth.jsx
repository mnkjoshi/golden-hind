import { useNavigate, useParams } from "react-router-dom";
import axios from 'axios'
import React, { useState, useEffect } from 'react'
import Topbar from "../components/topbar"

let infoToShow = "Nothing"
let infoType = "Error"

export default function Auth() {  
    const [info, setInfo] = useState(0);
    const [status, setStatus] = useState(0);
    
    const navigate = useNavigate();
    const { id } = useParams();
    let user = localStorage.getItem("user")

    useEffect(() => {
        if (!(user == null)) {
            navigate('/app')
        }
    })

    if(!(id == null)) {
      Verify(id)
    }

    return (
        <div className= "auth-main">
          <Topbar/>
          {status == 0 ? <Login setStatus={setStatus} setInfo= {setInfo}/> : <Registration setStatus={setStatus} setInfo= {setInfo}/>}
          {info == 0 ? null : <Notification/>}
        </div>
    );
}

function Verify(Token) {
  axios({
    method: 'post',
    url: 'https://golden-hind.onrender.com/verify',
    data: {
      token: Token,
    }
  }).then((response) => {
    console.log(response.data)
  });
}

function Attempt(Which, Username, Password, Email, SetInfo) {
  if (Which == "Login") {
    axios({
      method: 'post',
      url: 'https://golden-hind.onrender.com/login',
      data: {
        username: Username,
        password: Password
      }
    }).then((response) => {
      console.log(response.status)
      if (response.status == 200) {
        localStorage.setItem("user", response.data.username)
        localStorage.setItem("token", response.data.token)
      } else {
        console.log(response.data)
        
        switch (response.data) {
          case "UNV":
            infoToShow = "Verify to login! Another email has been sent to your inbox.";
            infoType = "Error"
            break;
          case "ILD":
            infoToShow = "Incorrect login details!";
            infoType = "Error"
            break;
          default:
            infoToShow = "Unknown error has occurred!"
            infoType = "Error"
        }
        SetInfo(1);
      }
    });
  } else {
      axios({
        method: 'post',
        url: 'https://golden-hind.onrender.com/register',
        data: {
          username: Username,
          password: Password,
          email: Email,
        }
      }).then((response) => {
        console.log(response.status)
        console.log(response.data)
        switch (response.data) {
          case "UNT":
            infoToShow = "Username is taken, try another name!";
            infoType = "Error"
            break;
          case "ET":
            infoToShow = "This email account is already registered! Try logging in?";
            infoType = "Error"
            break;
          case "UCS":
            infoToShow = "Account created successfully! Check your email and SPAM folder to verify!";
            infoType = "Warn"
            break;
          default:
            infoToShow = "Unknown error has occurred!"
            infoType = "Error"
        }
        SetInfo(1);
    });
  }
}

export function Notification() {
  let color = "#21982d";
  if (infoType == "Error") {
    color = "#982121"
  } else if(infoType == "Warn") {
    color = "#edd81b"
  }
  return (
    <div className= "auth-notification" style= {`background-color:${color};`}>
      <p className= "auth-notification-info">{infoToShow}</p>
    </div>
  )
}

export function Login({setStatus, setInfo}) {
  return(
    <div className= "auth-holder">
      <p className= "auth-title" id= "auth-title">Login</p>

      <div className= "auth-box" id= "username-entry">
        <p className= "auth-box-info" id= "auth-box-user">Username</p>
        <input className= "auth-box-input" id= "auth-user-input"></input>
      </div>

      <div className= "auth-box" id= "password-entry">
        <p className= "auth-box-info" id= "auth-box-pass">Password</p>
        <input className= "auth-box-input" id= "auth-pass-input" type= "password"></input>
      </div>

      <button className= "auth-entry" onClick={() => Attempt("Login", document.getElementById("auth-user-input").value, document.getElementById("auth-pass-input").value, null, setInfo)}>ENTER</button>
      <button className= "auth-switch" onClick={() => setStatus(1)} onMouseEnter={() => document.getElementById("auth-switch-underline").style.width = "12%"} onMouseLeave={() => document.getElementById("auth-switch-underline").style.width = "0%"}>Don't have an account?</button>
      <div className= "auth-switch-underline" id= "auth-switch-underline"/>
    </div>
  );
}

export function Registration ({setStatus, setInfo}) {
  return(
    <div className= "auth-holder">
      <p className= "auth-title" id= "auth-title">Register</p>

      <div className= "auth-box" id= "username-entry">
        <p className= "auth-box-info" id= "auth-box-user">Username</p>
        <input className= "auth-box-input" id= "auth-user-input"></input>
      </div>

      <div className= "auth-box" id= "email-entry">
        <p className= "auth-box-info" id= "auth-box-email">Email</p>
        <input className= "auth-box-input" id= "auth-email-input"></input>
      </div>

      <div className= "auth-box" id= "password-entry">
        <p className= "auth-box-info" id= "auth-box-pass">Password</p>
        <input className= "auth-box-input" id= "auth-pass-input" type= "password"></input>
      </div>

      <button className= "auth-entry">ENTER</button>
      <button className= "auth-switch" onClick={() => setStatus(0)} onMouseEnter={() => document.getElementById("auth-switch-underline").style.width = "12%"} onMouseLeave={() => document.getElementById("auth-switch-underline").style.width = "0%"}>Already have an account?</button>
      <div className= "auth-switch-underline" id= "auth-switch-underline"/>
    </div>
  );
}