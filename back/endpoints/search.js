import axios from 'axios'

export default function Search(query) {
    axios({
        method: 'get',
        url: 'https://api.themoviedb.org/3/search/multi?query=' + query + '&api_key=' + process.env.TMDB_Credentials,
    }).then((response) => {
        let List = response.data["results"]
        for (let Index = 0; Index < List.length; Index++) {
            if (!(List[Index]["media_type"] == "tv" || List[Index]["media_type"] == "movie")) {
                List.splice(Index, 1)
            }
        }
        console.log(JSON.stringify(List))
        return List;
    });
}