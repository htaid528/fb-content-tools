
'use server';

import 'dotenv/config';
import {
  GenericTextFlowInputSchema,
  PolicyCheckInputSchema,
  PolicyCheckOutput,
  PolicyCheckOutputSchema,
  TranslatorInputSchema,
  SpellingCheckerOutputSchema,
  SpellingCheckerInputSchema,
  DictionaryToolInputSchema,
} from '@/ai/schemas';
import {z} from 'zod';

const MODEL_NAME = 'gemini-2.5-flash';

// This is the new core function that directly calls the Google AI API using fetch.
async function callGoogleAI(prompt: string, apiKey: string, expectJson = false): Promise<any> {
    if (!apiKey) {
        throw new Error("သင်၏ Gemini API Key ကို Settings တွင် ထည့်သွင်းပါ။");
    }
    
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${apiKey}`;

    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: expectJson ? {
            responseMimeType: "application/json",
            temperature: 0.2,
        } : {
            temperature: 0.7,
        }
    };

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorBody = await response.json();
            console.error("Google AI API Error:", errorBody);
            // Provide a more user-friendly error
            const errorMessage = errorBody?.error?.message.includes('API key not valid') 
                ? 'သင်ထည့်သွင်းထားသော API Key သည် မှားယွင်းနေပါသည်။ ကျေးဇူးပြု၍ Settings တွင် ပြန်လည်စစ်ဆေးပါ။'
                : `API call failed with status: ${response.status}. ${errorBody?.error?.message || ''}`;
            throw new Error(errorMessage);
        }

        const data = await response.json();
        
        // Handle cases where the model might return no candidates or empty parts
        if (!data.candidates || data.candidates.length === 0 || !data.candidates[0].content || !data.candidates[0].content.parts || data.candidates[0].content.parts.length === 0) {
            // Check for safety ratings block
            if (data.promptFeedback?.blockReason) {
                 throw new Error(`AI မှ တုန့်ပြန်မှုကို မူဝါဒအရ ပိတ်ဆို့ထားပါသည်။ အကြောင်းရင်း: ${data.promptFeedback.blockReason}`);
            }
            throw new Error("AI မှ မမျှော်လင့်သော တုန့်ပြန်မှု ရရှိပါသည်။");
        }
        
        const text = data.candidates[0].content.parts[0].text;
        
        if (expectJson) {
            // Sometimes the model wraps JSON in markdown, so we strip it.
            const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
            return JSON.parse(jsonMatch ? jsonMatch[1] : text);
        }
        
        return text;

    } catch (error: any) {
        console.error('Error in callGoogleAI:', error);
        // Re-throw the error so the client-side can catch it.
        throw error;
    }
}


async function runAiFlow(prompt: string, apiKey: string): Promise<string> {
    if (!apiKey) {
        throw new Error("သင်၏ Gemini API Key ကို Settings တွင် ထည့်သွင်းပါ။");
    }
    return callGoogleAI(prompt, apiKey, false);
}

// --- Generic Text Flow ---
export async function genericTextFlow(input: z.infer<typeof GenericTextFlowInputSchema>): Promise<string> {
    if (!input.apiKey) throw new Error("API Key is required.");
    return runAiFlow(input.prompt, input.apiKey);
}

// --- Policy Check Flow ---
export async function policyCheckFlow(input: z.infer<typeof PolicyCheckInputSchema>): Promise<PolicyCheckOutput> {
  if (!input.apiKey) throw new Error("API Key is required.");

  const policyKeywordsGuide = `
    📖 Facebook (Meta) Community Standards – မြန်မာဘာသာ Policy Keywords Guide
    - 🔞 အကြမ်းဖက်မှုနှင့် အညံ့အကြေး: သတ်, ဓား, ပစ်, ခုတ်, ရိုက်, သွေး, ခေါင်းဖြတ်, အသတ်ခံရသူ, ညှင်းပန်း, အသေခံ
    - 👤 မတော်တဆမဟုတ်သော ကိုယ်ရေးကိုယ်တာ: လိပ်စာ, ဖုန်းနံပါတ်, မုန်းတီးစကား, လူမဆန်, ဓာတ်ပုံထုတ်မယ်
    - 🧠 မမှန်သော သတင်းအချက်အလက်: COVID ကူးပြီးပြီ, ဘေးကင်းတဲ့အချက်မရှိ, WHO, deepfake, အတု ဓာတ်ပုံ
    - 💊 ဆေးဝါးနှင့် မူးယစ်ဆိုင်ရာ: မူးယစ်ဆေး, စိတ်ဖိစီးမှုတားဆေး, ချေးရောင်း, ငွေပေးဆောင်ရင် သယ်ပေးမယ်
    - 🧠 ကိုယ့်ကိုယ်ကို ထိခိုက်စေမှု: ကိုယ့်ကိုယ်ကို သတ်ချင်, စိတ်ညစ်ရင် ဆေး, သေကြောင်းကြံ
    - 💸 လိမ်လည်မှုနှင့် ငွေကြေး: ငွေလွှဲ, QR code, Screenshot ပေး, ဆော့ဖ်ဝဲ install လုပ်
    - 🧒 လူငယ်နှင့် ကာကွယ်ရေး: ၁၃ နှစ်သား, ကလေးတော်တော်ချစ်, OnlyFans, VIP group, sexual grooming
    - ⚖️ မတရားမှုနှင့် ဥပဒေချိုးဖောက်မှု: ဗမာလူမျိုးသတ်, ရှမ်းတွေက, တပ်သားတွေ, တပ်ကွဲ
    - 🕯️ အထူးအနာဂတ်နှင့် ပဋိပက္ခ: အာဏာသိမ်းရေး, မြစ်ဆုံကို ဖျက်ချင်တယ်, ဖူလုံရေး သဘောထား
  `;

  const prompt = `You are an expert Burmese Facebook content policy analyzer. Your task is to analyze the user's text based on the provided Facebook Policy Keywords Guide. You must respond in a specific JSON format.

    Here is the guide:
    ${policyKeywordsGuide}

    Analyze the following text: "${input.text}"

    Your response MUST be a valid JSON object.
    1.  **isViolation** (boolean): Set to true if any keywords or violating contexts are found, otherwise false.
    2.  **reason** (string, in Burmese): Explain WHY the text is or is not a violation. If it is a violation, mention the category of violation.
    3.  **violatedKeywords** (array of strings): If 'isViolation' is true, list the EXACT Burmese words/phrases from the text that violate the policy. If false, this must be an empty array [].
    4.  **revisedText** (string, in Burmese): If 'isViolation' is true, rewrite the user's text to be compliant with Facebook policy while preserving the original meaning as much as possible. If false, return the original text.
    `;
  
  try {
      const structuredOutput = await callGoogleAI(prompt, input.apiKey, true);
      const validatedOutput = PolicyCheckOutputSchema.parse(structuredOutput);
      return validatedOutput;
  } catch (error: any) {
    console.error('Error in policyCheckFlow:', error);
    // Re-throw the customized error
    throw error;
  }
}

// --- Dictionary Tools Flows ---

export async function generalQA(input: z.infer<typeof DictionaryToolInputSchema>): Promise<string> {
    if (!input.apiKey) throw new Error("API Key is required.");
    const prompt = `Provide a detailed, multi-paragraph, helpful, general-knowledge answer in Burmese for the following query. Structure the answer with clear explanations. Do not use any markdown formatting like ** or ##. Query: "${input.query}"`;
    return runAiFlow(prompt, input.apiKey);
}

export async function translator(input: z.infer<typeof TranslatorInputSchema>): Promise<string> {
    if (!input.apiKey) throw new Error("API Key is required.");
    const languages: { [key: string]: string } = {
        my: "Burmese (မြန်မာ)", en: "English (အင်္ဂလိပ်)", th: "Thai (ထိုင်း)", zh: "Chinese (တရုတ်)",
        km: "Cambodian (ကမ္ဘောဒီးယား)", vi: "Vietnamese (ဗီယက်နမ်)", fr: "French (ပြင်သစ်)",
        ru: "Russian (ရုရှား)", ja: "Japanese (ဂျပန်)", ko: "Korean (ကိုးရီးယား)", de: "German (ဂျာမနီ)"
    };
    const fromLangName = languages[input.from] || input.from;
    const toLangName = languages[input.to] || input.to;
    const prompt = `Translate the following text from ${fromLangName} to ${toLangName}. Provide only the translated text, without any additional explanations or labels. Text: "${input.text}"`;
    return runAiFlow(prompt, input.apiKey);
}

export async function spellingChecker(input: z.infer<typeof SpellingCheckerInputSchema>): Promise<z.infer<typeof SpellingCheckerOutputSchema>> {
    if (!input.apiKey) throw new Error("API Key is required.");
    const prompt = `You are an extremely meticulous Burmese spelling and grammar checker. Your single task is to analyze the following Burmese text word by word against the official Myanmar Language Commission dictionary. You must be highly sensitive and flag any word that is not 100% correct.

    Your response MUST be a valid JSON array of objects.
    - Each object must have two keys: "incorrect" (the exact misspelled word or phrase) and "correct" (the corrected version).
    - If a word is misspelled, provide the correct spelling.
    - If you find a grammatical error, identify the incorrect phrase and provide the correction.
    - If there are absolutely no errors, you MUST return an empty array [].
    
    Do not add any explanations, notes, or apologies. Your entire output must be only the JSON array.
    
    Analyze this text: "${input.text}"`;
    
    try {
        const structuredOutput = await callGoogleAI(prompt, input.apiKey, true);
        // Ensure the output is always an array, even if the AI fails
        if (Array.isArray(structuredOutput)) {
            SpellingCheckerOutputSchema.parse(structuredOutput);
            return structuredOutput;
        }
        // If the AI returns a non-array (e.g., an error message or string), return an empty array
        return [];
    } catch (error: any) {
        console.error('Error in spellingChecker:', error);
        throw error;
    }
}

export async function wiki(input: z.infer<typeof DictionaryToolInputSchema>): Promise<string> {
    if (!input.apiKey) throw new Error("API Key is required.");
    const prompt = `Provide a detailed, multi-paragraph, Wikipedia-style summary in Burmese for the topic: "${input.query}". The summary must be neutral, informative, and well-structured. Do not use any markdown formatting like ** or ##.`;
    return runAiFlow(prompt, input.apiKey);
}

export async function health(input: z.infer<typeof DictionaryToolInputSchema>): Promise<string> {
    if (!input.apiKey) throw new Error("API Key is required.");
    const prompt = `Provide a detailed, multi-paragraph, helpful, general-knowledge answer in Burmese for the following health-related query. Structure the answer with clear explanations. This is not medical advice. Do not use any markdown formatting like ** or ##. Query: "${input.query}"`;
    return runAiFlow(prompt, input.apiKey);
}

export async function tech(input: z.infer<typeof DictionaryToolInputSchema>): Promise<string> {
    if (!input.apiKey) throw new Error("API Key is required.");
    const prompt = `Provide a detailed, multi-paragraph, clear explanation in Burmese for the following technology/AI topic. Structure the answer with clear explanations. Do not use any markdown formatting like ** or ##. Topic: "${input.query}"`;
    return runAiFlow(prompt, input.apiKey);
}

export async function dictionary(input: z.infer<typeof DictionaryToolInputSchema>): Promise<string> {
    if (!input.apiKey) throw new Error("API Key is required.");
    const prompt = `Provide a detailed, multi-paragraph, dictionary-style definition in Burmese for the word: "${input.query}". Include its part of speech, different meanings, and example sentences. Do not use any markdown formatting like ** or ##.`;
    return runAiFlow(prompt, input.apiKey);
}

    
