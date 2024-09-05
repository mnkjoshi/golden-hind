const express = require('express');

const app = express();

app.get('/', (request, response) => {
    response.status(200);
    response.send("Welcome to the app!")
});

app.listen(3000, (error) => {
    if (error == null) {
        console.log("Server now running on: http://localhost:3000")
    } else {
        console.log(error)
    }
});