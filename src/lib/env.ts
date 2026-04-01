import 'server-only'

const MIN_ADMIN_SECRET_LENGTH = 32

let hasWarnedAboutDevSecret = false

export function getAdminSecret() {
  const secret = process.env.ADMIN_SECRET?.trim()

  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('ADMIN_SECRET is required in production')
    }

    if (!hasWarnedAboutDevSecret) {
      hasWarnedAboutDevSecret = true
      console.warn('ADMIN_SECRET is not set. Falling back to a development-only secret.')
    }

    return 'dev-only-admin-secret'
  }

  if (process.env.NODE_ENV === 'production' && secret.length < MIN_ADMIN_SECRET_LENGTH) {
    throw new Error(`ADMIN_SECRET must be at least ${MIN_ADMIN_SECRET_LENGTH} characters in production`)
  }

  return secret
}

export function getSecurityRequirements() {
  return {
    minAdminSecretLength: MIN_ADMIN_SECRET_LENGTH,
  }
}

export function shouldUseSecureCookies() {
  const configuredValue = process.env.SESSION_COOKIE_SECURE?.trim().toLowerCase()

  if (configuredValue === 'true') {
    return true
  }

  if (configuredValue === 'false') {
    return false
  }

  const appUrl = process.env.APP_URL?.trim().toLowerCase()
  return Boolean(appUrl?.startsWith('https://'))
}
