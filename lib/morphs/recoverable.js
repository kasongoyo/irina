'use strict';

//dependencies
var path = require('path');
var Utils = require(path.join(__dirname, '..', 'utils'));
const randomize = require('randomatic');

/**
 * @constructor
 * 
 * @description Recoverable takes care of resetting account password 
 *              and send reset instructions.
 *              See {@link http://www.rubydoc.info/github/plataformatec/devise/master/Devise/Models/Recoverable|Recoverable}
 *
 * @public
 */
module.exports = exports = function Recoverable(schema, options) {
  //prepare options
  options = options || {};

  //add recoverable schema attributes
  schema.add({
    recoveryToken: {
      type: String,
      default: null,
      index: true,
      hide: true
    },
    recoveryTokenExpiryAt: {
      type: Date,
      default: null,
      hide: true
    },
    recoverySentAt: {
      type: Date,
      default: null,
      hide: true
    },
    recoveredAt: {
      type: Date,
      default: null,
      hide: true
    }
  });


  //--------------------------------------------------------------------------
  //recoverable instance methods
  //--------------------------------------------------------------------------

  /**
   * @function
   *
   * @description generate recovery token to be used to recover account
   *              This function must be called within model instance context
   *
   * @param {generateRecoveryToken~callback} done callback that handles the response.
   * @return Promise resolve with recoverable or reject with error
   * @private
   */
  schema.methods.generateRecoveryToken = function (done) {
    //this refer to the model instance context
    var recoverable = this;

    //set recovery expiration date
    var recoveryTokenExpiryAt =
      Utils.addDays(options.recoverable.tokenLifeSpan);

    //set recoveryToken
    recoverable.recoveryToken = getRecoveryToken({
      recoveryTokenExpiryAt,
      email: recoverable.email
    }, options.recoverable.tokenType);

    //set recovery token expiry date
    recoverable.recoveryTokenExpiryAt = recoveryTokenExpiryAt;

    //clear previous recovery details if any
    recoverable.recoveredAt = null;
    if (done) {
      done(null, recoverable);
    }
    return Promise.resolve(recoverable);
  };
  //documentation for `done` callback of `generateRecoveryToken`
  /**
   * @description a callback to be called once generate recovery token is done
   * @callback generateRecoveryToken~callback
   * @param {Object} error any error encountered during generating recovery token
   * @param {Object} recoverable recoverable instance with `recoveryToken`,
   *                             and `recoveryTokenExpiryAt` set-ed
   */


  /**
   * @function
   *
   * @description send recovery instructions to allow account to be recovered.
   *              This method must be called within model instance context
   *
   * @param {sendRecovery~callback} done callback that handles the response.
   * @return Promise resolve with recoverable or reject with error
   * @private
   */
  schema.methods.sendRecovery = function (done) {
    //this refer to model instance context
    var recoverable = this;

    var isRecovered =
      recoverable.recoveredAt && recoverable.recoveredAt !== null;

    //if already recovered back-off
    if (isRecovered) {
      if (done) {
        done(null, recoverable);
      }
      return Promise.resolve(recoverable);
    }

    //send recovery instructions
    else {
      return new Promise((resolve, reject) => {
        recoverable
          .send(
            'Password recovery',
            recoverable,
            function finish() {
              //update recovery send time
              recoverable.recoverySentAt = new Date();

              //save recoverable instance
              recoverable.save(function (error) {
                if (error) {
                  if (done) {
                    done(error);
                  }
                  reject(error);
                } else {
                  if (done) {
                    done(null, recoverable);
                  }
                  resolve(recoverable);
                }
              });
            });
      });
    }
  };
  //documentation for `done` callback of `sendRecovery`
  /**
   * @description a callback to be called once sending recovery instructions is done
   * @callback sendRecovery~callback
   * @param {Object} error any error encountered during sending recovery instructions
   * @param {Object} crecoverable recoverable instance with `recoverySentAt`
   *                              updated and persisted
   */


  //--------------------------------------------------------------------------
  //recoverable static/class methods
  //--------------------------------------------------------------------------


  /**
   * @function
   * 
   * @description request user password recovering
   * 
   * @param  {Objecr}   criteria criteria to be used to find a requesting user
   * @param  {requestRecover~callback} done callback that handles the response
   * @return Promise resolve with recoverable or reject with error
   * @public
   */
  schema.statics.requestRecover = function (criteria, done) {
    //this refer to model static context
    var Recoverable = this;

    return Recoverable
      .findOne(criteria)
      .exec()
      .then(recoverable => {
        const recoverableNotExist = (
          recoverable === undefined ||
          recoverable === null
        );
        if (recoverableNotExist) {
          throw new Error('Invalid recovery details');
        }
        return recoverable;
      })
      .then(recoverable => {
        return recoverable.generateRecoveryToken();
      })
      .then(recoverable => {
        return recoverable.sendRecovery();
      })
      .then(recoverable => {
        if (done) {
          done(null, recoverable);
        }
        return recoverable;
      })
      .catch(error => {
        if (error) {
          if (done) {
            done(error);
          } else {
            throw error;
          }
        }
      });
  };
  //documentation for `done` callback of `requestRecover`
  /**
   * @description a callback to be called once requesting password recovering 
   *              is done
   * @callback requestRecover~callback
   * @param {Object} error any error encountered during requesting password recover
   * @param {Object} recoverable recoverable instance
   */



  /**
   * @function
   *
   * @description recover account password
   *              This method must be called within model static context
   *
   * @param  {String}   recoveryToken a valid recovery token send during
   *                                      `sendRecovery`
   * @param  {String}   newPassword    new password to be used when recover account
   * @param {recover~callback} done callback that handles the response.
   * @return Promise resolve with recoverable or reject with error
   * @private
   */
  schema.statics.recover = function (recoveryToken, newPassword, done) {
    //this refer to model static context
    var Recoverable = this;

    //TODO sanitize input
    //refactor
    const token = new RegExp(recoveryToken, 'i');
    return Recoverable
      .findOne({
        recoveryToken: { $regex: token }
      })
      .exec()
      .then(recoverable => {
        const recoverableNotExist = recoverable === undefined || recoverable === null;
        if (recoverableNotExist) {
          const error = new Error('Invalid recovery token');
          if (done) {
            done(error);
          }
        }
        return recoverable;
      })
      .then(recoverable => {
        //check if recovery token expired
        var isTokenExpired = !Utils.isAfter(new Date(), recoverable.recoveryTokenExpiryAt);

        if (isTokenExpired) {
          const error = new Error('Recovery token expired');
          if (done) {
            done(error);
          }
        }
        return recoverable;
      })
      .then(recoverable => {
        //verify recovery token
        var value =
          recoverable.recoveryTokenExpiryAt.getTime().toString();

        var tokenizer =
          Utils.tokenizer(value);

        if (!options.recoverable.tokenType || options.recoverable.tokenType !== 'passcode') {
          if (!tokenizer.match(recoveryToken, recoverable.email)) {
            const error = new Error('Invalid recovery token');
            if (done) {
              done(error);
            }
          }
        }
        //is valid token
        return recoverable;
      })
      .then(recoverable => {
        //set new password
        recoverable.password = newPassword;
        //encrypt password
        return recoverable.encryptPassword();
      })
      .then(recoverable => {
        //update recovery details
        recoverable.recoveredAt = new Date();

        //save recoverable instance
        return recoverable
          .save()
          .then(() => {
            if (done) {
              done(null, recoverable);
            }
            return recoverable;
          });
      })
      .catch(error => {
        if (error) {
          if (done) {
            done(error);
          }
          throw error;
        }
      });

  };
  //documentation for `done` callback of `recover`
  /**
   * @description a callback to be called once recovery is done
   * @callback recover~callback
   * @param {Object} error any error encountered during recovering account
   * @param {Object} recoverable recoverable instance with `recoveredAt`
   *                             updated and persisted
   */
};

/**
 * Create the actual token
 * @param {payload} payload 
 * @param {*} tokenType 
 */
function getRecoveryToken(payload, tokenType) {
  if (tokenType && tokenType === 'passcode') {
    return randomize('0', 6);
  } else {
    //generate confirmation token based
    //on confirmation token expiry at
    const tokenizer =
      Utils.tokenizer(payload.recoveryTokenExpiryAt.getTime().toString());

    //set confirmationToken
    return tokenizer.encrypt(payload.email);
  }
}