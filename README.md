# Archive Notice 🔒
After three years, I've decided to archive this open-source WhatsApp API project. Your support and contributions have been incredible!

While I'm no longer actively maintaining this project, I've been working on something new and exciting. It's not open-source, but it's a powerful API that provides advanced features for those who need them. If you're interested in exploring this, feel free to reach out for more information.

Thank you once again for being a part of this journey. Keep building amazing things with technology!

Best regards,

@salman0ansari 
- mailto:salman0ansariii@gmail.com
- https://telegram.dog/salman0ansari





<h1 align="center"> whatsapp-api-nodejs Multi Device</h1>
<div align="center">
<p>
<a href="#"><img title="skynet" src="https://img.shields.io/badge/whatsapp api nodejs Multi Device-black?style=for-the-badge" alt=""></a>
</p>
<p>
<a href="https://github.com/salman0ansari"><img title="Author" src="https://img.shields.io/badge/Author-Mohd Salman Ansari-black.svg?style=for-the-badge&logo=github" alt=""></a>
</p>
<a href="https://github.com/salman0ansari?tab=followers"><img title="Followers" src="https://img.shields.io/github/followers/salman0ansari?color=black&style=flat-square" alt=""></a>
<a href="https://github.com/salman0ansari/whatsapp-api-nodejs/stargazers"><img title="Stars" src="https://img.shields.io/github/stars/salman0ansari/whatsapp-api-nodejs?color=black&style=flat-square" alt=""></a>
<a href="https://github.com/salman0ansari/whatsapp-api-nodejs/network/members"><img title="Forks" src="https://img.shields.io/github/forks/salman0ansari/whatsapp-api-nodejs?color=black&style=flat-square" alt=""></a>
<a href="https://github.com/salman0ansari/whatsapp-api-nodejs/issues"><img title="Issues" src="https://img.shields.io/github/issues/salman0ansari/whatsapp-api-nodejs?color=black&style=flat-square" alt=""></a>
<p>

<a href="http://github.com/salman0ansari/whatsapp-api-nodejs"><img title="Hits" src="http://hits.dwyl.com/salman0ansari/whatsapp-api-nodejs.svg?style=flat-square"></a>
<br>
<a href="https://t.me/salman0ansari">
<img src="https://img.shields.io/badge/Telegram-informational?style=for-the-badge&logo=telegram&logoColor=white" alt="Telegram Badge"/>
</a>
<a href="https://join.skype.com/invite/rI5pLf9YIvTA">
<img src="https://img.shields.io/badge/Skype-00AFF0.svg?style=for-the-badge&logo=Skype&logoColor=white" alt="Skype Badge"/>
</a>
<br>

</p>
</div>

---

An implementation of [Baileys](https://github.com/WhiskeySockets/Baileys) as a simple RESTful API service with multi device support just `download`, `install`, and `start` using, `simple` as that.

# Libraries Used

-   [Baileys](https://github.com/WhiskeySockets/Baileys)
-   [Express](https://github.com/expressjs/express)

# Installation

1. Download or clone this repo.
2. Enter to the project directory.
3. Execute `yarn install` to install the dependencies.
4. Copy `.env.example` to `.env` and set the environment variables.

# Docker Compose

1. Follow the [Installation](#installation) procedure.
2. Update `.env` and set

```
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/whatsapp_api?schema=public
```

3. Set your `TOKEN=` to a random string.
4. Execute

```
docker-compose up -d
```

# Configuration

Edit environment variables on `.env`

```a
Important: You must set TOKEN= to a random string to protect the route.
```

```env
# ==================================
# SECURITY CONFIGURATION
# ==================================
TOKEN=RANDOM_STRING_HERE
```

# Usage

1. `DEVELOPMENT:` Execute `yarn dev`
2. `PRODUCTION:` Execute `yarn start`

## Generate basic instance using random key.

To generate an Instance Key  
Using the route:

```bash
curl --location --request GET 'localhost:3333/instance/init' \
--data-raw ''
```

Response:

```json
{
    "error": false,
    "message": "Initializing successfull",
    "key": "d7e2abff-3ac8-44a9-a738-1b28e0fca8a5"
}
```

## WEBHOOK_ALLOWED_EVENTS

You can set which events you want to send to webhook by setting the environment variable `WEBHOOK_ALLOWED_EVENTS`

Set a comma seperated list of events you want to get notified about.

Default value is `all` which will forward all events.

Recommended `.env` setting:

```env
WEBHOOK_ALLOWED_EVENTS=all
```

Do not leave `WEBHOOK_ALLOWED_EVENTS` empty, otherwise webhook events may be filtered out.

Allowed values (exact):

-   `all` - receive all supported webhook events
-   `connection` - receive connection events (`open` and `close`)
-   `connection.update` - receive connection update events
-   `connection:open` - receive connection open events
-   `connection:close` - receive connection close events
-   `presence` - receive presence events
-   `presence.update` - receive presence update events
-   `messages` - receive incoming message events
-   `messages.upsert` - receive message upsert events
-   `call` - receive all call-related events
-   `CB:call` - receive raw Baileys call event bucket used by call offers
-   `call:offer` - receive incoming call offer events
-   `call:terminate` - receive call terminate events
-   `groups` - receive all group-related events
-   `groups.upsert` - receive group creation events
-   `groups.update` - receive group update events
-   `group_participants` - receive group participant change events
-   `group-participants.update` - receive group participant update events

## Generate custom instance with custom key and custom webhook.

To generate a Custom Instance  
Using the route:

```bash
curl --location --request GET 'localhost:3333/instance/init?key=CUSTOM_INSTANCE_KEY_HERE&webhook=true&webhookUrl=https://webhook.site/d7114704-97f6-4562-9a47-dcf66b07266d' \
--data-raw ''
```

Response:

```json
{
    "error": false,
    "message": "Initializing successfull",
    "key": "CUSTOM_INSTANCE_KEY_HERE"
}
```

# Using Key

Save the value of the `key` from response. Then use this value to call all the routes.

## Postman Docs

All routes are available as a postman collection.

-   https://documenter.getpostman.com/view/12514774/UVsPQkBq

## QR Code

Visit [http://localhost:3333/instance/qr?key=INSTANCE_KEY_HERE](http://localhost:3333/instance/qr?key=INSTANCE_KEY_HERE) to view the QR Code and scan with your device. If you take too long to scan the QR Code, you will have to refresh the page.

## Send Message

```sh
# /message/text?key=INSTANCE_KEY_HERE&id=PHONE-NUMBER-WITH-COUNTRY-CODE&message=MESSAGE

curl --location --request POST 'localhost:3333/message/text?key=INSTANCE_KEY_HERE' \
--header 'Content-Type: application/x-www-form-urlencoded' \
--data-urlencode 'id=919999999999' \
--data-urlencode 'message=Hello World'
```

## Routes

| Route                | Source File                                                                                                          |
| -------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Instance Routes      | [instance.route.js](https://github.com/salman0ansari/whatsapp-api-nodejs/blob/main/src/api/routes/instance.route.js) |
| Message Routes       | [message.route.js](https://github.com/salman0ansari/whatsapp-api-nodejs/blob/main/src/api/routes/message.route.js)   |
| Group Routes         | [group.route.js](https://github.com/salman0ansari/whatsapp-api-nodejs/blob/main/src/api/routes/group.route.js)       |
| Miscellaneous Routes | [misc.route.js](https://github.com/salman0ansari/whatsapp-api-nodejs/blob/main/src/api/routes/misc.route.js)         |

See all routes here [src/api/routes](https://github.com/salman0ansari/whatsapp-api-nodejs/tree/main/src/api/routes)

## REST v1 Endpoints

In addition to the legacy RPC-style routes, this project now exposes a REST-oriented `v1` surface:

- `POST /v1/instances`
- `GET /v1/instances`
- `GET /v1/instances/:key`
- `DELETE /v1/instances/:key`
- `DELETE /v1/instances/:key/session`
- `GET /v1/instances/:key/qr`
- `POST /v1/instances/:key/messages` (body: `{ "to": "5511999999999", "message": "Hello" }`)
- `GET /v1/instances/:key/contacts`
- `POST /v1/instances/:key/groups/:groupId/messages` (body: `{ "message": "Hello group" }`)
- `GET /v1/instances/:key/groups`
- `GET /v1/instances/:key/groups/live`
- `DELETE /v1/instances/:key/groups/:groupId`

## API Documentation (OpenAPI)

- OpenAPI spec file: `GET /openapi.yaml`
- Swagger UI: `GET /docs`

# Note

I can't guarantee or can be held responsible if you get blocked or banned by using this software. WhatsApp does not allow bots using unofficial methods on their platform, so this shouldn't be considered totally safe.

# Legal

-   This code is in no way affiliated, authorized, maintained, sponsored or endorsed by WA (WhatsApp) or any of its affiliates or subsidiaries.
-   The official WhatsApp website can be found at https://whatsapp.com. "WhatsApp" as well as related names, marks, emblems and images are registered trademarks of their respective owners.
-   This is an independent and unofficial software Use at your own risk.
-   Do not spam people with this.
