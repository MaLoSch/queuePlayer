//Depedency variables
const express = require('express')
var cors = require('cors');
var querystring = require('querystring');
var cookieParser = require('cookie-parser');
var fs= require('fs');
var bodyParser = require("body-parser");
var SpotifyWebApi = require('spotify-web-api-node');

//Scope Definition for Spotify WebAPI calls
const scopes = [
    'ugc-image-upload',
    'user-read-playback-state',
    'user-modify-playback-state',
    'user-read-currently-playing',
    'streaming',
    'app-remote-control',
    'user-read-email',
    'user-read-private',
    'playlist-read-collaborative',
    'playlist-modify-public',
    'playlist-read-private',
    'playlist-modify-private',
    'user-library-modify',
    'user-library-read',
    'user-top-read',
    'user-read-playback-position',
    'user-read-recently-played',
    'user-follow-read',
    'user-follow-modify'
  ];

//Initialising the SpotifyAPI node package
var spotifyApi = new SpotifyWebApi({
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    redirectUri: 'https://queue-player.herokuapp.com:8888/callback'
});

var access_token;

//Initialising the express server
const app = express();
app.use(bodyParser.json());
const { ppid } = require('process');

app.use(express.static(__dirname + '/public'))
   .use(cors())
   .use(cookieParser());




app.use(
    express.raw({
        // Need raw message body for siganture verification -> this might from the Twitch API
        type: "application/json",
    })
);
const expressWs = require("express-ws")(app); // require express-websocket and initialize expressWs
let port = 3000; // we use port 3000 for the websocket connection (should we put this into an environment variable?)
let LEDData = { // the JSON file that is being send via websocket. Filled with random data for now. This needs to be exchanged with actual data from the database
    "queue": {
        "1": {
            "r": Math.floor(Math.random() * 256) * Math.floor(Math.random() * 2),
            "g": Math.floor(Math.random() * 256) * Math.floor(Math.random() * 2),
            "b": Math.floor(Math.random() * 256) * Math.floor(Math.random() * 2)
        },
        "2": {
            "r": Math.floor(Math.random() * 256) * Math.floor(Math.random() * 2),
            "g": Math.floor(Math.random() * 256) * Math.floor(Math.random() * 2),
            "b": Math.floor(Math.random() * 256) * Math.floor(Math.random() * 2)
        },
        "3": {
            "r": Math.floor(Math.random() * 256) * Math.floor(Math.random() * 2),
            "g": Math.floor(Math.random() * 256) * Math.floor(Math.random() * 2),
            "b": Math.floor(Math.random() * 256) * Math.floor(Math.random() * 2)
        },
        "4": {
            "r": Math.floor(Math.random() * 256) * Math.floor(Math.random() * 2),
            "g": Math.floor(Math.random() * 256) * Math.floor(Math.random() * 2),
            "b": Math.floor(Math.random() * 256) * Math.floor(Math.random() * 2)
        }
    },
    "clients": {
        "1": Math.floor(Math.random() * 2),
        "2": Math.floor(Math.random() * 2),
        "3": Math.floor(Math.random() * 2),
        "4": Math.floor(Math.random() * 2)
    }
}
app.ws("/", function(ws, req) {
    console.log("new client connected to websocket");
    ws.on('message', function(msg) {
        if(msg === 'Ping') {
            ws.send('Pong');
        } else {
            ws.send('Received unknown message');
        }
    });
});
var wss = expressWs.getWss("/");
/*
wss.clients.forEach(client => client.send(JSON.stringify(LEDData, null, 4)));
*/






//Authorization flow for the Spotify API 
app.get('/login', (req, res) => {
    res.redirect(spotifyApi.createAuthorizeURL(scopes));
  });
  
app.get('/callback', (req, res) => {
    const error = req.query.error;
    const code = req.query.code;
    const state = req.query.state;
  
    if (error) {
      console.error('Callback Error:', error);
      res.send(`Callback Error: ${error}`);
      return;
    }
  
spotifyApi
      .authorizationCodeGrant(code)
      .then(data => {
        access_token = data.body['access_token'];
        const refresh_token = data.body['refresh_token'];
        const expires_in = data.body['expires_in'];
  
        spotifyApi.setAccessToken(access_token);
        spotifyApi.setRefreshToken(refresh_token);
  
        // console.log('access_token:', access_token);
        // console.log('refresh_token:', refresh_token);
  
        setInterval(async () => {
          const data = await spotifyApi.refreshAccessToken();
          const access_token = data.body['access_token'];
  
          console.log('The access token has been refreshed!');
          console.log('access_token:', access_token);
          spotifyApi.setAccessToken(access_token);
        }, expires_in / 2 * 1000);
      })
      .catch(error => {
        console.error('Error getting Tokens:', error);
        res.send(`Error getting Tokens: ${error}`);
      });

      if(access_token !=null)
      {
        res.redirect('/qpInterface');
      }
  });

//Loads the client website
app.get('/qpInterface',(req, res)=>{
  res.sendFile(__dirname + '/public/html/qpInterface.html');   
});

//Get the Track to play as requested by the client
app.post('/getTrackToPlay', (req, res) => {
  var trackInfos = readDatabase();
  var bpmData=getDatafromBPM(trackInfos, req.body.bpm);
  var songAddition = processDatabase(bpmData, req.body.userID);
  queue=songAddition;
  var q=queue.shift();
  var cr=getColorSequence(queue);
  userControl(req.body.userID);
  res.send({"queue": queue, "song":q, "color": cr});
})


// Get the track into the queue 
app.post('/getTrackToQueue',(req, res)=>{
  if(!userCheck(req.body.userID))
  {
    var trackInfos = readDatabase();
    var bpmData=getDatafromBPM(trackInfos, req.body.bpm);
    var songAddition = processDatabase(bpmData, req.body.userID);
    queue.splice(req.body.offset,queue.length-req.body.offset);
    queue=queue.concat(songAddition);
    var cr=getColorSequence(queue);
    userControl(req.body.userID);
    res.send({"queue": queue, "color": cr});
  }
  else
  {
    res.send({"queue":queue, color:cr});
  }

})

// Get the track from the queue to automatically continue playing
app.post('/continuePlaying', (req, res)=>{
  user1Added=false;
  user2Added=false;
  user3Added=false;
  user4Added=false;
  var q=queue.shift();
  var cr=getColorSequence(queue);
  res.send({"queue": queue, "song":q, "color": cr});
})

//Play the song , finds the active spotify player if device id not specified
app.post('/playback',async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const play= await spotifyApi.play({
    "uris": req.body.song,
  }).then(function() {
      console.log('Playback started');
    }, function(err) {
      //if the user making the request is non-premium, a 403 FORBIDDEN response code will be returned
      console.log('Something went wrong!', err);
  });
});

// Gets the state of the active player to check if song has ended or playing
app.get('/getState', (req, res)=> {
    const state=spotifyApi.getMyCurrentPlaybackState()
    .then(function(data) {
      console.log(data.body.is_playing);
      if(data.body.is_playing)
      {
        var wot=0;
        if(wot==0 && data.body.progress_ms+1000>data.body.item.duration_ms)
        {
          wot=1;
          console.log('Finished Playing: ' + data.body.item.name);
          res.send({song:data.body.item.name,state:"ended"}); 
        }
        else
        {
          res.send({song:data.body.item.name,state:"playing"});
        }
      }
    }, function(err) {
      console.log('Something went wrong!', err);
    });
})

//Gets the name of the song playing, just for the website
app.post('/getTrack', (req, res) => {
  const track=spotifyApi.getTrack(req.body.id)
  .then(function(song) {
    console.log(song.body.name);
    res.send({songName:song.body.name});
  })
})

app.listen(8888, () =>
   console.log(
     'HTTP Server up. Now go to https://queue-player.herokuapp.com:8888/ in your browser.'
   )
 );

//////////// Server Helper Functions ///////////

var queue = []; 
var colorArr = [];
var user1Added=false;
var user2Added=false;
var user3Added=false;
var user4Added=false;

// Reading the JSON file data
function readDatabase()
{
  var qpDataset=require("./Final Database/Final Final/qp_multiuser.json");
  return qpDataset;
}

function getDatafromBPM(qpData, bpm)
{
  //Handling the case when the specified bpm is not present and then the next lowest bpm is selected
  var qpBPMData=new Array();
  while(qpBPMData.length == 0)
  {
    for(let i=0;i<qpData.length;i++)
    {
      if(qpData[i].tempo==bpm)
      {
        qpBPMData.push(qpData[i]);
      }
    }
    bpm--;
  }
  return qpBPMData;
}


//Processing the JSON file data
function processDatabase(qpData,user)
{
  //Include Song Selection Algorithm

  //Sorting data according to danceability for now , until song selection algorithm
  qpData.sort((first,second) => {
      return first.danceability - second.danceability;
  });

  //Choosing the first song for the user interacted
  let l=0;
  while(l<qpData.length &&  !qpData[l].user_id.includes(user))
  {
    l++;
  }
  var temp=qpData.splice(0,l);
  qpData=qpData.concat(temp);
  return qpData;
}

function userControl(userPressed)
{
  if(userPressed==1)
  {
    user1Added=true;
  }
  else if(userPressed==2)
  {
    user2Added=true;
  }
  else if(userPressed==3)
  {
    user3Added=true;
  }
  else if(userPressed==4)
  {
    user4Added=true;
  }
}

function userCheck(userPressed)
{
  if(userPressed==1)
  {
    return user1Added;
  }
  else if(userPressed==2)
  {
    return user2Added;
  }
  else if(userPressed==3)
  {
    return user3Added;
  }
  else if(userPressed==4)
  {
    return user4Added;
  }
}


function getColorSequence(que)
{
  colorArr = [];
  let i=0;
  while(i<que.length && i<4)
  {
    var temp=[];
    let j=0;
    while(j<que[i].user_id.length)
    {
      if(que[i].user_id[j]==1)
      {
        temp.push('#FF0000');
      }
      else if(que[i].user_id[j]==2)
      {
        temp.push('#0000FF');
      }
      else if(que[i].user_id[j]==3)
      {
        temp.push('#00FF00');
      }
      else if(que[i].user_id[j]==4)
      {
        temp.push('#FFFF00');
      }
      j++;
    }
    colorArr.push(temp);
    i++;
  }
  return colorArr;
}


