'use strict'

/*
 * adonis-auth
 *
 * (c) Harminder Virk <virk@adonisjs.com>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
*/

const Resetable = require('resetable')
const ms = require('ms')
const uuid = require('uuid')
const BaseScheme = require('./Base')
const CE = require('../Exceptions')

class SessionScheme extends BaseScheme {
  constructor () {
    super()
    this._rememberTokenDuration = new Resetable(0)
  }

  /**
   * The key used for storing session
   *
   * @attribute sessionKey
   *
   * @return {String}
   */
  get sessionKey () {
    return this._config.sessionKey || 'adonis-auth'
  }

  /**
   * The key used for remember me token
   *
   * @attribute remeberTokenKey
   *
   * @return {String}
   */
  get remeberTokenKey () {
    return this._config.rememberMeToken || 'adonis-remember-token'
  }

  /**
   * Set authentication session on user instance
   *
   * @method _setSession
   *
   * @param  {Number|String}    primaryKeyValue
   * @param  {String}           [rememberToken]
   * @param  {Number}           [duration]
   *
   * @returns {void}
   *
   * @private
   */
  _setSession (primaryKeyValue, rememberToken, duration) {
    this._ctx.session.put(this.sessionKey, primaryKeyValue)

    /**
     * Set remember me cookie when token and duration is
     * defined
     */
    if (rememberToken && duration) {
      this._ctx.response.cookie(this.remeberTokenKey, rememberToken, {
        expires: duration
      })
    }
  }

  /**
   * Removes the session value from the store
   * and clears the remember cookie
   *
   * @method _removeSession
   *
   * @return {void}
   */
  _removeSession () {
    this._ctx.session.forget(this.sessionKey)
    this._ctx.response.clearCookie(this.remeberTokenKey)
  }

  /**
   * Remeber the user login
   *
   * @method remember
   *
   * @param  {String|Number} [duration = 5y]
   *
   * @chainable
   */
  remember (duration) {
    if (duration === true || duration === 1) {
      this._rememberTokenDuration.set(ms('5y'))
    } else if (typeof (duration) === 'string') {
      this._rememberTokenDuration.set(ms(duration))
    } else if (duration !== 0 && duration !== false) {
      this._rememberTokenDuration.set(duration)
    }
    return this
  }

  /**
   * Validate user credentials
   *
   * @method validate
   *
   * @param  {String} uid
   * @param  {String} password
   * @param  {Boolean} returnUser
   *
   * @return {Object}
   *
   * @throws {UserNotFoundException} If unable to find user with uid
   * @throws {PasswordMisMatchException} If password mismatches
   */
  async validate (uid, password, returnUser) {
    const user = await this._serializerInstance.findByUid(uid)
    if (!user) {
      throw CE.UserNotFoundException.invoke(`Cannot find user with ${this._config.uid} as ${uid}`)
    }

    const validated = await this._serializerInstance.validateCredentails(user, password)
    if (!validated) {
      throw CE.PasswordMisMatchException.invoke('Cannot verify user password')
    }

    return returnUser ? user : !!user
  }

  /**
   * Attempt to login the user
   *
   * @method attempt
   *
   * @param  {String} uid
   * @param  {String} password
   *
   * @return {Object}
   */
  async attempt (uid, password) {
    const user = await this.validate(uid, password, true)
    return this.login(user)
  }

  /**
   * Login a user using the user object. Make sure
   * the user exists in database, since this
   * method doesn't verify that
   *
   * @method login
   *
   * @param  {Object} user
   *
   * @return {Object}
   */
  async login (user) {
    if (this.user) {
      throw CE.RuntimeException.authenticatedInstance()
    }

    this.user = user

    /**
     * Make sure primary key value exists.
     */
    if (!this.primaryKeyValue) {
      throw CE.RuntimeException.missingUid()
    }

    /**
     * Set user remember token when remember token
     * duration is defined.
     */
    const duration = this._rememberTokenDuration.pull()
    const rememberToken = duration ? uuid.v4() : null
    if (rememberToken) {
      await this._serializerInstance.saveRememberToken(user, rememberToken)
    }

    this._setSession(this.primaryKeyValue, rememberToken, duration)
    return user
  }

  /**
   * Login a user using it's id
   *
   * @method loginViaId
   *
   * @param  {Number|String}   id
   *
   * @return {Object}
   */
  async loginViaId (id) {
    const user = await this._serializerInstance.findById(id)
    if (!user) {
      throw CE.UserNotFoundException.invoke(`Cannot find user with ${this.primaryKey} as ${id}`)
    }

    return this.login(user)
  }

  /**
   * Logout a user by removing the required
   * cookies.
   *
   * @method logout
   *
   * @return {void}
   */
  logout () {
    this.user = null
    this._removeSession()
  }

  /**
   * Check whether a user is logged in or
   * not. Also this method will re-login
   * the user when remember me token
   * is defined
   *
   * @method check
   *
   * @return {Boolean}
   */
  async check () {
    if (this.user) {
      return true
    }

    const sessionValue = this._ctx.session.get(this.sessionKey)
    const rememberMeToken = this._ctx.request.cookie(this.remeberTokenKey)

    if (sessionValue) {
      this.user = await this._serializerInstance.findById(sessionValue)
      return !!this.user
    } else if (rememberMeToken) {
      const user = await this._serializerInstance.findByRememberToken(rememberMeToken)
      if (user) {
        this.login(user)
      }
      return !!user
    }

    return false
  }

  /**
   * Makes sure user is loggedin and then
   * returns the user back
   *
   * @method getUser
   *
   * @return {Object}
   */
  async getUser () {
    await this.check()
    return this.user
  }
}

module.exports = SessionScheme