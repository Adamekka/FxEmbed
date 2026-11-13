# Automatic deployment

Pushes to this fork's `main` branch run the Tests workflow. A successful test run
triggers deployment of that exact commit to the `kirkyx` Cloudflare Worker.
Pull request test runs cannot trigger deployment. Deployments run one at a time;
an older tested commit is skipped if a newer commit is already on `main`.

The instance configuration stays outside Git and is restored from repository
Actions settings before the build:

| Setting                | Storage  | Contents                                                        |
| ---------------------- | -------- | --------------------------------------------------------------- |
| `FXEMBED_WRANGLER`     | Variable | Local `wrangler.toml`, including account and routes             |
| `FXEMBED_BRANDING`     | Variable | Local `branding.json`                                           |
| `FXEMBED_ENV`          | Secret   | Local `.env`, including domain lists and service settings       |
| `CLOUDFLARE_API_TOKEN` | Secret   | Cloudflare token authorized to deploy the Worker and its routes |

All four settings are required. The Cloudflare token should be restricted to
the deployment account and the `kirkyx.com` zone. It needs permission to edit
Workers scripts and routes and read the account and zone settings. Deployment
uses the existing proxied DNS record for the apex and Custom Domains for the
API and embed modifier subdomains.

To update the configuration from local files:

```sh
gh variable set FXEMBED_WRANGLER --repo Adamekka/FxEmbed < wrangler.toml
gh variable set FXEMBED_BRANDING --repo Adamekka/FxEmbed < branding.json
gh secret set FXEMBED_ENV --repo Adamekka/FxEmbed < .env
```

Daily upstream rebases also push to `main` after their checks pass, so they
trigger the same test and deployment sequence.

## Homepage

The homepage will be hosted by a separate Cloudflare Pages project. Until that
project is connected, the embed Worker returns a plain 404 at `/`. Branding
links point to `https://kirkyx.com`.

Connecting Pages requires both its custom-domain DNS configuration and a change
to the current `kirkyx.com/*` Worker route. The homepage, website pages, and
static assets must reach Pages while social embed paths continue to reach the
Worker. Changing DNS alone will not bypass the current catch-all Worker route.

## Branding image

The supplied branding image is served as a Worker static asset at
`https://api.kirkyx.com/kirkyx.png`. The favicon and activity icon use this URL,
so they remain available when the homepage moves to Pages. Files from
`assets/branding` are [served before the embed router](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/).
An asset rewrite serves `/favicon.ico` from the same PNG without passing through
the embed cache or making a Worker-to-Worker HTTP request.
