var mongoose = require('mongoose')
  , config = require('../conf/config')
  , Schemas = require('./schemas')
  , uuid = require('node-uuid')
  , ApiResponse = require('./apiresponse');


var User = mongoose.model('User', Schemas.User, config.mongo.collection);

var fieldInclusions = { '__v':0 };  // 0==exclude, 1==include

function buildUser(context, profile) {
  profile = profile || {};
  var userProfile = buildUserProfile(profile);

  var user = new User({
    userId : context.userId || uuid.v4(),
    appId : context.appId,
    creationDate : Date.now(),
    modifiedDate : Date.now()
  });
  user.profiles.push(userProfile);

  return user;
};

function buildUserProfile(profile){
  profile = profile || {};
  var data = { 
      provider : profile.provider,
      providerId : profile.id,
      username : profile.username,
      displayName : profile.displayName,
      familyName : profile.familyName,
      givenName : profile.givenName,
      gender : profile.gender,
      profileUrl : profile.profileUrl,
      authToken : profile.authToken,
      emails : profile.emails,
      creationDate : Date.now(),
      modifiedDate : Date.now()
  };
  return data;
};

function updateUserProfile(profile){
  profile = profile || {};
  var data = {
      username : profile.username,
      displayName : profile.displayName,
      familyName : profile.familyName,
      givenName : profile.givenName,
      gender : profile.gender,
      profileUrl : profile.profileUrl,
      authToken : profile.authToken,
      emails : profile.emails,
      modifiedDate : Date.now()
  };
  return data;
};

/**
 * Link multiple user accounts together that have the same auth profile.
 * @param {Array} users Array of User documents that all contain the same auth profile. 
 * @param {Function} callback Callback function called once completed linking requests. 
 *   Returns array of ApiResponse objects, if applicable. 
 */
function linkUsers(users, callback) {
  var responses = [];
  users = users || [];
  
  // More than one user, link the accounts
  if (users.length > 1) {
    console.log('More than one matching user found! Linking the accounts...');
    
    users.forEach(function(user, i){
      // Get list of all userIds to associate each user
      var linkedUserIds = users.filter(function(value){
        // Filter down to all users but current one
        return value.userId !== user.userId;
      })
      .map(function(value){
        // Copy profiles into this user
        copyProfiles(value, user);

        // Return only userIds
        return value.userId;
      });
      
      user.linkedUsers = linkedUserIds;
      user.save(function(err,doc) {
        var res = null;
        if (err) {
          res = new ApiResponse(500, err, 'Error updating the user.');
        } else {
          res = new ApiResponse(doc);
        }
        responses.push(res);
        // Execute callback once collected all responses
        if (responses.length == users.length) {
          callback(responses);
        }
      });
    });
  // Only one user, do nothing
  } else {
    callback(responses);
  }
};

/**
 * Copy all profiles from sourceUser into targetUser, that targetUser doesn't already have. 
 * The targetUser object will be marked modified, need to save elsewhere to keep changes.
 * @param {User} sourceUser
 * @param {User} targetUser
 */
function copyProfiles(sourceUser, targetUser) {
  
  // Generate Array of unique profiles to copy into targetUser
  var toCopy = sourceUser.profiles.filter(function(srcValue, srcIndex){
    var exists = targetUser.profiles.some(function(val, i){
      return (val.provider == srcValue.provider && val.providerId == srcValue.providerId);
    });
    return (!exists);
  });
  
  if (toCopy.length) {
    toCopy.forEach(function(val, i){
      var copiedProfile = val.toObject(); // Convert Document to plain object
      delete copiedProfile._id; // Remove old _id, so new one will be generated
      copiedProfile.originalUserId = sourceUser.userId; // Add originalUserId, so we know where this profile came from
      
      // Add copied profile to target user
      targetUser.profiles.push(copiedProfile);
    });
  }
};


var userAPI = {
  
  /**
   * Responses:
   *  success: [200] {User} The updated User object, if user found and profile updated.
   *  success: [201] {User} The User object that was added, if didn't exist exists.
   *  error:   [404] If user found, but profile was not found.
   *  error:   [500] If there were any system errors.
   */
  findOrAddUser : function(context, profile, callback) {
    profile = profile || {};
    
    this.findUsersByProfile(context, profile, function(apiRes){
      if (apiRes.isError()) {
        callback(apiRes);
      } else {
        var users = apiRes.getData(),
          mostRecentUser = null;
        
        // Matching user(s) found, update the profile
        if (users && users.length) {
          mostRecentUser = users[0];
          
          // Link users together, if more than one
        //  linkUsers(users, function(responses){
            // Update profile with latest data
            userAPI.updateProfileByUser(mostRecentUser, profile, callback);
        //  });
          
        // No user found, create user  
        } else {
          userAPI.addUser(context, profile, callback);
        }
      }
    });
  },
  
  /**
   * Responses:
   *  success: [200] An Array of User objects that match the profile.
   */
  findUsersByProfile : function(context, profile, callback) {
    profile = profile || {};
    User.find({'appId':context.appId, 'userId':context.userId, 'profiles.provider':profile.provider, 'profiles.providerId':profile.id},
      fieldInclusions,
      { sort:{ modifiedDate:-1 } }, // Sort by modifiedDate, DESC
      function(err, users){
        var res = null;
        // Error in the request
        if (err) {
          res = new ApiResponse(500, err, 'Error finding the users.');
        // Return array of users - may be empty  
        } else {
          res = new ApiResponse(users); 
        }
        callback(res);
      }
    );
  },
  
  /**
   * Responses:
   *  success: [201] The user object that was added.
   */
  addUser : function(context, profile, callback) {
    console.log('userAPI.addUser');
    var newUser = buildUser(context, profile);
    newUser.save(function(err,doc) {
      var res = null;
      if (err) {
        res = new ApiResponse(500, err, 'Error creating the user.');
      } else {
        res = new ApiResponse(201, doc);
      }
      callback(res);
    });
  },
  
  /**
   * Responses:
   *  success: [200] The user object that was found.
   */
  getUser : function(context, allowEmptyResult, callback) {
    User.findOne({'appId':context.appId, 'userId':context.userId},
      fieldInclusions,
      function(err, doc){
        var res = null;
        if (err) {
          res = new ApiResponse(500, err, 'Error retriving the user.');
        } else if (!doc && !allowEmptyResult) {
          res = new ApiResponse(404, Error('The user cannot be found.'));
        } else {
          res = new ApiResponse(doc);
        }
        callback(res);
      }
    );
  },
  
  /**
   * Responses:
   *  success: [200] The user object that was removed.
   */
  removeUser : function(context, callback) {
    User.findOne({'appId':context.appId, 'userId':context.userId},
      fieldInclusions,  
      function(err, doc){
        var res = null;
        if (err) {
          res = new ApiResponse(404, err, 'The user cannot be found.');
          callback(res);
        } else {
          doc.remove(function (err, removedDoc) {
            if (err) {
              res = new ApiResponse(500, err, 'Error deleting the user.');
            } else {
              res = new ApiResponse(removedDoc);
            }
            callback(res);
          });
        }
      }
    );
  },
  
  /**
   * Responses:
   *  success: [200] The profile object that was found.
   */
  getProfile : function(context, provider, providerId, callback) {
    this.getUser(context, false,
      function(res){
        if (res.isError()) {
          callback(res);
        } else {
          var u = res.data,
            userProfile = userAPI.findProfileByUser(u, provider, providerId);
          
          if (!userProfile) {
            res = new ApiResponse(404, Error('The profile cannot be found.'));
          } else {
            res = new ApiResponse(userProfile);
          }
          callback(res);
        }
      }
    );
  },
  
  /**
   * Responses:
   *  success: [201] The profile object that was added.
   */
  addProfile : function(context, profile, callback) {
    console.log('userAPI.addProfile');
    this.getUser(context, false,
      function(res){
        if (res.isError()) {
          callback(res);
        } else {
          var u = res.data,
            userProfile = buildUserProfile(profile);
          
          u.profiles.push(userProfile);
          u.modifiedDate = Date.now();
          u.markModified('profiles');
          u.save(function(err,doc) {
            if (err) {
              res = new ApiResponse(500, err, 'Error creating the profile.');
            } else {
              res = new ApiResponse(201, userProfile);
            }
            callback(res);
          });
        }
      }
    );
  },
  
  /**
   * Responses:
   *  success: [200] The profile object that was removed.
   */
  removeProfile : function(context, provider, providerId, callback) {
    this.getUser(context, false,
      function(res){
        if (res.isError()) {
          callback(res);
        } else {
          var u = res.data,
            matchingProfile = userAPI.findProfileByUser(u, provider, providerId);
          
          if (!matchingProfile) {
            res = new ApiResponse(404, Error('The profile cannot be found.'));
            callback(res);
          } else {
            matchingProfile.remove();
            u.save(function(err,doc) {
              if (err) {
                res = new ApiResponse(500, err, 'Error deleting the profile.');
              } else {
                res = new ApiResponse(matchingProfile);
              }
              callback(res);
            });
          }
        }
      }
    );
  },
  
  /**
   * @returns {UserProfile} The profile object that was found, or null.
   */
  findProfileByUser : function(user, provider, providerId) {
    var profiles = user && user.profiles,
      matchingProfile = null;
    
    if (profiles && profiles.length) {
      for (var i=0; i < profiles.length; i++) {
        if (profiles[i].provider == provider && profiles[i].providerId == providerId) {
          matchingProfile = profiles[i];
          break;
        }
      }
    }
    
    return matchingProfile;
  },
  
  /**
   * Responses:
   *  success: [200] The user object whose profile was updated.
   */
  updateProfileByUser : function(user, profile, callback) {
    console.log('userAPI.updateProfileByUser');
    var matchingProfile = userAPI.findProfileByUser(user, profile.provider, profile.id),
      res = null;
    
    // Matching profile found, update the profile
    if (matchingProfile != null) {
      
      matchingProfile.set( updateUserProfile(profile) );
      user.modifiedDate = Date.now();
      user.markModified('profiles');
      
      user.save(function(err,doc){
        if (err) {
          res = new ApiResponse(500, err, 'Error updating the profile.');
        } else {
          res = new ApiResponse(doc);
        }
        callback(res);
      });
  
    // No profile found, return error
    } else {
      res = new ApiResponse(404, Error('The profile cannot be found'));
      callback(res);
    }
  },
  
  /**
   * Associate a profile with a user.
   * If the user doesn't exist 
   */
  associateProfile : function(context, profile, callback) {
    this.getUser(context, true, function(apiRes) {
      var data, matchingProfile;
      
      if (apiRes.isError()) {
        callback(apiRes);
        
      } else {
        data = apiRes.getData();
        
        // User exists
        if (data) {
          matchingProfile = userAPI.findProfileByUser(data, profile.provider, profile.id);
          
          // If no matching profile exists, add profile
          if (!matchingProfile) {
            userAPI.addProfile(context, profile, callback);
            
          // Else profile already exists, update profile
          } else {
            userAPI.updateProfileByUser(data, profile, callback);
          }
          
        // No user exists, so create it
        } else {
          userAPI.addUser(context, profile, callback);
        }
      }
    });
  }
  
};

module.exports = userAPI;