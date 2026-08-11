/**
 * Node loader hook that resolves frontend imports the way Vite does.
 *
 * Three gaps between Vite and plain Node that break verify scripts importing
 * real app modules:
 *   1. extensionless relative imports — `import './procurementWorkflow'`
 *   2. JSON imports without an explicit `with { type: 'json' }` attribute
 *   3. `import.meta.env`, which only Vite defines
 *
 * Register it before the first dynamic import:
 *   globalThis.__VITE_ENV__ = {}   // or a fixture env
 *   register(pathToFileURL(path.join(__dirname, 'lib/extensionlessResolver.mjs')))
 *
 * An empty `__VITE_ENV__` puts the app in local (non-cloud) mode, which is what
 * pure-logic verification wants: no Supabase client, no network.
 */

const EXTENSIONS = ['.js', '.mjs', '/index.js']

function withJsonAttribute(result) {
  if (!result?.url?.endsWith('.json')) return result
  return {
    ...result,
    format: 'json',
    importAttributes: { ...(result.importAttributes || {}), type: 'json' },
  }
}

/** Vite-only `import.meta.env` → a global the verify script controls. */
export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context)
  if (result.format !== 'module' || result.source == null) return result

  const source = result.source.toString()
  if (!source.includes('import.meta.env')) return result

  return {
    ...result,
    source: source.replaceAll('import.meta.env', '(globalThis.__VITE_ENV__ ?? {})'),
  }
}

export async function resolve(specifier, context, nextResolve) {
  const parentContext = specifier.endsWith('.json')
    ? { ...context, importAttributes: { ...(context.importAttributes || {}), type: 'json' } }
    : context

  try {
    return withJsonAttribute(await nextResolve(specifier, parentContext))
  } catch (error) {
    const relative = specifier.startsWith('./') || specifier.startsWith('../')
    const hasExtension = /\.[cm]?[jt]sx?$/.test(specifier)
    if (!relative || hasExtension) throw error

    for (const extension of EXTENSIONS) {
      try {
        return withJsonAttribute(await nextResolve(`${specifier}${extension}`, parentContext))
      } catch {
        // try the next candidate
      }
    }

    throw error
  }
}
