<p align="center">
  <img src="assets/logo.png" alt="Toka Logo" width="180" />
</p>

<h1 align="center">Toka SDK</h1>

<p align="center">
  <strong>AI Cost Optimizer SDK for Developers</strong><br/>
  Track token usage • Estimate costs in real-time • Reduce AI API spend • Optimize model usage
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/toka-sdk">
    <img src="https://img.shields.io/npm/v/toka-sdk?style=for-the-badge&color=2ea44f&label=version" alt="npm version"/>
  </a>
  &nbsp;&nbsp;
  <a href="https://www.npmjs.com/package/toka-sdk">
    <img src="https://img.shields.io/npm/dm/toka-sdk?style=for-the-badge&color=blue&label=downloads" alt="downloads/month"/>
  </a>
  &nbsp;&nbsp;
  <a href="https://github.com/abrehamshiferaw/toka">
    <img src="https://img.shields.io/github/forks/abrehamshiferaw/toka?style=for-the-badge" />
  </a>
  &nbsp;&nbsp;
  <a href="https://www.npmjs.com/package/toka-sdk">
    <img src="https://img.shields.io/npm/l/toka-sdk?style=for-the-badge&color=orange" />
  </a>
</p>

---

## 🚀 What is Toka?

**Toka SDK** is a lightweight, developer-first **AI Cost Optimization SDK** built to help you:

- Track token usage automatically  
- Estimate API costs in real-time  
- Prevent overspending with cost limits  
- Reduce redundant API calls using caching  
- Automatically fallback to cheaper AI models  

It works seamlessly with modern AI models like OpenAI and other LLM providers.

If you're building AI-powered apps, Toka helps you control cost without sacrificing performance.

---

# 📦 Installation

```bash
npm install toka-sdk
```

---

# ⚡ Quick Start

### 1️⃣ Import the SDK

```ts
import { TokaClient } from 'toka-sdk';
```

---

### 2️⃣ Initialize the Client

```ts
const client = new TokaClient({
  apiKey: process.env.TOKA_API_KEY,
  models: ['gpt-4', 'gpt-4o-mini', 'gpt-3.5'],
  maxCostPerRequest: 0.05,   // Maximum allowed cost per request (USD)
  cache: true                // Enable built-in caching
});
```

---

### 3️⃣ Make an API Call with Cost Tracking

```ts
const response = await client.chat({
  messages: [
    { role: 'user', content: 'Hello world' }
  ]
});

console.log(`Text: ${response.text}`);
console.log(`Cost: $${response.cost}`);
console.log(`Tokens used: ${response.tokens}`);
console.log(`Model used: ${response.modelUsed}`);
console.log(`Cache hit: ${response.cacheHit}`);
```

---

# ✨ Core Features

## 🔍 Token Usage Tracking
Automatically tracks token usage for every request.

## 💰 Real-Time Cost Estimation
Know exactly how much each API call costs before and after execution.

## 🧠 Intelligent Cost Optimization
If a request exceeds your defined budget, Toka automatically falls back to a cheaper model.

## ⚡ Built-In Caching
Reduce redundant API calls with:
- In-memory caching
- Optional Redis integration

## 🔄 Multi-Model Support
Define multiple models and let Toka dynamically choose the optimal one.

## 📊 Logging & Analytics
Gain visibility into:
- Tokens used
- Cost per request
- Cache hits
- Fallback events
- Model selection

---

# 🧩 Optional Enhancements

Toka is modular and extensible.

### 🗄 Redis Caching
Use Redis for scalable, production-grade caching.

### 📈 Dashboard Middleware
Mountable Express middleware to monitor AI usage and costs.

### 🖥 CLI Tool
Interact with AI APIs directly from your terminal.

### 🎣 Event Hooks
Listen to lifecycle events:
- `onRequest`
- `onFallback`
- `onCacheHit`
- `onComplete`

---

# 🧪 Testing

Run unit tests:

```bash
npm test
```

---

# 🛠 Development

Build the project:

```bash
npm run build
```

Lint:

```bash
npm run lint
```

Format:

```bash
npm run format
```

---

# 🌍 Use Cases

Toka SDK is ideal for:

- AI SaaS platforms
- Chatbot applications
- AI-powered web apps
- Prompt engineering workflows
- High-volume AI API environments
- Startups monitoring burn rate

---

# 🤝 Contributing

We welcome contributions from the community!

Please read **CONTRIBUTING.md** before submitting a pull request.

Ways to contribute:
- Bug fixes
- Feature improvements
- Documentation
- Test coverage
- New integrations

---

# 📄 License

MIT License © 2026  
Abreham Wondimu Shiferaw

---

# ⭐ Support the Project

If Toka SDK helps your project:

- Star the repository
- Share it with other developers
- Open issues or feature suggestions
- Contribute improvements

Open source grows through community support ❤️
