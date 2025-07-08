// src/firebase.js
import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

// Only export the db instance here
const firebaseConfig = {
    apiKey: "AIzaSyCeZF9Nr3w_c_BwvHlGBOEuJZMohgBnUUo",
    authDomain: "bear-game-9d117.firebaseapp.com",
    databaseURL: "https://bear-game-9d117-default-rtdb.firebaseio.com",
    projectId: "bear-game-9d117",
    storageBucket: "bear-game-9d117.firebasestorage.app",
    messagingSenderId: "688136358567",
    appId: "1:688136358567:web:8a9f715bb5a59a196de982",
    measurementId: "G-RMR7HMR3MK"
  };

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export default db;