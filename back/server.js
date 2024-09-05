const express = require('express');

const app = express();

app.get('/', (request, response) => {
    response.status(200);
    response.send("Welcome to the app!")
});

const listener = app.listen(process.env.PORT, (error) => {
    if (error == null) {
        console.log("Server now running on port " + listener.address().port)
        console.log("http://localhost:" + listener.address().port)
    } else {
        console.log(error)
    }
});