# IPC ????

> ?????: 2026-07-04
> ??: apps/desktop/electron/ipc-handlers/

## account

| Channel | ?? | ???? | ???? |
|---------|------|----------|----------|
| `accounts:list` | IPC invoke | (event, ...args) | { code, data, message } |
| `auth:open-login` | IPC invoke | (event, ...args) | { code, data, message } |
| `auth:login-silent` | IPC invoke | (event, ...args) | { code, data, message } |
| `auth:close` | IPC invoke | (event, ...args) | { code, data, message } |
| `auth:save-credentials` | IPC invoke | (event, ...args) | { code, data, message } |
| `account:add` | IPC invoke | (event, ...args) | { code, data, message } |
| `account:delete` | IPC invoke | (event, ...args) | { code, data, message } |
| `account:check-login` | IPC invoke | (event, ...args) | { code, data, message } |
| `account:list` | IPC invoke | (event, ...args) | { code, data, message } |

## ai

| Channel | ?? | ???? | ???? |
|---------|------|----------|----------|
| `ai:generate-titles` | IPC invoke | (event, ...args) | { code, data, message } |
| `ai:generate-summary` | IPC invoke | (event, ...args) | { code, data, message } |
| `ai:enhance-content` | IPC invoke | (event, ...args) | { code, data, message } |
| `ai:is-configured` | IPC invoke | (event, ...args) | { code, data, message } |

## analytics

| Channel | ?? | ???? | ???? |
|---------|------|----------|----------|
| `analytics:overview` | IPC invoke | (event, ...args) | { code, data, message } |
| `analytics:platform` | IPC invoke | (event, ...args) | { code, data, message } |
| `analytics:platforms` | IPC invoke | (event, ...args) | { code, data, message } |

## keyword

| Channel | ?? | ???? | ???? |
|---------|------|----------|----------|
| `keyword:start` | IPC invoke | (event, ...args) | { code, data, message } |
| `keyword:stop` | IPC invoke | (event, ...args) | { code, data, message } |
| `keyword:status` | IPC invoke | (event, ...args) | { code, data, message } |
| `keyword:history` | IPC invoke | (event, ...args) | { code, data, message } |
| `keyword:stop-all` | IPC invoke | (event, ...args) | { code, data, message } |

## license

| Channel | ?? | ???? | ???? |
|---------|------|----------|----------|
| `license:info` | IPC invoke | (event, ...args) | { code, data, message } |
| `license:activate` | IPC invoke | (event, ...args) | { code, data, message } |
| `license:deactivate` | IPC invoke | (event, ...args) | { code, data, message } |
| `license:activate-trial` | IPC invoke | (event, ...args) | { code, data, message } |
| `license:has-feature` | IPC invoke | (event, ...args) | { code, data, message } |
| `license:features` | IPC invoke | (event, ...args) | { code, data, message } |

## misc

| Channel | ?? | ???? | ???? |
|---------|------|----------|----------|
| `app:get-version` | IPC invoke | (event, ...args) | { code, data, message } |
| `app:get-platform` | IPC invoke | (event, ...args) | { code, data, message } |
| `hotkeys:list` | IPC invoke | (event, ...args) | { code, data, message } |
| `first-run:check` | IPC invoke | (event, ...args) | { code, data, message } |
| `show-notification` | IPC invoke | (event, ...args) | { code, data, message } |

## offline

| Channel | ?? | ???? | ???? |
|---------|------|----------|----------|
| `offline:status` | IPC invoke | (event, ...args) | { code, data, message } |
| `offline:is-offline` | IPC invoke | (event, ...args) | { code, data, message } |
| `offline:cached-tasks` | IPC invoke | (event, ...args) | { code, data, message } |
| `offline:add-to-cache` | IPC invoke | (event, ...args) | { code, data, message } |
| `offline:clear-cache` | IPC invoke | (event, ...args) | { code, data, message } |

## payment

| Channel | ?? | ???? | ???? |
|---------|------|----------|----------|
| `payment:create-order` | IPC invoke | (event, ...args) | { code, data, message } |
| `payment:list-orders` | IPC invoke | (event, ...args) | { code, data, message } |
| `payment:get-order` | IPC invoke | (event, ...args) | { code, data, message } |
| `payment:complete` | IPC invoke | (event, ...args) | { code, data, message } |
| `payment:simulate` | IPC invoke | (event, ...args) | { code, data, message } |
| `payment:cancel` | IPC invoke | (event, ...args) | { code, data, message } |

## platform

| Channel | ?? | ???? | ???? |
|---------|------|----------|----------|
| `platform:list` | IPC invoke | (event, ...args) | { code, data, message } |
| `platform:get` | IPC invoke | (event, ...args) | { code, data, message } |
| `platform:definitions` | IPC invoke | (event, ...args) | { code, data, message } |

## proxy

| Channel | ?? | ???? | ???? |
|---------|------|----------|----------|
| `proxy:add` | IPC invoke | (event, ...args) | { code, data, message } |
| `proxy:add-batch` | IPC invoke | (event, ...args) | { code, data, message } |
| `proxy:list` | IPC invoke | (event, ...args) | { code, data, message } |
| `proxy:remove` | IPC invoke | (event, ...args) | { code, data, message } |
| `proxy:test` | IPC invoke | (event, ...args) | { code, data, message } |
| `proxy:test-all` | IPC invoke | (event, ...args) | { code, data, message } |
| `proxy:status` | IPC invoke | (event, ...args) | { code, data, message } |
| `proxy:get-next` | IPC invoke | (event, ...args) | { code, data, message } |
| `proxy:reset` | IPC invoke | (event, ...args) | { code, data, message } |
| `proxy:remove-dead` | IPC invoke | (event, ...args) | { code, data, message } |

## publish

| Channel | ?? | ???? | ???? |
|---------|------|----------|----------|
| `publish:wechat` | IPC invoke | (event, ...args) | { code, data, message } |
| `publish:batch` | IPC invoke | (event, ...args) | { code, data, message } |
| `queue:status` | IPC invoke | (event, ...args) | { code, data, message } |
| `queue:history` | IPC invoke | (event, ...args) | { code, data, message } |
| `queue:cancel` | IPC invoke | (event, ...args) | { code, data, message } |
| `history:list` | IPC invoke | (event, ...args) | { code, data, message } |
| `history:get` | IPC invoke | (event, ...args) | { code, data, message } |
| `dashboard:stats` | IPC invoke | (event, ...args) | { code, data, message } |

## render

| Channel | ?? | ???? | ???? |
|---------|------|----------|----------|
| `render:start` | IPC invoke | (event, ...args) | { code, data, message } |
| `render:cancel` | IPC invoke | (event, ...args) | { code, data, message } |
| `render:status` | IPC invoke | (event, ...args) | { code, data, message } |
| `render:install-deps` | IPC invoke | (event, ...args) | { code, data, message } |

## scheduler

| Channel | ?? | ???? | ???? |
|---------|------|----------|----------|
| `scheduler:create` | IPC invoke | (event, ...args) | { code, data, message } |
| `scheduler:list` | IPC invoke | (event, ...args) | { code, data, message } |
| `scheduler:cancel` | IPC invoke | (event, ...args) | { code, data, message } |

## sensitive

| Channel | ?? | ???? | ???? |
|---------|------|----------|----------|
| `sensitive:check` | IPC invoke | (event, ...args) | { code, data, message } |
| `sensitive:replace` | IPC invoke | (event, ...args) | { code, data, message } |

## store

| Channel | ?? | ???? | ???? |
|---------|------|----------|----------|
| `store:add-account` | IPC invoke | (event, ...args) | { code, data, message } |
| `store:get-account` | IPC invoke | (event, ...args) | { code, data, message } |
| `store:list-accounts` | IPC invoke | (event, ...args) | { code, data, message } |
| `store:delete-account` | IPC invoke | (event, ...args) | { code, data, message } |
| `store:set-default-account` | IPC invoke | (event, ...args) | { code, data, message } |
| `store:get-default-account` | IPC invoke | (event, ...args) | { code, data, message } |
| `store:update-account` | IPC invoke | (event, ...args) | { code, data, message } |
| `store:add-publish-record` | IPC invoke | (event, ...args) | { code, data, message } |
| `store:list-publish-history` | IPC invoke | (event, ...args) | { code, data, message } |
| `store:get-publish-stats` | IPC invoke | (event, ...args) | { code, data, message } |
| `store:add-scheduled-task` | IPC invoke | (event, ...args) | { code, data, message } |
| `store:list-scheduled-tasks` | IPC invoke | (event, ...args) | { code, data, message } |
| `store:delete-task` | IPC invoke | (event, ...args) | { code, data, message } |
| `store:get-setting` | IPC invoke | (event, ...args) | { code, data, message } |
| `store:set-setting` | IPC invoke | (event, ...args) | { code, data, message } |
| `store:list-callback-logs` | IPC invoke | (event, ...args) | { code, data, message } |

## sync

| Channel | ?? | ???? | ???? |
|---------|------|----------|----------|
| `sync:all` | IPC invoke | (event, ...args) | { code, data, message } |
| `sync:platform` | IPC invoke | (event, ...args) | { code, data, message } |
| `sync:cached` | IPC invoke | (event, ...args) | { code, data, message } |

## templates

| Channel | ?? | ???? | ???? |
|---------|------|----------|----------|
| `template:list` | IPC invoke | (event, ...args) | { code, data, message } |
| `template:get` | IPC invoke | (event, ...args) | { code, data, message } |
| `template:add` | IPC invoke | (event, ...args) | { code, data, message } |
| `template:update` | IPC invoke | (event, ...args) | { code, data, message } |
| `template:delete` | IPC invoke | (event, ...args) | { code, data, message } |
| `template:list-by-category` | IPC invoke | (event, ...args) | { code, data, message } |
| `template:get-presets` | IPC invoke | (event, ...args) | { code, data, message } |

## update

| Channel | ?? | ???? | ???? |
|---------|------|----------|----------|
| `update:check` | IPC invoke | (event, ...args) | { code, data, message } |
| `update:download` | IPC invoke | (event, ...args) | { code, data, message } |
| `update:install` | IPC invoke | (event, ...args) | { code, data, message } |

## upload

| Channel | ?? | ???? | ???? |
|---------|------|----------|----------|
| `upload:chunked` | IPC invoke | (event, ...args) | { code, data, message } |
| `upload:cancel` | IPC invoke | (event, ...args) | { code, data, message } |
