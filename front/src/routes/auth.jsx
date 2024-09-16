import { useNavigate, useParams } from "react-router-dom";
import axios from 'axios'
import React, { useState, useEffect } from 'react'
import Topbar from "../components/topbar"
let infoToShow = "Nothing"

export default function Auth() {  
    const [status, setStatus] = useState(0);
    const [info, setInfo] = useState(0);
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
          {status == 0 ? <Login setStatus={setStatus}/> : <Registration setStatus={setStatus}/>}
          <InfoBox/>
          {/* {info == 0 ? null : <InfoBox/>} */}
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

function Attempt(Which, Username, Password, Email) {
  if (Which == "Login") {
    axios({
      method: 'post',
      url: 'https://golden-hind.onrender.com/login',
      data: {
        username: Username,
        password: Password
      }
    }).then((response) => {
      console.log(response.data)
      localStorage.setItem("user", response.data.username)
      localStorage.setItem("token", response.data.token)
    });
  }
}

export function InfoBox({}) {

}

export function Login({setStatus}) {
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

      <button className= "auth-entry" onClick={() => Attempt("Login", document.getElementById("auth-user-input").value, document.getElementById("auth-pass-input").value)}>ENTER</button>
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