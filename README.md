# Reginald Lighthouse Module

## Configuration

```json5
{
  // URL for MongoDB
  "mongodbUri": "",

  // URL for local server
  // Used to receive server status change callbacks
  "localhost": "",
  
  // Discord bot token
  "token": "",
  
  // Discord bot default prefix
  "prefix": "",
  
  // Discord channels for bot to listen
  "channels": {
    "users": "",
    "admin": ""
  },
  
  // Config for discord bot
  "bot": {
    "name": "",
    "avatar": "",
    "image": "",
    "footer": {
      "text": "",
      "icon": ""
    }
  },
  
  // Config for lighthouse
  "lighthouse": {
    // URL of lighthouse host
    "host": "",
    
    // ID of lighthouse client
    "clientId": "",
    
    // Secret of lighthouse client
    "clientSecret": ""
  },
  
  // Discord roles to validate users with
  "roles": {
    "premium_tier_1": "",
    "premium_tier_2": "",
    "premium_tier_3": "",
    "league_partner": ""
  },
  
  // Game to use for creating server
  "game": "",
  
  // Config for game variants
  "variants": {
    "<name>": {
      // Printable name for the variant
      "name": "TF2 Competitive",

      // Consider this variant as default for book commands
      "default": "boolean",
      
      // Git repo to use, SSH only
      "gitRepo": "string",
      
      // Git deploy key to access the git repo, key encoded in Base64
      "gitKey": "string"
    }
  },
  
  // Config for regions
  "regions": {
    "<name>": {
      // Printable name for the region
      "name": "Sydney",
      
      // Aliases for the region
      "alias": [ "syd" ],
      
      // If true then region will not show up in user status
      "hidden": "boolean",

      // If mentioned then this region will be allowed to users having this discord role
      "restricted": "",
      
      // Consider this region as default for book commands
      "default": "boolean",
      
      // Tiers that is enforced on the region
      "tiers": {
        "<name>": {
          // Number of bookings allowed in this region
          "limit": 0,
          
          // Lighthouse provider to use for this region
          // Multiple types are supported
          // string
          // "provider": "prov-a"
          //
          // string[]
          // "provider": ["prov-a", "prov-b"]
          //
          // object (medium will be default)
          // "provider": {
          //   "small": "prov-a-small",
          //   "medium": ["prov-a", "prov-b"],
          //   "large": "prob-b-large
          // }
          "provider": "",
          
          // Minimum number of players needed in the server to not consider as idle
          "minPlayers": 0,
          
          // Idle time before the server automatically closes
          "idleTime": 0,
          
          // Can this tier be used for reservation
          "allowReservation": "boolean",
          
          // Seconds to use for starting the server early for reservation
          // If not mentioned then reservation will start when scheduled
          "earlyStart": 0
        }
      }
    }
  }
}
```