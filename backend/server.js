const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// --- CONFIGURATION ---
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "https://syncsketch-app.vercel.app"
];

// --- MIDDLEWARE ---
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ["GET", "POST"],
  credentials: true
}));

app.use(express.json());

// --- SOCKET SERVER ---
const io = new Server(server, {
  cors: { 
    origin: allowedOrigins, 
    methods: ["GET", "POST"] 
  }
});

require('./socket/signaling')(io);

// --- GOOGLE AUTH SETTINGS ---
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "763027691856-obru3cpp41bu12dir2g1pu15gqko8rj0.apps.googleusercontent.com";
const JWT_SECRET = process.env.JWT_SECRET || "syncsketch_secret_key_123";
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// --- 👇 THIS IS THE MISSING PART! 👇 ---
app.post('/auth/google', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: "Token missing" });

    // 1. Verify the token with Google
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    // 2. Create User Object
    const user = {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
      role: "PARTICIPANT" 
    };

    // 3. Create App Token
    const appToken = jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });

    // 4. Send back to Frontend
    res.json({ user, token: appToken });

  } catch (err) {
    console.error("Google Auth Error:", err);
    res.status(401).json({ error: 'Invalid Google token' });
  }
});

// --- START SERVER ---
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`✅ SyncSketch Backend running on port ${PORT}`);
});