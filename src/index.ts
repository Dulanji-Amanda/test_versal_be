import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import mongoose from "mongoose"
import authRouter from "./routes/auth"
import postRouter from "./routes/post"
import aiRouter from "./routes/ai"
import { authenticate } from "./middleware/auth"
import { requireRole } from "./middleware/role"
import { Role } from "./models/user.model"
dotenv.config()

const PORT = process.env.PORT
const MONGO_URI = process.env.MONGO_URI as string

const app = express()

app.use(express.json())
app.use(
  cors({
    origin: ["http://localhost:5173", "https://blog-post-fe-8wgl.vercel.app"],
    methods: ["GET", "POST", "PUT", "DELETE"] // optional
  })
)

app.use("/api/v1/auth", authRouter)
app.use("/api/v1/post", postRouter)
app.use("/api/v1/ai", aiRouter)

// sample route with auth

app.get("/", (_req, res) => {
  res.send("Welcome to Smart Blog API")
})

// public
app.get("/test-1", (_req, res) => {
  res.status(204).send()
})

// protected
app.get("/test-2", authenticate, (_req, res) => {
  res.status(204).send()
})

// admin only
app.get("/test-3", authenticate, requireRole([Role.ADMIN]), (_req, res) => {
  res.status(204).send()
})

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log("DB connected")
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })

app.listen(PORT, () => {
  console.log("Server is running")
})

// --------------------------------------
// // Built in middlewares (Global)
// app.use(express.json())

// // Thrid party middlewares (Global)
// app.use(
//   cors({
//     origin: ["http://localhost:3000"],
//     methods: ["GET", "POST", "PUT", "DELETE"] // optional
//   })
// )

// // Global middleware
// app.use((req, res, next) => {
//   console.log("Hello")
//   if (true) {
//     next() // go forword
//   } else {
//     res.sendStatus(400) // stop
//   }
// })

// app.get("/hello", testMiddleware, (req, res) => {
//   //
//   res.send("")
// })

// app.get("/", testMiddleware, (req, res) => {
//   console.log("I'm router")
//   res.status(200).send("Ok")
// })

// app.get("/private", testMiddleware, (req, res) => {
//   console.log("I'm router")
//   res.status(200).send("Ok")
// })

// app.get("/test", (req, res) => {
//   res.status(200).send("Test Ok")
// })

// app.listen(5000, () => {
//   console.log("Server is running")
// })

// path params
// http://localhost:5000/1234
// http://localhost:5000/4321
// http://localhost:5000/hello
// app.get("/:id", (req, res) => {
//   const params = req.params
//   console.log(params)
//   console.log(params?.id)

//   res.status(200).send("Ok")
// })

// query params ?id=1234
// http://localhost:5000/?id=1234
// http://localhost:5000/?id=4321
// app.get("/", (req, res) => {
//   const params = req.query
//   console.log(params)
//   console.log(params?.id)

//   res.status(200).send("Ok")
// })


