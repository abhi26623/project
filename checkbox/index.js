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
         // io.emit('server:checkbox:update', data)
         // states.checkboxes[data.index] = data.checked
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
               res.cookie('token', data.access_token, { httpOnly: true });
               return res.redirect('/');
           }
           res.status(401).send("Authentication failed");
       } catch (err) {
           console.error("Error fetching token from OIDC:", err);
           res.status(500).send("Internal Error");
       }
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