import { RunOptions } from './types'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs-extra'
import * as cuid from 'cuid'
const debug = require('debug')('config')
import * as findUp from 'find-up'
import { Output } from './Output/index'

export class Config {
  /**
   * Local settings
   */
  out: Output
  debug: boolean = Boolean(
    process.env.DEBUG && process.env.DEBUG!.includes('*'),
  )
  windows: boolean = false
  bin: string = 'graphcool'
  mock: boolean = true
  argv: string[] = process.argv.slice(1)
  commandsDir: string = path.join(__dirname, '../dist/commands')
  defaultCommand: string = 'help'
  userPlugins: boolean = false
  version: string = '1.3.11'
  name: string = 'graphcool'
  pjson: any = {
    name: 'cli-engine',
    version: '0.0.0',
    dependencies: {},
    'cli-engine': {
      defaultCommand: 'help',
    },
  }

  /**
   * Paths
   */
  cwd: string
  home: string
  root = path.join(__dirname, '..')

  envPath: string | null
  definitionDir: string
  definitionPath: string | null
  dotGraphcoolFilePath: string | null

  /**
   * Urls
   */
  token: string | null
  authUIEndpoint = process.env.ENV === 'DEV'
    ? 'https://dev.console.graph.cool/cli/auth'
    : 'https://console.graph.cool/cli/auth'
  backendAddr = process.env.ENV === 'DEV'
    ? 'https://dev.api.graph.cool'
    : 'https://api.graph.cool'
  systemAPIEndpoint = process.env.ENV === 'DEV'
    ? 'https://dev.api.graph.cool/system'
    : 'https://api.graph.cool/system'
  authEndpoint = process.env.ENV === 'DEV'
    ? 'https://cli-auth-api.graph.cool/dev'
    : 'https://cli-auth-api.graph.cool/prod'
  docsEndpoint = process.env.ENV === 'DEV'
    ? 'https://dev.graph.cool/docs'
    : 'https://www.graph.cool/docs'
  statusEndpoint = 'https://crm.graph.cool/prod/status'

  /* tslint:disable-next-line */
  __cache = {}

  constructor(options?: RunOptions) {
    this.cwd = this.getCwd()
    this.home = this.getHome()
    this.setEnvPath()
    this.setDefinitionPaths()
    this.setDotGraphcoolPath()
    debug(`dotGraphcoolPath after setting it`, this.dotGraphcoolFilePath)
    this.setTokenIfExists()
    if (options) {
      this.readPackageJson(options)
    }
  }
  setOutput(out: Output) {
    this.out = out
  }
  setToken(token: string | null) {
    this.token = token
  }
  saveToken() {
    const json = JSON.stringify({ token: this.token }, null, 2)
    fs.writeFileSync(this.dotGraphcoolFilePath, json)
  }
  get arch(): string {
    return os.arch() === 'ia32' ? 'x86' : os.arch()
  }
  get platform(): string {
    return os.platform() === 'win32' ? 'windows' : os.platform()
  }
  get userAgent(): string {
    return `${this.name}/${this.version} (${this.platform}-${this
      .arch}) node-${process.version}`
  }
  get dirname() {
    return this.pjson['cli-engine'].dirname || this.bin
  }
  get cacheDir() {
    return dir(
      this,
      'cache',
      this.platform === 'darwin'
        ? path.join(this.home, 'Library', 'Caches')
        : null,
    )
  }
  private readPackageJson(options: RunOptions) {
    this.mock = options.mock
    this.argv = options.argv || this.argv
    if (options.root) {
      this.root = options.root
      const pjsonPath = path.join(options.root, 'package.json')
      const pjson = fs.readJSONSync(pjsonPath)
      if (pjson && pjson['cli-engine']) {
        this.pjson = pjson
        this.version = pjson.version
      }
    }
  }
  private setEnvPath() {
    this.envPath = path.join(this.cwd, '.graphcoolrc')
    if (!fs.pathExistsSync(this.envPath)) {
      const found = findUp.sync('.graphcoolrc', {cwd: this.cwd})
      this.envPath = found ? path.dirname(found) : this.envPath
    }
  }
  private setDefinitionPaths() {
    const definitionPath = path.join(this.cwd, 'graphcool.yml')
    if (fs.pathExistsSync(definitionPath)) {
      this.definitionDir = this.cwd
      this.definitionPath = definitionPath
    } else {
      const found = findUp.sync('graphcool.yml', {cwd: this.cwd})
      this.definitionDir = found ? path.dirname(found) : this.cwd
      this.definitionPath = found || null
    }
  }
  private setDotGraphcoolPath() {
    const dotGraphcoolCwd = path.join(this.cwd, '.graphcool')
    if (fs.pathExistsSync(dotGraphcoolCwd)) {
      this.dotGraphcoolFilePath = dotGraphcoolCwd
    } else {
      const found = findUp.sync('.graphcool', {cwd: this.cwd})
      const dotGraphcoolHome = path.join(this.home, '.graphcool')

      // only take the find-up file, if it's "deeper" than the home dir
      this.dotGraphcoolFilePath = (found && (found.split('/').length > dotGraphcoolHome.split('/'))) ? found : dotGraphcoolHome
    }
  }
  private setTokenIfExists() {
    if (process.env.NODE_ENV === 'test') {
      debug('taking graphcool test token')
      this.token = process.env.GRAPHCOOL_TEST_TOKEN!
    } else {
      if (fs.existsSync(this.dotGraphcoolFilePath)) {
        const configContent = fs.readFileSync(
          this.dotGraphcoolFilePath,
          'utf-8',
        )
        this.token = JSON.parse(configContent).token
      }
    }
  }
  private getCwd() {
    // get cwd
    let cwd = process.cwd()
    if (process.env.NODE_ENV === 'test') {
      cwd = path.join(os.tmpdir(), `${cuid()}/`)
      fs.mkdirpSync(cwd)
      debug('cwd', cwd)
    }
    return cwd
  }
  private getHome() {
    // get home
    let home = os.homedir() || os.tmpdir()
    if (process.env.NODE_ENV === 'test') {
      home = path.join(os.tmpdir(), `${cuid()}/`)
      fs.mkdirpSync(home)
      debug('home', home)
    }
    return home
  }
}

function dir(config: Config, category: string, d: string | null): string {
  const cacheKey = `dir:${category}`
  const cache = config.__cache[cacheKey]
  if (cache) {
    return cache
  }
  d =
    d ||
    path.join(
      config.home,
      category === 'data' ? '.local/share' : '.' + category,
    )
  if (config.windows) {
    d = process.env.LOCALAPPDATA || d
  }
  d = process.env.XDG_DATA_HOME || d
  d = path.join(d, config.dirname)
  fs.mkdirpSync(d)
  config.__cache[cacheKey] = d
  return d
}
