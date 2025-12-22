import { Router } from "express"
import { generateQuestions, generateOneQuestion, scoreQuiz } from "../controllers/ai.controller"

const router = Router()

// Generate 40-question quiz for a given language (public)
router.post("/generate", generateQuestions)
router.post("/generate-one", generateOneQuestion)

// Score submitted answers against provided questions (public)
router.post("/score", scoreQuiz)

export default router
