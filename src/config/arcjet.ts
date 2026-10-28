import arcjet, { shield, detectBot, slidingWindow } from "@arcjet/node";

// Only initialize Arcjet if ARCJET_KEY is provided
const aj = process.env.ARCJET_KEY
  ? arcjet({
      key: process.env.ARCJET_KEY,
      rules: [
        shield({ mode: "LIVE" }),
        detectBot({
          mode: "LIVE",
          allow: [
            "CATEGORY:SEARCH_ENGINE",
            "CATEGORY:PREVIEW",
          ],
        }),
        detectBot({
          mode: "LIVE",
          allow: [
            "CATEGORY:SEARCH_ENGINE",
            "CATEGORY:PREVIEW",
          ],
        }),
      ],
    })
  : null;

export default aj;