var Firebase = require('firebase');
var myDataRef = new Firebase('https://fiery-heat-3376.firebaseio.com/');
var tokenFactory = require('./firebaseTokenFactory').tokenFactory
var Cookies = require('cookies');
var httpRequest = require('request');

var freshPost = myDataRef.child('Fresh Post');

var setTokenCookie = exports.setTokenCookie = function (request, response, token){
  newtoken = tokenFactory(); //Sets a random token
  
  if (token !== undefined) {
    newToken = token;
  }
  
  response.cookies.set('token', newToken, {
    maxAge: 2628000000,   // expires in 1 month
    httpOnly: false,    // more secure but then can't access from client
  });
  
  response.send("MurMur'd"); //This is for Slack
};


var insertPost = exports.insertPost = function(request, response, dataRef){
  var dataRef = dataRef || freshPost;
  var token = request.cookies.get('token') || request.body.token; // body.token is for Slack
  var newToken;
  var newJwtClaims;

  if (token) {
    dataRef.authWithCustomToken(token, function(error, authData) {
      if (error) {
        console.log("Login Failed!", error);
      } 
      else {
        var postMessage = request.body.message;
        var post = dataRef.push();    //ID generator
        var postId = post.key();      //Grabs the ID
        
        //Pushes the post data into the database
        post.set({
          uid: authData.auth.uid,
          messageId : postId,
          message : postMessage,
          timestamp : Firebase.ServerValue.TIMESTAMP,
          votes : 0,
          comments : "no comments"
        });
        
        var fbRef = dataRef.parent()
        var postIdRef = fbRef.child('sessions/' + authData.auth.uid + '/posted/' + postId);
        
        postIdRef.set({ type: 'true' });

        newJwtClaims = authData.auth;
        newJwtClaims.postedMessagesId = newJwtClaims.postedMessagesId + 1;
        newToken = tokenFactory(newJwtClaims);
        
        //Sets the url to post on slack
        var url = 'https://mks22.slack.com/api/chat.postMessage'
        
        slackMessage = {
          token: 'xoxp-6711708658-6752831218-9166692273-ff23b3',
          channel: '#mur_mur',
          text: postMessage,
          username: 'MurMur Bot'
        }
        
        httpRequest.post( url,
          { form: slackMessage },
          function(err, data){
            console.log('Slack Message Posted');
          } 
        );

        setTokenCookie(request, response, newToken);
      }
    });
  }

  return { newToken: newToken, auth: newJwtClaims }
}

var votePost = exports.votePost = function(request, response, dataRef){
  var dataRef = dataRef || freshPost;
  var token = request.cookies.get('token');
  var newToken;
  var newJwtClaims;

  if (token) {

    dataRef.authWithCustomToken(token, function(error, authData) {
      if (error) {
        console.log("Login Failed!", error);
      } 
      else {
        var dataRef = dataRef || freshPost;
        var messageId = request.body.messageId;
        var voteRequest = request.body.vote;

        var fbRef = freshPost.parent()
        var votedIdRef = fbRef.child('sessions/' + authData.auth.uid + '/voted/' + messageId); //The unique user who's doing the changes
        
        var vote = dataRef.child(messageId + '/votes'); //Sets up the place where the changes will happen
        
        //.once method listens to the database once, then calls it off after it's done
        votedIdRef.once('value', function(snapshot){
          if (snapshot.val()) {
            var value = snapshot.val();
            
            if (value.type === "downvoted") {
              vote.transaction(function (value){ //.transaction method lets you change a value without affecting other values
                if (voteRequest === true) {
                  votedIdRef.set(null);
                  return value + 1;
                }
              });
            }
            else {
              vote.transaction(function (value){ //.transaction method lets you change a value without affecting other values
                if (voteRequest === false) {
                  votedIdRef.set(null);
                  return value - 1;
                }
              });
            }
          } 
          else {
            vote.transaction(function (value){ //.transaction method lets you change a value without affecting other values
              if (voteRequest === true) {
                votedIdRef.set({ type : "upvoted" });
                return value + 1;
              }
              else {
                votedIdRef.set({ type : "downvoted" });
                return value - 1;
              }
            });
          }
        });

        newJwtClaims = authData.auth;
        newJwtClaims.postedMessagesId = newJwtClaims.postedMessagesId + 1;
        newToken = tokenFactory(newJwtClaims);

        setTokenCookie(request, response, newToken);
      }
    });
  }
}

var comment = exports.comment = function(request, response, dataRef){
  var dataRef = dataRef || freshPost;
  var token = request.body.token;

  dataRef.authWithCustomToken(token, function(error, authData) {
    if (error) {
      console.log("Login Failed!", error);
    } 
    else {
      var messageId = request.body.messageId;      //The post/message ID where the comment resides
      var commentMessage = request.body.comment;
      var comments = dataRef.child( messageId + '/comments');

      var comment = comments.push();  //ID generator
      var commentId = comment.key();  //Grabs the ID

      var postedRef = dataRef.parent().child('sessions/' + authData.auth.uid + '/posted');
      
      postedRef.once('value', function(snapshot){
        //if Commenter is OP
        if (snapshot.val() && snapshot.val().hasOwnProperty(messageId)) {
          authData.auth.baseId = 'OP';   //Todo: create OP image
          authData.auth.hairId = 'OP';   //Todo: create OP image
        }
        
        //Pushes the comment data into the post/message
        comment.set({
          commentId : commentId,
          comment : commentMessage,
          timestamp : Firebase.ServerValue.TIMESTAMP,
          votes : 0,
          baseId: authData.auth.baseId,
          hairId: authData.auth.hairId
        });
      });
    }
  });
}

var voteComment = exports.voteComment = function(request, response, dataRef){
  var dataRef = dataRef || freshPost;
  var token = request.cookies.get('token');
  var newToken;
  var newJwtClaims;
  
  if (token) {
    dataRef.authWithCustomToken(token, function(error, authData) {
      if (error) {
        console.log("Login Failed!", error);
      } 
      else {
        var messageId = request.body.messageId;
        var commentId = request.body.commentId;
        var voteRequest = request.body.vote;
        
        var fbRef = freshPost.parent();
        var votedIdRef = fbRef.child('sessions/' + authData.auth.uid + '/voted/' + commentId); //The unique user who's doing the changes
        
        var vote = dataRef.child(messageId + '/comments/' + commentId + '/votes'); //Sets up the place where the changes will happen
        
        //.once method listens to the database once, then calls it off after it's done
        votedIdRef.once('value', function(snapshot){
          if (snapshot.val()) {
            var value = snapshot.val();
            
            if (value.type === "downvoted") {
              vote.transaction(function (value){ //.transaction method lets you change a value without affecting other values
                if (voteRequest === true) {
                  votedIdRef.set(null);
                  return value + 1;
                }
              });
            }
            else {
              vote.transaction(function (value){ //.transaction method lets you change a value without affecting other values
                if (voteRequest === false) {
                  votedIdRef.set(null);
                  return value - 1;
                }
              });
            }
          } 
          else {
            vote.transaction(function (value){ //.transaction method lets you change a value without affecting other values
              if (voteRequest === true) {
                votedIdRef.set({ type : "upvoted" });
                return value + 1;
              }
              else {
                votedIdRef.set({ type : "downvoted" });
                return value - 1;
              }
            });
          }
        });

        newJwtClaims = authData.auth;
        newJwtClaims.postedMessagesId = newJwtClaims.postedMessagesId + 1;
        newToken = tokenFactory(newJwtClaims);

        setTokenCookie(request, response, newToken);
      }
    });
  }
}

var toggleFavorite = exports.toggleFavorite = function(request, response, dataRef){
  var dataRef = dataRef || freshPost;
  var token = request.cookies.get('token');
  var newToken;
  var newJwtClaims;
  
  if (token) {
    dataRef.authWithCustomToken(token, function(error, authData) {
      if (error) {
        console.log("Login Failed!", error);
      } 
      else {
        var messageId = request.body.messageId;

        var fbRef = dataRef.parent();
        var favoritesIdRef = fbRef.child('sessions/' + authData.auth.uid + '/favorites/' + messageId);

        favoritesIdRef.once('value', function(snapshot){
          if (snapshot.val()) {
            favoritesIdRef.set(null);
          } 
          else {
            favoritesIdRef.set({ type: 'true' });
          }
        });

        newJwtClaims = authData.auth;
        newJwtClaims.postedMessagesId = newJwtClaims.postedMessagesId + 1;
        newToken = tokenFactory(newJwtClaims);

        setTokenCookie(request, response, newToken);
      }
    });
  }
}
