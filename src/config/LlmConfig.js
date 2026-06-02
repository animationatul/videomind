import dotenv from "dotenv";

dotenv.config();

export const LlmConfig = {

    provider: "openai",

    apiKey:
        process.env.OPENAI_API_KEY,

    model:
        process.env.OPENAI_MODEL,

    baseUrl:
        process.env.OPENAI_BASE_URL

};
