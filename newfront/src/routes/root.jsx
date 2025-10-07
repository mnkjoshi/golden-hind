import { Outlet, useNavigate, useLocation } from "react-router-dom";
import React, { useEffect, useState } from 'react'

import hind_entry from "../assets/HindEntry.png";

export default function Root() {  
    const navigate = useNavigate();
    const [isAnimating, setIsAnimating] = useState(false);
    const [showContent, setShowContent] = useState(false);
    
    let first = localStorage.getItem("initial")
    let user = localStorage.getItem("user")

    useEffect(() => {
        if (!(first == null)) {
            if (!(user == null)) {
                navigate('/app')
            } else {
                navigate('/auth')
            }
        } else {
            // Start entrance animation
            setTimeout(() => setShowContent(true), 500);
        }
    }, [])

    const handleEnter = () => {
        if (isAnimating) return;
        
        setIsAnimating(true);
        localStorage.setItem("initial", "complete");
        
        setTimeout(() => {
            navigate("/auth")
        }, 1000);
    };

    return (
        <div className={`landing-main ${showContent ? 'show' : ''} ${isAnimating ? 'exit' : ''}`}>
            {/* Animated Background Elements */}
            <div className="landing-ocean">
                <div className="wave wave1"></div>
                <div className="wave wave2"></div>
                <div className="wave wave3"></div>
            </div>
            
            <div className="landing-particles">
                {[...Array(20)].map((_, i) => (
                    <div key={i} className={`particle particle-${i + 1}`}></div>
                ))}
            </div>
            
            <div className="landing-fog">
                <div className="fog fog1"></div>
                <div className="fog fog2"></div>
                <div className="fog fog3"></div>
            </div>

            {/* Main Content */}
            <div className="landing-content">
                <div className="landing-welcome-container">
                    <p className="landing-welcome">Welcome to the</p>
                    <div className="landing-title-container">
                        <h1 className="landing-title">
                            <span className="landing-title-word">
                                <span className="landing-title-special accent-gold">G</span>olden
                            </span>
                            <span className="landing-title-word">
                                <span className="landing-title-special accent-gold">H</span>ind
                            </span>
                        </h1>
                        <div className="landing-subtitle"></div>
                    </div>
                </div>
                
                <div className="landing-ship-container">
                    <img className="landing-banner" src={hind_entry} alt="The Golden Hind" />
                    <div className="ship-glow"></div>
                </div>
                
                <div className="landing-entry-container">
                    <button 
                        className="landing-entry" 
                        onClick={handleEnter}
                        disabled={isAnimating}
                    >
                        <span className="btn-text">Get Started</span>
                        <div className="btn-ripple"></div>
                    </button>
                </div>
            </div>
            
            {/* Atmospheric Effects */}
            <div className="treasure-glow treasure-glow-1"></div>
            <div className="treasure-glow treasure-glow-2"></div>
            <div className="treasure-glow treasure-glow-3"></div>
        </div>
    );
  }