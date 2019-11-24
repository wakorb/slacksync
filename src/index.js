require('dotenv').config();
const slackEventsApi = require('@slack/events-api');
const { WebClient } = require('@slack/web-api');
const express = require('express');
const mongoose = require('mongoose');
const { userSchema } = require('../schema/userSchema');

// *** Initialize event adapter using signing secret from environment variables ***
const slackEvents = slackEventsApi.createEventAdapter(
  process.env.SLACK_SIGNING_SECRET,
  {
    includeBody: true,
  }
);

// Initialize slack client
const slackClient = new WebClient(process.env.SLACK_AUTH_TOKEN);

// Initialize database connection
mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true });

mongoose.set('useCreateIndex', true);

const db = mongoose.connection;

db.on('error', console.error.bind(console, 'connection error:'));

db.once('open', () => {
  console.log('connected to database');
});

const User = mongoose.model('User', mongoose.Schema(userSchema));

// Initialize an Express application
const app = express();

let clientId = 0;
const clients = {};

// setup middlewares
app.use('/slack/events', slackEvents.expressMiddleware());

// this was for local testing purposes
// app.use((req, res, next) => {
//
//   next();
// });

// endpoint for client to recieve users
app.get('/users', (req, res) => {
  User.find((err, docs) => {
    req.socket.setTimeout(1000000);

    res.header('Access-Control-Allow-Origin', '*');
    res.header('Content-Type', 'text/event-stream');
    res.header('Cache-Control', 'no-cache');

    const payload = `data: ${JSON.stringify(docs)}\n\n`;

    res.write(payload);

    (() => {
      clients[clientId] = res; // <- Add this client to those we consider "attached"
      req.on('close', () => {
        delete clients[clientId];
      }); // <- Remove this client when he disconnects
    })((clientId += 1));
  });
});

const createNewUser = (user) => {
  const userDoc = new User(user);

  userDoc.save((error) => {
    if (error) {
      console.log(`error saving user: ${user.name} - ${error}`);
    }
  });
};

const updateUser = (user) => {
  User.findOne({ id: user.id }, (err, doc) => {
    if (err) {
      console.log(`error finding user ${err}`);
    } else if (doc) {
      // update it if it exists
      doc.overwrite(user);
      doc.save();
    } else {
      // create a new one if it doesn't
      createNewUser(user);
    }

    Object.values(clients).forEach((client) => {
      client.write(`data: ${JSON.stringify([user])}\n\n`);
    });
  });
};

const getExistingUsers = async () => {
  const users = await slackClient.users.list();

  users.members.forEach((user) => {
    updateUser(user);
  });
};

// Handle team_join event
slackEvents.on('team_join', (user) => {
  console.log('team_join received');
  createNewUser(user);
});

// Handle user_change event
slackEvents.on('user_change', (user) => {
  console.log('user_change received');
  updateUser(user);
});

// Handle url_verification event
slackEvents.on('url_verification', (event) => {
  console.log(event);
});

// Handle error event
slackEvents.on('error', (error) => {
  console.log(
    `An error occurred while handling a Slack event: ${error.message}`
  );
});

// Start the express application
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`server listening on port ${port}`);

  getExistingUsers();
});
