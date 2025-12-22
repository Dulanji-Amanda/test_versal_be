import { Request, Response } from "express"
import { jsonrepair } from "jsonrepair"

type QuizQuestion = {
  question: string
  options: string[]
  correctAnswer: number
  explanation: string
}

// Provider configuration (default to free Hugging Face Inference API)
const HF_MODEL = process.env.HUGGINGFACE_MODEL || "mistralai/Mistral-7B-Instruct-v0.2"
// Use Hugging Face router OpenAI-compatible chat endpoint
const HF_API_URL = process.env.HUGGINGFACE_API_URL || "https://router.huggingface.co/v1/chat/completions"
const HF_API_KEY = process.env.HUGGINGFACE_API_KEY || ""

// Language display names for better prompts
const languageNames: Record<string, string> = {
  java: "Java",
  python: "Python",
  typescript: "TypeScript",
  javascript: "JavaScript",
  html: "HTML",
  css: "CSS",
  csharp: "C#",
  go: "Go"
}

// Supported languages list
const supportedLanguages = Object.keys(languageNames)

/**
 * Generate quiz questions using the free Hugging Face Inference API.
 * Model default: microsoft/Phi-3-mini-4k-instruct (fast, open, free tier).
 */
const generateQuestionsWithHuggingFace = async (
  language: string,
  count: number = 40
): Promise<QuizQuestion[]> => {
  const displayName = languageNames[language] || language

  const n = Math.max(1, Math.min(40, Math.floor(count)))

  const prompt = `You are an expert programming instructor. Generate exactly ${n} multiple-choice quiz questions about ${displayName} programming.

Requirements:
- Exactly 4 answer options per question.
- Difficulty should range from beginner to advanced.
- Cover syntax, concepts, best practices, common patterns, and debugging.
- Provide a clear explanation for the correct answer.

Return ONLY valid JSON (no markdown, no code fences) in this exact shape:
{
  "questions": [
    {
      "question": "...",
      "options": ["option1", "option2", "option3", "option4"],
      "correctAnswer": 0,
      "explanation": "..."
    }
  ]
}

Ensure the correctAnswer is the zero-based index (0-3). Generate exactly ${n} questions.`

  const candidateModels = Array.from(new Set([
    HF_MODEL,
    "mistralai/Mistral-7B-Instruct-v0.2",
    "meta-llama/Meta-Llama-3-8B-Instruct"
  ]))

  const tryParse = (raw: string) => {
    const cleaned = raw.replace(/^```json\n?|\n?```$/g, "").trim()

    // 1) strict parse
    try {
      return JSON.parse(cleaned)
    } catch (_) {}

    // 2) attempt jsonrepair on full string
    try {
      const repaired = jsonrepair(cleaned)
      return JSON.parse(repaired)
    } catch (_) {}

    // 3) slice between first { and last }
    const first = cleaned.indexOf("{")
    const last = cleaned.lastIndexOf("}")
    if (first !== -1 && last !== -1 && last > first) {
      const slice = cleaned.slice(first, last + 1)
      try {
        return JSON.parse(slice)
      } catch (_) {
        try {
          const repaired = jsonrepair(slice)
          return JSON.parse(repaired)
        } catch (_) {}
      }
    }

    throw new Error("Unable to parse model JSON output")
  }

  let lastError: Error | null = null

  for (const model of candidateModels) {
    const response = await fetch(HF_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(HF_API_KEY ? { Authorization: `Bearer ${HF_API_KEY}` } : {})
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: "You are an expert programming instructor creating quiz questions. Return only valid JSON without any markdown formatting or code blocks."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 6000,
        temperature: 0.7,
        stream: false,
        response_format: { type: "json_object" }
      })
    })

    const errorText = !response.ok ? await response.text() : ""

    if (!response.ok) {
      // If model unsupported, try next candidate
      if (response.status === 400 && errorText.includes("model_not_supported")) {
        lastError = new Error(`Model not supported: ${model}`)
        continue
      }
      lastError = new Error(`Hugging Face API error (${response.status}): ${errorText}`)
      continue
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>
      error?: { message?: string }
    }

    const content = data.choices?.[0]?.message?.content?.trim()
    if (!content) {
      const errMsg = data.error?.message || "Missing content in Hugging Face response"
      lastError = new Error(errMsg)
      continue
    }

    try {
      const parsed = tryParse(content)

      if (!parsed.questions || !Array.isArray(parsed.questions)) {
        lastError = new Error("Invalid response format from Hugging Face")
        continue
      }

      const questions: QuizQuestion[] = parsed.questions
        .filter((q: any) => q && typeof q.question === "string" && Array.isArray(q.options))
        .slice(0, n)
        .map((q: any) => {
          const opts = (q.options as any[]).slice(0, 4)
          while (opts.length < 4) opts.push("")
          const correct = typeof q.correctAnswer === "number" ? q.correctAnswer : 0
          const boundedCorrect = Math.min(3, Math.max(0, correct))
          return {
            question: q.question || "",
            options: opts,
            correctAnswer: boundedCorrect,
            explanation: q.explanation || ""
          }
        })

      if (questions.length === 0) {
        lastError = new Error("No valid questions returned from model")
        continue
      }

      return questions
    } catch (parseErr) {
      lastError = parseErr as Error
      continue
    }
  }

  throw lastError || new Error("Failed to generate questions with available Hugging Face models")
}

export const generateQuestions = async (req: Request, res: Response) => {
  const { language, count } = req.body as { language?: string; count?: number }
  console.log("/ai/generate called with:", req.body)

  const key = (language || "java").toLowerCase()

  // Check if language is supported
  if (!supportedLanguages.includes(key)) {
    return res.status(400).json({
      message: `Unsupported language. Supported: ${supportedLanguages.join(", ")}`
    })
  }

  try {
    const n = typeof count === "number" ? count : 40
    console.log(`Generating ${n} question(s) for ${key} using Hugging Face Inference API...`)
    const questions = await generateQuestionsWithHuggingFace(key, n)
    console.log(`Successfully generated ${questions.length} question(s) for ${key}`)

    res.json({
      language: key,
      count: questions.length,
      questions
    })
  } catch (error) {
    console.error("Error generating questions:", error)
    res.status(500).json({
      message: "Failed to generate questions. Please try again later.",
      error: error instanceof Error ? error.message : "Unknown error"
    })
  }
}

export const generateOneQuestion = async (req: Request, res: Response) => {
  const { language } = req.body as { language?: string }
  const key = (language || "java").toLowerCase()
  if (!supportedLanguages.includes(key)) {
    return res.status(400).json({
      message: `Unsupported language. Supported: ${supportedLanguages.join(", ")}`
    })
  }
  try {
    const questions = await generateQuestionsWithHuggingFace(key, 1)
    return res.json({ language: key, question: questions[0] })
  } catch (error) {
    console.error("Error generating single question:", error)
    res.status(500).json({ message: "Failed to generate question." })
  }
}

export const scoreQuiz = (req: Request, res: Response) => {
  const { questions, answers } = req.body as {
    questions: QuizQuestion[]
    answers: number[]
  }
  if (!Array.isArray(questions) || !Array.isArray(answers)) {
    return res.status(400).json({ message: "Invalid payload" })
  }
  let score = 0
  for (let i = 0; i < Math.min(questions.length, answers.length); i++) {
    if (answers[i] === questions[i].correctAnswer) score++
  }
  res.json({
    total: questions.length,
    correct: score,
    percentage: Math.round((score / questions.length) * 100)
  })
}
