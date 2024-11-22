# The Golden Hind


<p align="center">
  <img src="https://github.com/mnkjoshi/golden-hind/blob/main/front/src/assets/HindEntry.png" alt="The Golden Hind Logo">
</p>

<p align="center">
  The Golden Hind is a comprehensive media management application designed to help users keep track of their favorite TV shows, movies, and series. The application provides a robust backend with various endpoints for retrieving media details, adding and removing favorites, and managing user authentication. The frontend is built using modern web technologies and offers a seamless user experience for browsing and managing media content.
</p>


### Key Features
- **Retrieve Media Details**: Users can retrieve detailed information about TV episodes, movies, and series.
- **Manage Favorites**: Users can add or remove media items from their favorites list.
- **User Authentication**: Secure user authentication to ensure personalized media management.
- **Responsive Frontend**: A responsive and user-friendly frontend built with Vite and modern web technologies.
- **Deployment Ready**: Easy deployment using Firebase for the frontend.

### Technologies Used
- **Backend**: Node.js, Express.js
- **Frontend**: Vite, React
- **Database**: Firebase
- **APIs**: The Movie Database (TMDB), SendGrid for email services

This project aims to provide a seamless and efficient way for users to manage their media content, ensuring they never miss an episode or movie they love.

## Backend Endpoints

### Authentication
- **POST `/eretrieve`**
  - **Description**: Retrieve episode details.
  - **Request Body**:
    ```json
    {
      "user": "string",
      "token": "string",
      "series": "string",
      "season": "number",
      "episode": "number"
    }
    ```
  - **Responses**:
    - `200 OK`: Returns episode details.
    - `202 Accepted`: Unauthorized or error occurred.

- **POST `/mretrieve`**
  - **Description**: Retrieve movie details.
  - **Request Body**:
    ```json
    {
      "user": "string",
      "token": "string",
      "movie": "string"
    }
    ```
  - **Responses**:
    - `200 OK`: Returns movie details.
    - `202 Accepted`: Unauthorized or error occurred.

- **POST `/sretrieve`**
  - **Description**: Retrieve series details.
  - **Request Body**:
    ```json
    {
      "user": "string",
      "token": "string",
      "series": "string"
    }
    ```
  - **Responses**:
    - `200 OK`: Returns series details.
    - `202 Accepted`: Unauthorized or error occurred.

- **POST `/favourite`**
  - **Description**: Add a favourite item.
  - **Request Body**:
    ```json
    {
      "user": "string",
      "token": "string",
      "favId": "string"
    }
    ```
  - **Responses**:
    - `200 OK`: Success.
    - `202 Accepted`: Unauthorized or error occurred.

- **POST `/unfavourite`**
  - **Description**: Remove a favourite item.
  - **Request Body**:
    ```json
    {
      "user": "string",
      "token": "string",
      "favId": "string"
    }
    ```
  - **Responses**:
    - `200 OK`: Success.
    - `202 Accepted`: Unauthorized or error occurred.

- **POST `/uncontinue`**
  - **Description**: Remove a continue item.
  - **Request Body**:
    ```json
    {
      "user": "string",
      "token": "string",
      "favId": "string"
    }
    ```
  - **Responses**:
    - `200 OK`: Success.
    - `202 Accepted`: Unauthorized or error occurred.

## Running the Frontend

### Prerequisites
- Node.js (v14 or higher)
- npm (v6 or higher)

### Installation
1. Navigate to the [front](http://_vscodecontentref_/0) directory:
```sh
cd front
```
2. Install the dependencies:

```sh
npm install
```

### Development Server

To start the development server, run:
```sh
npm run dev
```

This will start the Vite development server and you can access the application at ```http://localhost:3000```.

### Building for Production
To build the project for production, run:

```sh
npm run build
```

The production-ready files will be generated in the build directory.

### Deployment
To deploy the frontend, run:

```sh
npm run deploy
```

This will build the project and deploy it using Firebase.

### Environment Variables
Make sure to set up the following environment variables in the ```.env``` file for both backend and frontend:

* ```GOOGLE_CREDENTIALS```: Firebase admin credentials.
* ```TMDB_Credentials```: The Movie Database API key.
* ```mailAPIkey```: SendGrid API key.