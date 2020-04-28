/*
 * @adonisjs/auth
 *
 * (c) Harminder Virk <virk@adonisjs.com>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
*/

declare module '@ioc:Adonis/Addons/Auth' {
  import { IocContract } from '@adonisjs/fold'
  import { HashersList } from '@ioc:Adonis/Core/Hash'
  import { QueryClientContract } from '@ioc:Adonis/Lucid/Database'
  import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'
  import { DatabaseQueryBuilderContract } from '@ioc:Adonis/Lucid/DatabaseQueryBuilder'
  import { LucidModel, LucidRow, ModelQueryBuilderContract } from '@ioc:Adonis/Lucid/Model'

  /*
  |--------------------------------------------------------------------------
  | Helpers
  |--------------------------------------------------------------------------
  */

  /**
   * Unwraps user from the provider user
   */
  type UnWrapProviderUser<T> = T extends ProviderUserContract<any> ? Exclude<T['user'], null> : T

  /**
   * Returns the real user from the provider user
   */
  export type GetProviderRealUser<
    Provider extends keyof ProvidersList
  > = UnWrapProviderUser<ReturnType<ProvidersList[Provider]['implementation']['getUserFor']>>

  /*
  |--------------------------------------------------------------------------
  | Providers
  |--------------------------------------------------------------------------
  */

  /**
   * Provider user works as a bridge between the provider real user
   * and the guard. It is never exposed to the end-user.
   */
  export interface ProviderUserContract<User extends any> {
    user: User | null,
    getId (): string | number | null,
    verifyPassword: (plainPassword: string) => Promise<boolean>,
    getRememberMeToken (): string | null,
    setRememberMeToken (token: string): void,
  }

  /**
   * The interface that every provider must implement
   */
  export interface ProviderContract<User extends any> {
    /**
     * Return an instance of the user wrapped inside the Provider user contract
     */
    getUserFor (user: User): ProviderUserContract<User>

    /**
     * Find a user using the primary key value
     */
    findById (id: string | number): Promise<ProviderUserContract<User>>,

    /**
     * Find a user by searching for their uids
     */
    findByUid (uid: string): Promise<ProviderUserContract<User>>,

    /**
     * Find a user using the remember me token
     */
    findByRememberMeToken (userId: string | number, token: string): Promise<ProviderUserContract<User>>,

    /**
     * Update remember token
     */
    updateRememberMeToken (authenticatable: ProviderUserContract<User>): Promise<void>
  }

  /*
  |--------------------------------------------------------------------------
  | Lucid Provider
  |--------------------------------------------------------------------------
  */

  /**
   * The shape of the user model accepted by the Lucid provider. The model
   * must have `password` and `rememberMeToken` attributes.
   */
  export type LucidProviderModel = LucidModel & {
    new (): LucidRow & {
      password: string,
      rememberMeToken?: string | null,
    }
  }

  /**
   * Shape of the lucid provider user builder. It must return [[ProviderUserContract]]
   */
  export interface LucidProviderUserBuilder<User extends LucidProviderModel> {
    new (
      user: InstanceType<User> | null,
      config: LucidProviderConfig<User>,
      ...args: any[],
    ): ProviderUserContract<InstanceType<User>>,
  }

  /**
   * Lucid provider
   */
  export interface LucidProviderContract<User extends LucidProviderModel> extends ProviderContract<InstanceType<User>> {
    /**
     * Define a custom connection for all the provider queries
     */
    setConnection (connection: string | QueryClientContract): this

    /**
     * Before hooks
     */
    before (event: 'findUser', callback: (query: ModelQueryBuilderContract<User>) => Promise<void>): this

    /**
     * After hooks
     */
    after (event: 'findUser', callback: (user: InstanceType<User>) => Promise<void>): this
  }

  /**
   * The config accepted by the Lucid provider
   */
  export type LucidProviderConfig<User extends LucidProviderModel> = {
    driver: 'lucid',
    model: User,
    uids: (keyof InstanceType<User>)[],
    identifierKey: string,
    connection?: string,
    hashDriver?: keyof HashersList,
    user?: LucidProviderUserBuilder<User>,
  }

  /*
  |--------------------------------------------------------------------------
  | Database Provider
  |--------------------------------------------------------------------------
  */

  /**
   * Shape of the row returned by the database provider. The table must have `password`
   * and `remember_me_token` columns.
   */
  export type DatabaseProviderRow = {
    password: string,
    remember_me_token?: string,
    [key: string]: any,
  }

  /**
   * Shape of database provider user builder. It must always returns [[ProviderUserContract]]
   */
  export interface DatabaseProviderUserBuilder {
    new (
      user: DatabaseProviderRow | null,
      config: DatabaseProviderConfig,
      ...args: any[],
    ): ProviderUserContract<DatabaseProviderRow>,
  }

  /**
   * Database provider
   */
  export interface DatabaseProviderContract<User extends DatabaseProviderRow> extends ProviderContract<User> {
    /**
     * Define a custom connection for all the provider queries
     */
    setConnection (connection: string | QueryClientContract): this

    /**
     * Before hooks
     */
    before (event: 'findUser', callback: (query: DatabaseQueryBuilderContract) => Promise<void>): this

    /**
     * After hooks
     */
    after (event: 'findUser', callback: (user: DatabaseProviderRow) => Promise<void>): this
  }

  /**
   * The config accepted by the Database provider
   */
  export type DatabaseProviderConfig = {
    driver: 'database',
    uids: string[],
    usersTable: string,
    identifierKey: string,
    connection?: string,
    hashDriver?: keyof HashersList,
    user?: DatabaseProviderUserBuilder,
  }

  /*
  |--------------------------------------------------------------------------
  | Guards
  |--------------------------------------------------------------------------
  */
  export interface GuardContract<
    Provider extends keyof ProvidersList,
    Guard extends keyof GuardsList,
  > {
    name: Guard,

    /**
     * Reference to the logged in user.
     */
    user?: GetProviderRealUser<Provider>

    /**
     * Find if the user has been logged out in the current request
     */
    isLoggedOut: boolean

    /**
     * A boolean to know if user is a guest or not. It is
     * always opposite of [[isLoggedIn]]
     */
    isGuest: boolean

    /**
     * A boolean to know if user is logged in or not
     */
    isLoggedIn: boolean

    /**
     * A boolean to know if user is retrieved by authenticating
     * the current request or not.
     */
    isAuthenticated: boolean

    /**
     * Whether or not the authentication has been attempted
     * for the current request
     */
    authenticationAttempted: boolean

    /**
     * Reference to the provider for looking up the user
     */
    provider: ProvidersList[Provider]['implementation']

    /**
     * Verify user credentials.
     */
    verifyCredentials (uid: string, password: string): Promise<GetProviderRealUser<Provider>>

    /**
     * Attempt to verify user credentials and perform login
     */
    attempt (uid: string, password: string, ...args: any[]): Promise<any>

    /**
     * Login a user without any verification
     */
    login (user: GetProviderRealUser<Provider>, ...args: any[]): Promise<any>

    /**
     * Login a user using their id
     */
    loginViaId (id: string | number, ...args: any[]): Promise<any>

    /**
     * Attempts to authenticate the user for the current HTTP request. An exception
     * is raised when unable to do so
     */
    authenticate (): Promise<GetProviderRealUser<Provider>>

    /**
     * Attempts to authenticate the user for the current HTTP request and supresses
     * exceptions raised by the [[authenticate]] method and returns a boolean
     */
    check (): Promise<boolean>

    /**
     * Logout user
     */
    logout (...args: any[]): Promise<void>
  }

  /*
  |--------------------------------------------------------------------------
  | Session Guard
  |--------------------------------------------------------------------------
  */

  /**
   * Shape of data emitted by the login event
   */
  export type SessionLoginEventData<Provider extends keyof ProvidersList> = {
    name: string,
    user: GetProviderRealUser<Provider>,
    ctx: HttpContextContract,
    token: string | null,
  }

  /**
   * Shape of data emitted by the authenticate event
   */
  export type SessionAuthenticateEventData<Provider extends keyof ProvidersList> = {
    name: string,
    user: GetProviderRealUser<Provider>,
    ctx: HttpContextContract,
    viaRemember: boolean,
  }

  /**
   * Shape of the session guard
   */
  export interface SessionGuardContract<
    Provider extends keyof ProvidersList,
    Name extends keyof GuardsList,
  > extends GuardContract<Provider, Name> {
    /**
     * A boolean to know if user is loggedin via remember me token or not.
     */
    viaRemember: boolean

    /**
     * Attempt to verify user credentials and perform login
     */
    attempt (uid: string, password: string, remember?: boolean): Promise<any>

    /**
     * Login a user without any verification
     */
    login (user: GetProviderRealUser<Provider>, remember?: boolean): Promise<any>

    /**
     * Login a user using their id
     */
    loginViaId (id: string | number, remember?: boolean): Promise<any>

    /**
     * Logout user
     */
    logout (renewRememberToken?: boolean): Promise<void>
  }

  /**
   * Shape of session driver config.
   */
  export type SessionGuardConfig<Provider extends keyof ProvidersList> = {
    driver: 'session',
    provider: ProvidersList[Provider]['config'],
  }

  /*
  |--------------------------------------------------------------------------
  | Auth User Land List
  |--------------------------------------------------------------------------
  */

  /**
   * List of providers mappings used by the app. Using declaration
   * merging, one must extend this interface.
   *
   * MUST BE SET IN THE USER LAND.
   *
   * Example:
   *
   * lucid: {
   *   config: LucidProviderConfig<any>,
   *   implementation: LucidProviderContract<any>,
   * }
   *
   */
  export interface ProvidersList {
  }

  /**
   * List of guards mappings used by the app. Using declaration
   * merging, one must extend this interface.
   *
   * MUST BE SET IN THE USER LAND.
   *
   * Example:
   *
   * session: {
   *   config: SessionGuardConfig<'lucid'>,
   *   implementation: SessionGuardContract<'lucid'>,
   * }
   *
   */
  export interface GuardsList {
  }

  /*
  |--------------------------------------------------------------------------
  | Auth
  |--------------------------------------------------------------------------
  */

  /**
   * Shape of config accepted by the Auth module. It relies on the
   * [[GuardsList]] interface
   */
  export type AuthConfig = {
    guard: keyof GuardsList,
    list: {
      [P in keyof GuardsList]: GuardsList[P]['config']
    },
  }

  /**
   * Instance of the auth contract. The `use` method can be used to obtain
   * an instance of a given guard mapping for a single HTTP request
   */
  export interface AuthContract extends GuardContract<keyof ProvidersList, keyof GuardsList> {
    /**
     * The default guard for the current request
     */
    defaultGuard: string

    /**
     * Use a given guard
     */
    use (guard?: string): GuardContract<keyof ProvidersList, keyof GuardsList>
    use<K extends keyof GuardsList> (guard: K): GuardsList[K]['implementation']
  }

  /*
  |--------------------------------------------------------------------------
  | Auth Manager
  |--------------------------------------------------------------------------
  */

  /**
   * Shape of the callback accepted to add new user providers
   */
  export type ExtendProviderCallback = (container: IocContract, config: any) => ProviderContract<any>

  /**
   * Shape of the callback accepted to add new guards
   */
  export type ExtendGuardCallback = (
    container: IocContract,
    mapping: string,
    config: any,
    provider: ProviderContract<any>,
    ctx: HttpContextContract,
  ) => GuardContract<keyof ProvidersList, keyof GuardsList>

  /**
   * Shape of the auth manager to register custom drivers and providers and
   * make instances of them
   */
  export interface AuthManagerContract {
    /**
     * The default guard
     */
    defaultGuard: string

    /**
     * Returns the instance of [[AuthContract]] for a given HTTP request
     */
    getAuthForRequest (ctx: HttpContextContract): AuthContract

    /**
     * Make instance of a mapping
     */
    makeMapping (
      ctx: HttpContextContract,
      mapping: string,
    ): GuardContract<keyof ProvidersList, keyof GuardsList>
    makeMapping<K extends keyof GuardsList> (
      ctx: HttpContextContract,
      mapping: K,
    ): GuardsList[K]['implementation']

    /**
     * Extend by adding custom providers and guards
     */
    extend (type: 'provider', provider: string, callback: ExtendProviderCallback): void
    extend (type: 'guard', guard: string, callback: ExtendGuardCallback): void
  }

  const AuthManager: AuthManagerContract
  export default AuthManager
}
