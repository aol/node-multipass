var config = require('../../conf/config')
  , auth = require('../index')
  , FacebookStrategy = require('passport-facebook').Strategy;


var provider = {
  strategy: 'facebook',
  scope: ['email']
};

auth.useOAuthStrategy(provider, FacebookStrategy, {
  clientID: config.providers.facebook.appId,
  clientSecret: config.providers.facebook.appSecret
});

module.exports.provider = provider;
