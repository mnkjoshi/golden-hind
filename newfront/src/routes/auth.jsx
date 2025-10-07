import { useNavigate, useParams } from "react-router-dom";
import axios from 'axios'
import React, { useState, useEffect } from 'react'
import Topbar from "../components/topbar"

let infoToShow = "Nothing"
let infoType = "Error"
let NotificationCall
let notifyingLogin = false

export default function Auth() {  
    const [info, setInfo] = useState(0);
    const [status, setStatus] = useState(0);
    NotificationCall = setInfo
    const navigate = useNavigate();
    const { id } = useParams();
    let user = localStorage.getItem("user")

    useEffect(() => {
        if (!(user == null) && !notifyingLogin) {
            navigate('/app')
        }
        document.title = "The Golden Hind"
    })

    

    if(!(id == null)) {
      Verify(id, navigate)
    }

    return (
        <div className= "auth-main">
          <Topbar/>
          {status == 0 ? <Login setStatus={setStatus} navigate={navigate}/> : <Registration setStatus={setStatus}/>}
          {info == 0 ? null : <Notification/>}
        </div>
    );
}

function Verify(Token, navigate) {
  axios({
    method: 'post',
    url: 'https://golden-hind.onrender.com/verify',
    data: {
      token: Token,
    }
  }).then((response) => {
    console.log(response.data)
    if (response.data == "UVS") {
      Notify("Success", "Account verified! Please login.")
    } else {
      Notify("Error", "An unknown error occurred! Please try again later.")
    }
    navigate("/auth")
  });
}

function Notify(InfoType, Information) {
  infoToShow = Information
  infoType = InfoType
  NotificationCall(1)
  setTimeout(function() {
    document.getElementById("auth-notification").style.opacity = 1
  }, 10)
  setTimeout(function() {
    document.getElementById("auth-notification").style.opacity = 0;
    setTimeout(function() {
      NotificationCall(0)
    }, 300)
  }, 2700)
}

function Attempt(Which, Username, Password, Email, navigate) {
  if (Which == "Login") {
    if (Username == "" || Password == "") {
      Notify("Error", "Missing information!");
      return null
    }
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
        notifyingLogin = true
        Notify("Success", `Ahoy there, ${response.data.username}! Redirecting to the Golden Hind.`)
        setTimeout(function() {
          notifyingLogin = false
          navigate("/app")
        }, 2000)
      } else {
        console.log(response.data)
        switch (response.data) {
          case "UNV":
            Notify("Error", "Verify to login! Another email has been sent to your inbox.")
            break;
          case "ILD":
            Notify("Error", "Incorrect login details!")
            break;
          default:
            Notify("Error", "An unknown error has occurred!")
        }
      }
    });
  } else {
      if (Username == "" || Password == "" || Email == "") {
        Notify("Error", "Missing information!")
        return null
      }
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
            Notify("Error", "Username is taken, try another name!")
            break;
          case "ET":
            Notify("Error", "Username is taken, try another name!", "This email account is already registered! Try logging in?")
            break;
          case "UCS":
            Notify("Success", "Account created successfully! Check your email and SPAM folder to verify!");
            break;
          default:
            Notify("Error", "An unknown error has occurred!")
        }
      });
  }
}

export function Notification() {
  const notificationClass = `auth-notification ${infoType.toLowerCase()}`;
  
  return (
    <div className={notificationClass} id="auth-notification">
      <p className="auth-notification-info">{infoToShow}</p>
    </div>
  )
}

export function Login({setStatus, navigate}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isLoading) return;
    
    const newErrors = {};
    if (!username.trim()) newErrors.username = true;
    if (!password.trim()) newErrors.password = true;
    
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;
    
    setIsLoading(true);
    await Attempt("Login", username, password, null, navigate);
    setIsLoading(false);
  };

  const handleKeyPress = (event) => {
    if (event.key === "Enter" && !isLoading) {
      handleSubmit(event);
    }
  };

  return(
    <div className="auth-holder">
      <h1 className="auth-title">Welcome Back</h1>
      
      <form onSubmit={handleSubmit} style={{width: '100%'}}>
        <div className="auth-box">
          <label className="auth-box-info" htmlFor="username">Username</label>
          <input 
            className={`auth-box-input ${errors.username ? 'invalid' : ''}`}
            id="username"
            type="text"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              if (errors.username) setErrors(prev => ({...prev, username: false}));
            }}
            onKeyPress={handleKeyPress}
            placeholder="Enter your username"
            autoComplete="username"
            disabled={isLoading}
          />
        </div>

        <div className="auth-box">
          <label className="auth-box-info" htmlFor="password">Password</label>
          <input 
            className={`auth-box-input ${errors.password ? 'invalid' : ''}`}
            id="password"
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (errors.password) setErrors(prev => ({...prev, password: false}));
            }}
            onKeyPress={handleKeyPress}
            placeholder="Enter your password"
            autoComplete="current-password"
            disabled={isLoading}
          />
        </div>

        <button 
          type="submit"
          className={`auth-entry ${isLoading ? 'loading' : ''}`}
          disabled={isLoading}
        >
          {isLoading ? '' : 'Sign In'}
        </button>
      </form>
      
      <button 
        className="auth-switch" 
        onClick={() => setStatus(1)}
        onMouseEnter={(e) => {
          const underline = e.target.nextElementSibling;
          if (underline) underline.style.width = '100%';
        }}
        onMouseLeave={(e) => {
          const underline = e.target.nextElementSibling;
          if (underline) underline.style.width = '0%';
        }}
        disabled={isLoading}
      >
        Don't have an account? Sign up
      </button>
      <div className="auth-switch-underline"/>
    </div>
  );
}

export function Registration ({setStatus}) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const validateEmail = (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isLoading) return;
    
    const newErrors = {};
    if (!username.trim()) newErrors.username = true;
    if (!email.trim()) newErrors.email = true;
    else if (!validateEmail(email)) newErrors.email = true;
    if (!password.trim()) newErrors.password = true;
    else if (password.length < 6) newErrors.password = true;
    
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;
    
    setIsLoading(true);
    await Attempt("Register", username, password, email);
    setIsLoading(false);
  };

  const handleKeyPress = (event) => {
    if (event.key === "Enter" && !isLoading) {
      handleSubmit(event);
    }
  };

  return(
    <div className="auth-holder">
      <h1 className="auth-title">Create Account</h1>
      
      <form onSubmit={handleSubmit} style={{width: '100%'}}>
        <div className="auth-box">
          <label className="auth-box-info" htmlFor="reg-username">Username</label>
          <input 
            className={`auth-box-input ${errors.username ? 'invalid' : ''}`}
            id="reg-username"
            type="text"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              if (errors.username) setErrors(prev => ({...prev, username: false}));
            }}
            onKeyPress={handleKeyPress}
            placeholder="Choose a username"
            autoComplete="username"
            disabled={isLoading}
          />
        </div>

        <div className="auth-box">
          <label className="auth-box-info" htmlFor="reg-email">Email Address</label>
          <input 
            className={`auth-box-input ${errors.email ? 'invalid' : ''}`}
            id="reg-email"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (errors.email) setErrors(prev => ({...prev, email: false}));
            }}
            onKeyPress={handleKeyPress}
            placeholder="Enter your email"
            autoComplete="email"
            disabled={isLoading}
          />
        </div>

        <div className="auth-box">
          <label className="auth-box-info" htmlFor="reg-password">Password</label>
          <input 
            className={`auth-box-input ${errors.password ? 'invalid' : ''}`}
            id="reg-password"
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (errors.password) setErrors(prev => ({...prev, password: false}));
            }}
            onKeyPress={handleKeyPress}
            placeholder="Create a password (min. 6 characters)"
            autoComplete="new-password"
            disabled={isLoading}
          />
        </div>

        <button 
          type="submit"
          className={`auth-entry ${isLoading ? 'loading' : ''}`}
          disabled={isLoading}
        >
          {isLoading ? '' : 'Create Account'}
        </button>
      </form>
      
      <button 
        className="auth-switch" 
        onClick={() => setStatus(0)}
        onMouseEnter={(e) => {
          const underline = e.target.nextElementSibling;
          if (underline) underline.style.width = '100%';
        }}
        onMouseLeave={(e) => {
          const underline = e.target.nextElementSibling;
          if (underline) underline.style.width = '0%';
        }}
        disabled={isLoading}
      >
        Already have an account? Sign in
      </button>
      <div className="auth-switch-underline"/>
    </div>
  );
}