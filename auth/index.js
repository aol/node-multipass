var passport = require('passport')
  , _ = require('underscore')._
  , config = require('../conf/config')
  , userAPI = require('../data/user')
  , HttpHelper = require('../routes/httphelper')
  , ApiResponse = require('../data/apiresponse');


// Passport session setup.
// To support persistent login sessions, serialize the user by storing the 
// userId in an object.
passport.serializeUser(function(user, done) {
  var serializedData = {
      appId: null,
      userId: null
  }
  if (user instanceof ApiResponse) {
    if (user.isError()) {
      done(user.getData(), serializedData);
    } else {
      serializedData.appId = user.data.appId;
      serializedData.userId = user.data.userId;
      done(null, serializedData);
    }
  } else {
    serializedData.appId = user.appId;
    serializedData.userId = user.userId;
    done(null, serializedData);
  }
});

// Return user object persisted in the session.
passport.deserializeUser(function(obj, done) {
  done(null, obj);
});


var auth = {
    
  providers: [],
  
  _appAuthStrategy: null,
  
  // Initialize Passport!  Also use passport.session() middleware, to support
  // persistent login sessions (recommended).
  init: function(app) {
    app.use(passport.initialize());
    app.use(passport.session());

    this.loadAppProvider('app');
    this.loadProviders(app);
  },
  
  setRedirect: function(req) {
      //req.session.authredirect = config.paths.authRedirect;
      if (req.param('r') != null && req.session) {
          req.session.authredirect = req.param('r');
      }
  },
  
  authenticateProvider: function(provider, options) {
   options = options || {};
   options.successRedirect = options.successRedirect || config.paths.authRedirect || '/';
   options.failureRedirect = options.failureRedirect || config.paths.failRedirect || '/';
  
   return function(req, res, next) {
     console.log('auth.authenticateProvider');
     passport.authorize(provider, { session:false, scope: options.scope })(req, res, next);
   }
  },
  
  associate: function() {
    return function(req, res, next) {
      console.log('auth.associate');
      var user = req.user,
        profile = req.account;
//debugger;
      // Return error if missing provider name or id; won't be able access it otherwise 
      if (!profile.provider || !profile.id) {
        req.apiResponse = new ApiResponse(500, new Error('Profile not associated. Missing provider name or id.'));
        next(); 
        
      // Auth'ed already, associating profile with current user
      } else if (user != null && profile != null) {
        
        userAPI.associateProfile(user, profile, function(apiRes){
          req.apiResponse = apiRes; // Return APIResponse
          next();
        });
      
      // Missing user or profile data, 
      } else {
        req.apiResponse = new ApiResponse(500, new Error('Profile not associated. D\'oh! Shouldn\'t have gotten to the point.'));
        next(); 
      }

    }
  },
  
  /**
   * Middleware to verify passport.authorize and make any changes to the profile 
   * before passing it on; assumes already authed
   */
  authzVerify: function(req, provider, accessToken, refreshToken, profile, done){
    console.log('auth.authzVerify');
    profile.authToken = accessToken;
    profile.authTokenSecret = refreshToken;
    
    if (!profile.id) {
      profile.id = profile.username || profile.displayName || null;
    }
    
    return done(null, profile);
  },

  /** 
   * Generic utility to initialize and use different auth Strategies, called by
   * each Strategy implementation.
   */
  useStrategy: function(provider, strategy, options, verify) {
    passport.use(
      provider.strategy,
      new strategy(options, verify)
    );
  },

  /**
   * Wrapper for useStrategy() for OAuth Strategy implementations.
   */
  useOAuthStrategy: function(provider, strategy, options, verify) {
    options = _.extend({
      callbackURL: config.getBaseUrl() + auth.getProviderCallbackUrl(provider.strategy),
      passReqToCallback: true
    }, options);
    
    verify = verify || function(req, accessToken, refreshToken, profile, done) {
      // Invalid signature
      if (arguments.length != 5 || !req || typeof(req) != 'object') {
        return done(new Error('Invalid signature in verify strategy.'), false);
      
      // Associate account with user.
      } else {
        return auth.authzVerify(req, provider, accessToken, refreshToken, profile, done);
      }
    }
    
    auth.useStrategy(provider, strategy, options, verify);
  },

  /**
   * Wrapper for useStrategy() for OpenID Strategy implementations.
   */
  useOpenIDStrategy: function(provider, strategy, options, verify) {
    options = _.extend({
      returnURL: config.getBaseUrl() + auth.getProviderCallbackUrl(provider.strategy),
      passReqToCallback: true
    }, options);
    
    verify = verify || function(req, identifier, profile, done) {
      // Invalid signature
      if (arguments.length != 4 || !req || typeof(req) != 'object') {
        return done(new Error('Invalid signature in verify strategy.'), false);
    
      // Associate account with user.
      } else {
        return auth.authzVerify(req, provider, identifier, null, profile, done);
      }
    }
    
    auth.useStrategy(provider, strategy, options, verify);
  },

  handleResponse: function() {
    return function(req, res, next) {
      console.log('auth.handleResponse');
      var http = new HttpHelper(req, res),
        apiRes = req.apiResponse || new ApiResponse(),
        redirectParams = '';
      
      // TODO: Find better way to pass success and error responses back with redirect url
      if (req.session && req.session.authredirect) {
        if (apiRes.isError()) {
          redirectParams = '?multipass_error=' + JSON.stringify( {message: apiRes.message, status: apiRes.getHTTPStatus()} );
        }
        res.redirect(req.session.authredirect + redirectParams);
      } else {
        http.send(apiRes);
      }
    }
  },
  
  getProviderLoginUrl: function(strategy) {
    return config.paths.api + '/auth/' + String(strategy).toLowerCase();
  },

  getProviderCallbackUrl: function(strategy) {
    return this.getProviderLoginUrl(strategy) + '/callback';
  },
  
  getAuthzStrategy: function(strategy) {
      return strategy + '-authz';
  },
  
  addProvider: function(provider) {
    var providerData = {
        'provider': provider.strategy,
        'loginUrl': this.getProviderLoginUrl(provider.strategy)
    };
    this.providers.push(providerData);
  },
  
  loadProviders: function(app) {
    var auth = this;
    
    if (config && config.providers) {
      Object.keys(config.providers).forEach(function(key) {
        var provider = require('./providers/' + String(key).toLowerCase()).provider;
        if (provider) {
          
          // Add provider to list of available providers
          auth.addProvider(provider);
          
          // Assign login and callback routes for provider
          
          app.get(auth.getProviderLoginUrl(provider.strategy),
            auth.authenticateApp({ session:false, forceAuth:false }),
            function(req, res, next) {
              auth.setRedirect(req);
              next();
            },
            auth.authenticateProvider(provider.strategy, { scope: provider.scope })
          );
    
          app.get(auth.getProviderCallbackUrl(provider.strategy),
            [auth.authenticateApp({ forceAuth:false }),
             auth.authenticateProvider(provider.strategy, { scope: provider.scope, failureRedirect: config.paths.failRedirect }),
             auth.associate(),
             auth.handleResponse()]
          );
        }
      });
    }
  },

  authenticateApp: function(options){
    options = _.extend({
      session: true,    // Store auth credentials in session
      forceAuth: true   // Force re-authentication, even if auth credentials exist in session
    }, options);
    
    return function(req, res, next){
      //console.log('authenticateApp', req.user);
      if (!req.isAuthenticated() || options.forceAuth) {
        console.log('authenticateApp: forceAuth');
        passport.authenticate(auth._appAuthStrategy, options)(req, res, next);
      } else {
        console.log('authenticateApp: pass');
        next();
      }
    }
  },
  
  loadAppProvider: function(strategy) {
    this._appAuthStrategy = strategy;
    
    var provider = require('./providers/' + String(strategy).toLowerCase()).provider;
    if (provider) console.log('Using app auth provider "'+strategy+'"');
    else console.log('Error loading app auth provider "'+strategy+'"');
  }
  
};

module.exports = auth;