import axios from 'axios'

export default function Authenticate(user, token, navigate) {
    axios({
        method: 'post',
        url: 'https://golden-hind.onrender.com/home',
        data: {
            user: user,
            token: token,
        }
    }).then((response) => {
        if (response.data == "UDE") {
            localStorage.removeItem("user")
            localStorage.removeItem("token")
            navigate('/auth')
        } else {
            return response.data
        }
    });
}