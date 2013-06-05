var passport = require('passport')
  , config = require('../conf/config')
  , auth = require('../auth')
  , userAPI = require('../data/user')
  , HttpHelper = require('./httphelper')
  , ApiResponse = require('../data/apiresponse')
  , appRoutes = require('./app');


module.exports = function(app){

  /**
   * [*] /*
   * 
   * Process all requests for initial validation or normalization tasks:
   * Detect if SSL; return error is sslRequired and not https
   */
  app.all('/*', 
    HttpHelper.sslHandler
  );
  
  /**
   * [*] /api/*
   * 
   * Process all requests under the API:
   * * Validate app credentials
   */
  //app.all(config.paths.api + '/*', 
  //  auth.appAuthHandler
  //);
  
  /**
   * GET /api/user
   * 
   * Gets the complete user object for current user, including all associated profiles.
   */
  app.get(config.paths.api + '/user',
    auth.authenticateApp(),
    function(req, res) {
      var http = new HttpHelper(req, res);
      
      userAPI.getUser(req.user, false, function(data) {
        http.send(data);
      });
    }
  );
  
  /**
   * DELETE /api/user
   * 
   * Remove all user data for current user, and logs out the current session.
   */
  app.delete(config.paths.api + '/user',
    auth.authenticateApp(), 
    function(req, res) {
      var http = new HttpHelper(req, res);
      
      userAPI.removeUser(req.user, function(data) {
        req.logout(); // Must logout so session data for this user doesn't persist
        http.send(data);
      });
    }
  );

  /**
   * GET /api/user/:provider/:providerId
   * 
   * Get an auth profile for current user, by given provider name and id.
   */
  app.get(config.paths.api + '/user/:provider/:providerId', 
    auth.authenticateApp(),
    function(req, res, next) {
      var http = new HttpHelper(req, res);
      
      userAPI.getProfile(req.user, req.params.provider, req.params.providerId, function(data){
        http.send(data);
      });
    }
  );
  
  /**
   * DELETE /api/user/:provider/:providerId
   * 
   * Remove an auth profile for current user, by given provider name and id.
   */
  app.delete(config.paths.api + '/user/:provider/:providerId', 
    auth.authenticateApp(),
    function(req, res, next) {
      var http = new HttpHelper(req, res);
    
      userAPI.removeProfile(req.user, req.params.provider, req.params.providerId, function(data){
        http.send(data);
      });
    }
  );
  
  /**
   * GET /api/auth/providers
   * 
   * Get list of available auth providers, and their login URLs.
   */
  app.get(config.paths.api + '/auth/providers',
    auth.authenticateApp(),
    function(req, res, next) {
      var http = new HttpHelper(req, res);
      var data = new ApiResponse(auth.providers || []);
      http.send(data);
    }
  );
  
  
  /* Pull in App API routes */
  appRoutes(app);
  
  /* Pull in plugin routes */
  if (app.get('plugins')) {
    var plugin, pluginName;
    for (pluginName in app.get('plugins')) {
      plugin = app.get('plugins')[pluginName];
      if (plugin.routes) {
        plugin.routes(app);
      }
    }
  }
  
  
  /**
   * [*] /api/*
   * 
   * Catch all other requests and return 400 error. 
   */
  app.all(config.paths.api + '/*', 
    auth.authenticateApp(),
    function(req, res) {
      var http = new HttpHelper(req, res);
      var err = new ApiResponse(400, Error('Invalid request'));
      http.send(err);
    }
  );
  
  /**
   * Amend express.param() to accept second param as regexp.
   * Skips to next route if regexp not matched.
   */
  app.param(function(name, fn){
    if (fn instanceof RegExp) {
      return function(req, res, next, val){
        var captures;
        if (captures = fn.exec(String(val))) {
          req.params[name] = captures;
          next();
        } else {
          next('route');
        }
      }
    }
  });
  
  /**
   * Validate :provider param
   */
  app.param('provider', /^[\w-]+$/i);
  
  /**
   * Validate :providerId param
   */
  app.param('providerId', /^[\w-]+$/i);
  
  /**
   * Validate :userId param
   */
  app.param('userId', /^[\w-]+$/i);
};