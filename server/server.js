var express = require('express');
var firebase = require('./firebase');
var tokenFactory = require('./firebaseTokenFactory').tokenFactory;
var app = express();
var bodyParser = require('body-parser');
var Cookies = require("cookies");
var serverUrl = '107.170.240.99';
var fs = require('fs')

app.use('/murmur', express.static('../client'));
app.use(bodyParser.json());


app.use(Cookies.express())

app.get('/noToken', function(request, response){
  //If user doesn't have token yet, will present them the introduction page
  fs.readFile('../client/src/invite.html', function(err, data){
    if (err) {
      console.log('error reading invite.html')
    }
    response.setHeader('Content-Type', 'text/html')
    response.send(data)
  })
})

app.post('/noToken', function(request, response){
  //generates the user's unique token
  if (request.cookies.get('token')) {
    console.log('already have a token')
    request.method = 'get';
    response.send({redirect: '/murmur'});
  } 
  else if (request.body.inviteCode === 'mks22') {                   // set Token Cookie
    response.cookies.set('token', tokenFactory(), {
      maxAge: 2628000000,   // expires in 1 month
      httpOnly: false,    // more secure but then can't access from client
    })
    request.method = 'get';
    response.send({redirect: '/murmur'});
  } 
  else {
    response.send('Correct Invitation Code Required.')
  }
})

app.get('/', function(request, response){
  //Checks if the user has a token or not
  if(request.cookies.get('token')){
    response.redirect('/murmur');
  } 
  else {
    response.redirect('/noToken');
  }
})

app.post('/', function(request, response){
  //Post request for new posts on murmur
  var data = '';
  request.on('data', function(chunk){ //This parses the data from slack
    data += chunk;
  });

  var slackObject = {};
  
   //This handles post requests from slack
  request.on('end', function(){
    data.split('&').forEach(function(keyVal){
      var keyValArr = keyVal.split('=');
      var key = keyValArr[0];
      var val = keyValArr[1];
      slackObject[key] = val;
    })
 
    function urlDecode(str) {
      return decodeURIComponent((str+'').replace(/\+/g, '%20'));
    }	

    if(slackObject.token === 'nZg1PC40VFQvtd4efRvcr14N'){
      request.body.token = tokenFactory();
      request.body.message = urlDecode(slackObject.text);
    }
    console.log('SLAAAAAAAAACK', request.body);
    firebase.insertPost(request, response);
  })
  
  //This handles posts not from Slack
  firebase.insertPost(request,response);
})

app.post('/comment', function(request, response){
  firebase.comment(request, response);
})

app.post('/vote', function(request,response){
  firebase.votePost(request, response);
})

app.post('/voteComment', function(request,response){
  firebase.voteComment(request, response);
})

app.post('/favorite', function(request,response){
  firebase.toggleFavorite(request, response);
})

app.listen(4000, serverUrl);

