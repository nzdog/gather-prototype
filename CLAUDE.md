# Gather Prototype — Claude Notes

## Known Issues & Fixes

### Dev server returning HTTP 500 (module format conflict)

**Symptom:** `npm run dev` starts (Turbopack reports "Ready"), but all pages return HTTP 500 with errors like:
```
Specified module format (CommonJs) is not matching the module format of the source code (EcmaScript Modules)
```

**Cause:** `"type": "commonjs"` was set in `package.json`. Turbopack enforces this strictly, rejecting ESM `import`/`export` syntax in source files.

**Fix:** Remove `"type": "commonjs"` from `package.json`. Next.js handles module transpilation internally — this field should not be set.
