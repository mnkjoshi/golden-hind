import React from 'react'
import ReactDOM from 'react-dom/client'

import './stylesheets/root.css'
import './stylesheets/auth.css'
import './stylesheets/topbar.css'
import './stylesheets/app.css'
import './stylesheets/watch.css'
import './stylesheets/search.css'
import './stylesheets/test.css'

import Root from './routes/root.jsx'
import Auth from './routes/auth.jsx'
import App from './routes/app.jsx'
import Watch from './routes/watch.jsx'
import Search from './routes/search.jsx'
import Books from './routes/books.jsx'
import Music, { MusicSearch, MusicLibrary } from './routes/music.jsx'
import Admin from './routes/admin.jsx'
import Test from './routes/test.jsx'
import Detail from './routes/detail.jsx'
import Person from './routes/person.jsx'
import Collection from './routes/collection.jsx'
import Stats from './routes/stats.jsx'
import Downloads, { DownloadPlayer } from './routes/downloads.jsx'
import ErrorPage from './routes/error.jsx'
import './stylesheets/admin.css'
import './stylesheets/detail.css'
import './stylesheets/music.css'
import './stylesheets/person.css'
import './stylesheets/remote.css'
import './stylesheets/stats.css'
import './stylesheets/player.css'

import {
  createBrowserRouter,
  RouterProvider,
} from "react-router-dom";

const router = createBrowserRouter([
  {
    path: "/",
    element: <Root/> ,
    errorElement: <ErrorPage/>,
    children: [
      // {
      //   index: true,
      //   element: <Index/>
      // },
      // {
      //   path: "/projects",
      //   element: <Projects/>
      // },
    ]
  },
  {
    path: "/auth",
    element: <Auth/> ,
    errorElement: <ErrorPage/>,
  },
  {
    path: "/auth/:id",
    element: <Auth/> ,
    errorElement: <ErrorPage/>,
  },
  {
    path: "/app",
    element: <App/> ,
    errorElement: <ErrorPage/>,
  },
  {
    path: "/search",
    element: <Search/>,
    errorElement: <ErrorPage/>
  },
  {
    path: "/books",
    element: <Books/>,
    errorElement: <ErrorPage/>
  },
  {
    path: "/watch/:id",
    element: <Watch/>,
    errorElement: <ErrorPage/>
  },
  {
    path: "/detail/:id",
    element: <Detail/>,
    errorElement: <ErrorPage/>
  },
  {
    path: "/person/:id",
    element: <Person/>,
    errorElement: <ErrorPage/>
  },
  {
    path: "/collection/:id",
    element: <Collection/>,
    errorElement: <ErrorPage/>
  },
  {
    path: "/music",
    element: <Music/>,
    errorElement: <ErrorPage/>
  },
  {
    path: "/music/search",
    element: <MusicSearch/>,
    errorElement: <ErrorPage/>
  },
  {
    path: "/music/library",
    element: <MusicLibrary/>,
    errorElement: <ErrorPage/>
  },
  {
    path: "/stats",
    element: <Stats/>,
    errorElement: <ErrorPage/>
  },
  {
    path: "/downloads",
    element: <Downloads/>,
    errorElement: <ErrorPage/>
  },
  {
    path: "/downloads/play/:key",
    element: <DownloadPlayer/>,
    errorElement: <ErrorPage/>
  },
  {
    path: "/admin",
    element: <Admin/>,
    errorElement: <ErrorPage/>
  },
  {
    path: "/test",
    element: <Test/>,
    errorElement: <ErrorPage/>
  }
])

// With no connection, only downloads work — keep the app on the Downloads
// page (any other page would just fail to load its data).
const keepOffline = () => {
  if (!navigator.onLine && !window.location.pathname.startsWith('/downloads')) {
    router.navigate('/downloads', { replace: true });
  }
};
keepOffline();
window.addEventListener('offline', keepOffline);
router.subscribe(keepOffline);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
     <RouterProvider router={router}/>
  </React.StrictMode>,
)

// Register the PWA service worker for offline shell + installability.
// Only runs in production builds; the dev server serves /sw.js but we skip
// registration there to avoid stale-cache headaches during local dev.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
