const channelSchema = {
  id: { type: String, unique: true },
  users: {
    type: Map,
    of: Boolean,
  },
};

module.exports = {
  channelSchema,
};
