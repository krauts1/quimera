# Security policy

## Supported line

Security fixes are applied to the current public alpha. Historical snapshots
are not supported.

## Report a vulnerability

Use a private GitHub security advisory for this repository once it is
published. Do not disclose a suspected vulnerability in a public issue, sample
deployment, paste, or screenshot.

Include the affected revision, entry point, minimal reproduction, realistic
impact, and whether the issue involves a manifest, URL resolver, asset payload,
shader, animation, browser lifecycle, or build boundary. Do not include API
keys, user data, private project material, or third-party source assets.

## Security boundaries

- `SKY_MAVIS_API_KEY` is server-only. Browser code must never receive it.
- Manifests, GLBs, textures, animation files, and shader files are data inputs,
  not trusted code. Serve a reviewed, integrity-checked pack from a controlled
  origin.
- Custom asset base URLs, resolvers, and fetchers cross trust boundaries. The
  consuming app is responsible for origin restrictions, authentication,
  response limits, and timeouts.
- Large media and shader workloads can exhaust browser or GPU memory. Use
  suitable quality settings and dispose runtime objects explicitly.
- A successful build or test run does not establish content ownership or
  permission for use outside [RIGHTS.md](./RIGHTS.md).
