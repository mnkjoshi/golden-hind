import { Outlet, useNavigate, useLocation, useParams } from "react-router-dom";
import axios from 'axios'
import React, { useEffect, useState } from 'react';
import Topbar from "../components/topbar"

import ListIcon from "../assets/list.png"
import BookmarkIcon from "../assets/bookmark.png"
import ReloadIcon from "../assets/reload.png"
import StarIcon from "../assets/star.png"
import ReviewIcon from "../assets/review.png"
import ServerIcon from "../assets/server.png"

let video = "https://gbf7wrqapjg1js045ye8.com/prorcp/ODc2ZTYxYmYwMGQ0MWI1MTUzNmQxN2JjOTVlZDUyMGI6YVdWalF5OHljRTVUZHpaWFFVRlVNWEJyWVdzMlpuVmxaREEyU2tFM2RtUnljU3RaUzB0dlpqTlJZbEF5TlRaUVJHUkNhME42WXprMFlXZEdNWEJXT1doVlJHOVBabFpETlhrNVIxQXlRWGRaTW5GdVJucGFNakJTVTB4TGIyZGlXRVJHV0c1R1RGZEpiVzVUZWxCYVkwdDBNVEp3SzFKa01ERXlZa2RqVHpsTFdtd3JhMGQwYTNkWmJ6TlROV042YnpCQ2VuZzRUbGxsZDBwbmRWaE9WMjVJTkVoSWJVTmhkRzVLTTBWemQzWkJiMGt3YzA1Vk1FZHNlRU5NY0dVNWNGTlhXamcwYkV4d2FsRlNablZqZWtkV1dtUm1NbFZhTmxwUVExQkdTbk5VYmxGME4zcFBRMkZuTUhoTWRXVkpRVzVrYVVJcmRVVnFSM2RCVVhoRlNVZzNhblVyYjBoRmVtOUJjRGR6TkV4RGNYUlpVazVOUkZkTVoweFdTbXREVlVNMUsyNUlkRVYzTVhKR1pEa3pUbEZZUjFSaE5VOVRMMm81UzJwbGJEaDBUblZSU1VaaU5rSlZPV05ZWmxST2NHSnhPVk5sZFRkMmJ6VlRjekpRUkVsR1NrWlVTVEZQZWpKRVZFRk9XbUZIVG1obmVVZzRZVkZsTjBoclMyVlRkRFY0YVRRcmVWaG5PRlYxV2pNNVprZEZTM1l5UkVOSWFYcHlhMVV6YjBoa1NVNW1NMkZHTTFOTGVUaEdUa1V2ZUdKbGRsTm1Ta2xQYWtOMVRqZ3pSemQzU2xJNWVqZENRVlZuUVZaQ2NWUTVOWEpuWm5GeU9GbDBkWGxTUlVSdmFqRmllbTlXWmxrNGFFMDNVVzVpY0dsQllVdE5ZMDlJYjBKaWNreEdZa0U0VUZSWGJuVlJhVVpsWVVKcVlsWjVVVXhDVUZjeWFYTkNNM0ZTV25sWFZGTXJTV3hMWkdkTEszZEtVMU5QYTFsVFYxQkJiR0ZOVDA1S1lubFJhbVZHYVZwME1XTXpORGxzUlZvMmRWVTFVazFxYTJKTVVsUXpUaTkzZWpBNGNuRnNUR05TTm1OcFlUaEhVVVJZVnpKb01FZHZWbE5GTTBWc05uRlhlRkkxY1ZNdlkwcDBVV053YkZKelRFSTNlVFZuY1dGcFJtNUNXamN2ZDFKRlZWaEhOelYwYWtWTWNWQlFTSFkzT0hkcmRsaGpWRGwwVURCNUt6UXdRM2huYUhKemRHbHlWMHRsVTNGMVZVVnVVUzlsUldJelRWTXlObTU0YkZGcGFIQlNhVGQzUkU5c1RYWnphV2htVEVZM2VIaEdhMjF6YzJsNUwyODRTbWhrYm1kSGFqZFRPVE5sTDFoVk4wTldPRk5qVlVaQmVYSkNRVGMwWlRrd01sZERWMWxsYUVzeFNFTjZaMjkxZWxOSWVXSjRhakpTU1dZdk4yTnBkRTVCTm1SdFp6bFFNVTFSYzNnd2EzWm9NMjlXWjJSRFlXUjVUbHBSYkVKTGExVnZTbXh6U0haVVRrbFJZbEJ4U1ZwNFNpdGFMM0ZWTW5NeGEzVnRja2MxWW5CSlRFNU9kRU5yYlhKRlZsWTBRVVpZT0dkMVFqbGxTMlJZUVhBMkt6WmFiSGRaZG5sM2JWUklZemxOT1dJck1IQmhheXR5U1RZelFrUlNVbUZwTTNWU2JXMUtZMHBKUkhnM1ZXUTJaVFp0V25Bd2VsWjNSRFU0UmpaTVlVOW9UbmxXT1dzeGJHRjNhblJCZG14SGVtODRhVU12TUdoSE5HcHNTMEo1UlhNeGVUUjJhMVpGVDFwVmFrVXdSRmR4SzJvMVJTdHRibGhZV2sxTWIxSnNNMnRTYzFwM2JVcHlMMFJTTTJSRldEaHdZV2xPUW5CWWJqWnNTMlY1WVZwSlRtUXhiRWxDVWxjcloxRnJZV0YyTUVvdlRESkViR1JPY1RkT2NIZHBlaXR2VWpoelMydGFXblpLU2s1T1oybE1lRzl1Y1RReVQzRlpTVkkyZDJGWlIweHJSVXhVYUZoV2VVWnhPR0owTkVGSU1FSnZSblJRV1NzelduQjVka05ETTNkc2JIVTJOVWgxWm5sWGIwRnVjM1owVHpCVVVtMUpZblJKU21GVlpqZFRWV1V5TkE9PQ--"

let DisplayData

export default function App() {  
    const [status, setStatus] = useState(0);
    const [movement, setMove] = useState(0);
    const [videoSrc, setVideoSrc] = useState(null);
    let location = useLocation();
    const navigate = useNavigate();
    const { id } = useParams();

    if (!(id == null)) {
        video = "https://vidlink.pro/movie/" + id + "?primaryColor=3FA3FF&secondaryColor=6db8ff&autoplay=true&poster=true"
    }
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

    window.open = function (open) {
        return function (url, name, features) {
            // set name if missing here
            console.log("window!")
        };
    }(window.open);

    const blockPopups = () => {
        const originalOpen = window.open;
        window.open = () => null; // Block all popup attempts
    
        // Ensure original open is restored after the iframe interaction
        setTimeout(() => {
            window.open = originalOpen;
        }, 10000); // Adjust based on interaction timing
    };
    
    useEffect(() => {
        blockPopups();
    }, []);
    
    return (
        <div className= "watch-main" id= "watch-main">
            <Topbar/>
            <div className= "watch-system">
                <div className= "watch-player">
                    <iframe className= "watch-player-file" id="watch-player-file" src= {video} frameBorder="0" allowFullScreen="yes" allow="autoplay"></iframe>
                </div>
                <div className= "watch-options">
                    <div className= "watch-left">
                        

                        <MovieDisplay/>

                        <div className= "watch-toggles1">
                            <button className = "watch-toggles-button watch-toggles-list" onClick={() => console.log("Test")}>
                                <img className = "watch-toggles-button-icon watch-toggles-list-icon" src = {ListIcon}/>
                            </button>
                            <button className = "watch-toggles-button watch-toggles-bookmark" onClick={() => console.log("Test")}>
                                <img className = "watch-toggles-button-icon watch-toggles-bookmark-icon" src = {BookmarkIcon}/>
                            </button>
                            <button className = "watch-toggles-button watch-toggles-reload" onClick={() => console.log("Test")}>
                                <img className = "watch-toggles-button-icon watch-toggles-reload-icon" src = {ReloadIcon}/>
                            </button>
                        </div>
                    </div>
                    <div className= "watch-right">
                        <div className= "watch-rating">
                            <div className= "watch-rating-info">
                                <p className= "watch-rating-score">
                                    5.0
                                </p>
                                <div className= "watch-rating-stars">
                                    <img className= "watch-star-icon" src= {StarIcon}/>
                                    <img className= "watch-star-icon" src= {StarIcon}/>
                                    <img className= "watch-star-icon" src= {StarIcon}/>
                                    <img className= "watch-star-icon" src= {StarIcon}/>
                                    <img className= "watch-star-icon" src= {StarIcon}/>
                                </div>
                            </div>
                            <div className= "watch-rating-underline"/>
                        </div>
                        <div className= "watch-toggles2">
                            <button className = "watch-toggles-button watch-toggles-server" onClick={() => console.log("Test")}>
                                <img className = "watch-toggles-button-icon watch-toggles-server-icon" src = {ServerIcon}/>
                            </button>
                            <button className = "watch-toggles-button watch-toggles-review" onClick={() => console.log("Test")}>
                                <img className = "watch-toggles-button-icon watch-toggles-review-icon" src = {ReviewIcon}/>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
  }

export function EpisodeDisplay() {
    return (
    <div className="watch-episode">
        <button className="watch-episode-arrow">{"<<"}</button>
        <div className="watch-episode-display">
            <p className="watch-episode-display-title">EPISODE NAME</p>
            <div className="watch-season-display">
                <button className="watch-season-arrow">{"<<"}</button>
                <p className="watch-season-title">SEASON 1</p>
                <button className="watch-season-arrow">{">>"}</button>
            </div>
        </div>
        <button className="watch-episode-arrow">{">>"}</button>
    </div>
    );
  }

export function MovieDisplay() {
    return (
    <div className= "watch-movie">
        <p className= "watch-movie-title">Movie Name</p>
    </div>
    );
}

  // <iframe id="player_iframe" src="https://gbf7wrqapjg1js045ye8.com/prorcp/NjFkNzc0YTU0YTBhZDI5OGZjYWQzYWYyNmNjNjk2MDc6Y1RGNVFuaFNia3BUUnpWa2RDdHpZMHQwVTJwaVNWUkNPVk41YlVKcVdGQnFiVTAyZDBGdVRGWnpSbXB5ZFVsMk4weFBZVWc0T0ZkeGNHMTBjMnM1WkhKV1JYZGFNVk5PVlU4MWJGWjVXbk52Y204eGVYUTNjbGR1TlUxYWRVMXBOMmRvTUd4RlpWUllkbkpVU2tGVlRFWkRNV2xuZFhWaE0xQkRWRTV6V21WMUt6bHhlR1UwWlU0M1owSk5aWHBPVURSbWNERlFWMkU1Y21sWU9WbExaVEJKVEd0SVJuWTFZaTl0TWxORmNrMW1RbEUzTjJkMVlsSkRhekZ1Um1sRlNXOW1XalJZZDJkbFdYcDNVWEpCWm1OaWVtUm9hR1o2Y25oMFN6TXlNbkV3Ukd0bFdVcFlVRFZzYUdSdlJWRXdNMjV2UlhCWmMwcE9XV1l5WnpKUVRWQnVibkpxS3pRMFNXUmthV3h1YkRSWFVXWkdiRFl5T1Rjd2RWWkVTbFpwZGxGNFRsTnVSakZLTDBWRVZuUTBLMU5EUmxsRGJEWkxlSEJTTDFsYU1XSmxTM2REVnpsR1lXaHpNRFpOV2paRWJVb3ZablpPV2k4NVZXeERNa1EzTURCS2FHSkVhV3Q0YTFvM1VtbHNSRzQwVFRNMWVqZFlSV3hxU21Kak4weFdWRXBxWjBkeGJqYzRWR05zVFRGdVFVeHRiRXR0WldadFRGVjFhek5LWmtkbVREaEphazVrUWpVMFJrbGlRMFpqYUd3dlQyNVljRUZuUld0SWFYZFhhbTFJTDBsQlZsSlhTVEJNT0dkQ2VYQm1jbVE0VkN0blIwdFljRGRGVkVZck1WVlliR2h2VXpkNk4zVkNMM0pCTDFBMGJFdzJlbWxZVm0xV1QxbEdibXBGWjNWTFJVbEpVR2hKWkZoVVpVdEpWa2wxVlhKTmNXdDRZMEpUYnpoQ2NIaEhNa2xvVkhad1VrdE9jRVpSZGxWUk1scFlUMmd4Y1hkaFRFOU1NV3hZZUU5ak9YaE9jRWhMYldSaFYzUkdkVFpuWkdWRWIyVnVPV0pNY0RWSE1FWmlaMmhDYVdoUlZFSjNjR1kzTjFaMGNXWkpWMGhIUVVFcmJuSmFjaXRvVlU5SFVtdzFjVkpWWTNob1RqQlBkV3BIWW1nM1FVaDJOMjVMYWsweWVXWmlTV2g1UkRKUVZ6UnNXRzVTVkVaQ09XcExjRUpsZDFJdmJVNUZXWEJZVG5sdVIyZHFheTlFU3paU09YRm1ZM0pRWmpoNVEwOUdjM2MwYlRkUE4wSmlaakl3VEc1T1JVSktkV1ZzTlVRMlNrZDVhRGxGYUhCd2FrRndiMEZ2YlVoTVlrVXZXbkZ1VUhWYVNEZFNiVXh4WW1oMFlWaFJibk42UVhsTGNsZEZkV3hsV0daWmVEaERiR1Z2TVhsSWNYVkZPR3B0WmpoT2NtRnBiWHBxYWs1bk5GWTNXRmM1ZDFscGJHOWxTbWx3WTBGUmRXRXZPR2xGYVhaNksxUnhWWGxzUld4eFFuUkpRbVpYVkdzdlJIVnNiMmRWWTFod2VVZFpjMjFoVEhadGMybEdiblZxV2xKVU1XTk5kR1pqY0Uxa2ExaHlPRlF2VlZoc2VWVTVUV05uUjJ3NUsxUjFTamwxYjFVdmR6UjFkbWxNZWt3elVWaFVlalZqWjNCcVNqTm1ZbWhJWVU1T1VYRTFOM1p1WkVVNVRtZG9RbFV5YVc1R2VUUTFMMFppVEVrMVQzSkpXR1JDYTFwSWJXaFZNV1ZFUld4WU5UTXdhMFppWkVOR2FWaGlLM1IwVm5oNGNUQmFkaXQyYUU5cWF6TkRZVnBKZFc1MlQxZFJabWRXUjBjeUsyRlRTMlZPSzNacmFWQmhNVlV2VUhsSFl6ZFRabGhZUkc4M2FFZG1ibXBxTnpsQlptbHhXR3BtSzI5bVVVdFRURWwwVDNvckwzVXJkRVowVDNaV1FWcHVaRTVFYVVKc1pXRjZORTB6UzJ3MFIwSnVTbE5FWmpsYU9Dc3JLMlJ6WTFSVmJFVlBTRnB0YTBKUGFIQkpkVkI0WWxSSldFUlVOSEJLU1UxTk5GSjVZVVp2VFhWWmVXRjBjVzlxVnpadGR6SjRLMEpxYjBGQ09IWnVaRzhyV2s5UE1tcFRZMjlLWVd4S2Rrb3ZhREJDVUdvclVUZ3lPRk16ZFRrcmJtYzBZMmhQVkhSV2FXcFpPV1phTXpOMGNqQmtUMVp0ZFRsWWRFcFRaaTluTVZkVlMxZHdLMlJNWVhGU1RqVmxhVVF2ZGxwVWJuVjNabEppU1ZvMFZUUk1lWFZFWm1WRllXOW5kVUZQY0dwcGRYTlRXbGhTVDJ0d1MwcERWbXhtTTFWclVGTjBUa056WTNFeGNuSnpkbm92UjNaS2FtZHlaejA5" frameborder="0" scrolling="no" allowfullscreen="yes" allow="autoplay"></iframe>