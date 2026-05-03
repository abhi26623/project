import 'dotenv/config'
import http from 'node:http'
import path from 'node:path'

import express from 'express'
import cookieParser from 'cookie-parser'
import { Server } from 'socket.io'
import {publisher , subscriber,redis} from './redis-connection.js'


const checkCount = 100
const CHECKBOX_STATE_KEY='checkbox-state'
const states = {
   checkboxes: new Array(checkCount).fill(false)
}

// Simple JWT payload decoder (no verification needed — we set the cookie ourselves)
function decodeJwtPayload(token) {
   try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const payload = Buffer.from(parts[1], 'base64url').toString('utf8');
      return JSON.parse(payload);
   } catch {
      return null;
   }
}

async function main() {
   const app = express()
   const server = http.createServer(app)
   const io = new Server()
   const PORT = process.env.PORT ?? 8080

   io.attach(server)

   await subscriber.subscribe('internal-server:checkbox:update')
   subscriber.on('message',(channel , message)=>{
    if (channel ==='internal-server:checkbox:update'){
      const {index,checked}=JSON.parse(message)

      io.emit('server:checkbox:update',{index ,checked})
    }
   })

   // socket handler 

   io.on('connection', (socket) => {
      console.log("socket connected", { id: socket.id })
      socket.on('client:checkbox:click', async (data) => {
         console.log(`Socket Id:${socket.id} client:checkbox:click`, data)
         const existingState = await redis.get(CHECKBOX_STATE_KEY)
         if(existingState){
            const remoteDate = JSON.parse(existingState)
            remoteDate[data.index] = data.checked
            await redis.set(CHECKBOX_STATE_KEY, JSON.stringify(remoteDate))
         }
         else{
            const initialData = new Array(checkCount).fill(false)
            initialData[data.index] = data.checked
            await redis.set(CHECKBOX_STATE_KEY, JSON.stringify(initialData))
         }
        await  publisher.publish('internal-server:checkbox:update',
            JSON.stringify(data)
         )
      })
   })

   // express handler 
   
   // ==========================================
   // OIDC INTEGRATION
   // ==========================================
   app.use(cookieParser());

   const CLIENT_ID = process.env.OIDC_CLIENT_ID;
   const CLIENT_SECRET = process.env.OIDC_CLIENT_SECRET;
   const REDIRECT_URI = process.env.OIDC_REDIRECT_URI;
   const OIDC_URL = process.env.OIDC_SERVER_URL;

   app.get('/login', (req, res) => {
       res.redirect(`${OIDC_URL}/authorize?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}`);
   });

   app.get('/callback', async (req, res) => {
       const shortCode = req.query.code;
       if (!shortCode) return res.status(400).send("No code provided.");

       try {
           const tokenRes = await fetch(`${OIDC_URL}/token`, {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({
                   client_id: CLIENT_ID,
                   client_secret: CLIENT_SECRET,
                   code: shortCode
               })
           });
           
           const data = await tokenRes.json();
           
           if (data.access_token) {
               // Set httpOnly token for security
               res.cookie('token', data.access_token, { httpOnly: true, sameSite: 'lax' });
               // Set a visible cookie so the frontend JS knows the user is logged in
               res.cookie('logged_in', '1', { sameSite: 'lax' });
               return res.redirect('/');
           }
           res.status(401).send("Authentication failed");
       } catch (err) {
           console.error("Error fetching token from OIDC:", err);
           res.status(500).send("Internal Error");
       }
   });

   // --- User Info Endpoint ---
   app.get('/api/me', (req, res) => {
       const token = req.cookies.token;
       if (!token) return res.status(401).json({ loggedIn: false });

       const decoded = decodeJwtPayload(token);
       if (!decoded) return res.status(401).json({ loggedIn: false });

       return res.json({
           loggedIn: true,
           name: decoded.name || 'User',
           email: decoded.email || '',
       });
   });

   // --- Logout Endpoint ---
   app.get('/logout', (req, res) => {
       res.clearCookie('token');
       res.clearCookie('logged_in');
       res.redirect('/');
   });
   // ==========================================

   app.use(express.static(path.resolve('./public')))
   app.get('/health', (req, res) => {
      return res.json({ healthy: true })
   })

   app.get('/checkboxes', async (req, res) => {
     const existingState=await redis.get(CHECKBOX_STATE_KEY)
     if(existingState){
      const remoteData= JSON.parse(existingState)
      return res.json({ checkboxes: remoteData})
     }

      return res.json({checkboxes: new Array(checkCount).fill(false)})
   })

   server.listen(PORT, () => {
      console.log(`server is running on : http://localhost:${PORT}`)
   })
}
main();