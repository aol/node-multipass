var config = require('../conf/config')
  , ApiResponse = require('../data/apiresponse');
 

/**
 * ApiData
 */
var ApiData = function(data, req, err) {

  this.data = null;
  this.request = req;
  this.error = err;
  
  this.parse(data);
};

ApiData.prototype.getStatus = function() {
  return (!this.error ? 'Ok' : 'Error');
};

ApiData.prototype.getStatusText = function() {
  return this.error.message || 'An unknown error has occurred.';
};

ApiData.prototype.getStatusCode = function() {
  return 1;
};

ApiData.prototype.parse = function(data) {
  this.data = data;
};

ApiData.prototype.output = function() {
  var output = {
    data : this.data,
    status : this.getStatus()
  };
  if (this.error) {
    output.data = null;
    output.statusText = this.getStatusText();
    output.statusCode = this.getStatusCode();
  }
  return output;
};


/**
 * HttpHelper
 */
var HttpHelper = function(req, res) {
  this.request = req;
  this.response = res;
  
  this.status = null;
  this.headers = {};
  this.responseData = null;
};

HttpHelper.errorHandler = function(err, req, res, next) {
  var http = new HttpHelper(req, res);
  var data = new ApiResponse(500, Error('Oops, appears we have a problem.'));   
  http.send(data);
};

/**
 * Check whether request is secure, and only allow HTTPS or HTTP based on 
 * config.https value, but don't allow both at same time.
 */
HttpHelper.sslHandler = function(req, res, next) {
  var http = new HttpHelper(req, res);
  
  // Must be secure HTTPS
  if (config.https && !http.isSecure()) {
    var err = new ApiResponse(400, Error('Only HTTPS protocol is allowed.'));
    http.send(err);
  // Must be plain ol' HTTP
  } else if (!config.https && http.isSecure()) {
    var err = new ApiResponse(400, Error('Only HTTP protocol is allowed.'));
    http.send(err);
  // We're good, continue onto next route
  } else {
    next();
  }
};

HttpHelper.prototype.isSecure = function() {
  return (this.request.secure || this.request.get('x-forwarded-proto') == 'https');
};

HttpHelper.prototype.send = function(data) {
  
  if (data instanceof ApiResponse) {
    // If error response
    if (data.isError()) {
      if (this.status == null) {
        this.status = data.httpStatus || 500;
      }
      this.responseData = new ApiData(null, this.request, data);

      console.error('Error ['+this.status+':'+this.responseData.getStatusCode()+']: ' + this.responseData.getStatusText());
    
    // If success response
    } else {
      if (this.status == null) {
        this.status = data.httpStatus || 200;
      }
      this.responseData = new ApiData(data.getData(), this.request, null);
      
      // Add cache headers
      if (config.cacheHeadersEnabled) {
        var lastModified = data.getLastModifiedDate();
        if (lastModified) {
          this.headers['Last-Modified'] = lastModified;
        }
        var etag = data.getETag();
        if (etag) {
          this.headers['ETag'] = etag;
        }
      }
    }
  } else {
    if (this.status == null) {
      this.status = 200;
    }
    this.responseData = new ApiData(data, this.request, null);
  }
  
  this.response.set(this.headers);
  
  this.response.jsonp(this.status, this.responseData.output());
};

module.exports = HttpHelper;