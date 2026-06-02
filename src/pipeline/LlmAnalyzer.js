import dotenv from "dotenv";
import OpenAI from "openai";
import fs from "fs";
dotenv.config();
console.log("MODEL:", process.env.TEXT_MODEL);
export class LlmAnalyzer {

    constructor() {

      this.provider =
          process.env.LLM_PROVIDER;

      this.model =
          process.env.TEXT_MODEL;

      if (
          this.provider === "openai"
      ) {

          this.client =
              new OpenAI({
                  apiKey:
                      process.env.OPENAI_API_KEY,

                  baseURL:
                      process.env.OPENAI_BASE_URL
              });
      }

    }



    async analyze({
        collagePath,
        audioPath,
        sceneData
    }) {

        const collageBase64 =
            fs.readFileSync(
                collagePath,
                "base64"
            );

        // const audioBase64 =
        //     fs.readFileSync(
        //         audioPath,
        //         "base64"
        //     );

        const response =
            await this.client.chat.completions.create({
                model:
                    this.model,

                messages: [
                    {
                        role: "system",
                        content:
                            `
You are VideoMind.

Analyze:
1. Scene changes
2. Actions
3. People
4. Objects
5. Emotions
6. Speech

Return JSON only.
`
                    },
                    {
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text:
                                    JSON.stringify(
                                        sceneData,
                                        null,
                                        2
                                    )
                            },
                            {
                                type: "image_url",
                                image_url: {
                                    url:
                                        `data:image/jpeg;base64,${collageBase64}`
                                }
                            }
                        ]
                    }
                ]
            });

        return response
            .choices[0]
            .message
            .content;
    }
}
