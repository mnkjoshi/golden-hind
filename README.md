# The Golden Hind

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