require('dotenv').config();
const slackEventsApi = require('@slack/events-api');
const { WebClient } = require('@slack/web-api');
const http = require('http');
const express = require('express');

// *** Initialize event adapter using signing secret from environment variables ***
const slackEvents = slackEventsApi.createEventAdapter(
  process.env.SLACK_SIGNING_SECRET,
  {
    includeBody: true,
  }
);

const slackClient = new WebClient(process.env.SLACK_AUTH_TOKEN);

// Initialize an Express application
const app = express();

// *** Plug the event adapter into the express app as middleware ***
app.use('/slack/events', slackEvents.expressMiddleware());

// *** Greeting any user that says "hi" ***
slackEvents.on('user_change', event => {
  console.log('user_change received');
  console.log(event);
});

slackEvents.on('team_join', event => {
  console.log('team_join received');
  console.log(event);
});

slackEvents.on('url_verification', event => {
  console.log(event);
});

// *** Handle errors ***
slackEvents.on('error', error => {
  console.log(
    `An error occurred while handling a Slack event: ${error.message}`
  );
});

// Start the express application
const port = process.env.PORT || 3000;
http.createServer(app).listen(port, () => {
  console.log(`server listening on port ${port}`);
});
