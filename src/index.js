require('dotenv').config();
const slackEventsApi = require('@slack/events-api');
const { WebClient } = require('@slack/web-api');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { userSchema } = require('../schema/userSchema');
const { channelSchema } = require('../schema/channelSchema');

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
  // console.log('connected to database');
});

const User = mongoose.model('User', mongoose.Schema(userSchema));

const Channel = mongoose.model('Channel', mongoose.Schema(channelSchema));

// Initialize an Express application
const app = express();

// setup middlewares
app.use('/slack/events', slackEvents.expressMiddleware());
app.use(cors());

// endpoint for client to recieve users
app.get('/users', (req, res) => {
  User.find((err, users) => {
    res.json(users);
  });
});

// endpoint for client to recieve users
app.get('/channels', (req, res) => {
  Channel.find((err, channels) => {
    res.json(channels);
  });
});

const createNewUser = (user) => {
  const userDoc = new User(user);

  userDoc.save((error) => {
    if (error) {
      // console.log(`error saving user: ${user.name} - ${error}`);
    }
  });
};

const updateUser = (user) => {
  User.findOne({ id: user.id }, (err, doc) => {
    if (err) {
      // console.log(`error finding user ${err}`);
    } else if (doc) {
      // update it if it exists
      doc.overwrite(user);
      doc.save();
    } else {
      // create a new one if it doesn't
      createNewUser(user);
    }
  });
};

const createNewChannel = (channelId, userId) => {
  const users = {};
  users[userId] = true;

  const channelDoc = new Channel({ id: channelId, users });

  channelDoc.save((err) => {
    if (err) {
      // log error
    }
  });
};

const recordUserJoinedChannel = (channelId, userId) => {
  Channel.findOne({ id: channelId }, (err, doc) => {
    if (err) {
      // console.log(`error finding channel ${err});
    } else if (doc) {
      if (!doc.users.get(userId)) {
        doc.users.set(userId, true);
        doc.save();
      }
    } else {
      createNewChannel(channelId, userId);
    }
  });
};

const recordUserLeftChannel = (channelId, userId) => {
  Channel.findOne({ id: channelId }, (err, doc) => {
    if (err) {
      // console.log(`error finding channel ${err});
    } else if (doc) {
      if (doc.users.get(userId)) {
        doc.users.delete(userId);
        doc.save();
      }
    }
    // there shouldn't ever be an else for here, because we should always know about it
  });
};

const getExistingUsers = async () => {
  const users = await slackClient.users.list();

  users.members.forEach((user) => {
    updateUser(user);
  });
};

// Handle team_join event
slackEvents.on('team_join', (event) => {
  // console.log('team_join received');
  createNewUser(event.user);
});

// Handle user_change event
slackEvents.on('user_change', (event) => {
  // console.log('user_change received');
  updateUser(event.user);
});

slackEvents.on('member_joined_channel', (event) => {
  console.log('member_joined_channel recieved');

  recordUserJoinedChannel(event.channel, event.user);
});

slackEvents.on('member_left_channel', (event) => {
  console.log('member_left_channel recieved');

  recordUserLeftChannel(event.channel, event.user);
});

// Handle url_verification event
slackEvents.on('url_verification', () => {
  // console.log(event);
});

// Handle error event
slackEvents.on('error', () => {
  // console.log(
  //   `An error occurred while handling a Slack event: ${error.message}`
  // );
});

// Start the express application
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`server listening on port ${port}`);

  getExistingUsers();
});
