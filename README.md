# Toka SDK

AI Cost Optimizer SDK for developers to track token usage, estimate cost, and reduce API spend.

## Installation

```bash
npm install toka
```

## Usage

```typescript
import { TokaClient } from 'toka';

// Initialize the client
const client = new TokaClient({
  apiKey: process.env.TOKA_API_KEY,
  model: 'gpt-4',
  maxTokens: 1000
});

// Make API calls with cost tracking
const response = await client.chat({
  messages: [{ role: 'user', content: 'Hello world' }]
});

console.log(`Cost: $${response.cost}`);
console.log(`Tokens used: ${response.tokensUsed}`);
```

## Features

- **Token Usage Tracking**: Automatically track token usage across API calls
- **Cost Estimation**: Real-time cost estimation based on model usage
- **Cost Optimization**: Intelligent fallback strategies to reduce costs
- **Caching**: Built-in caching to avoid redundant API calls
- **Multi-Model Support**: Support for multiple AI models with automatic fallback

## API Reference

Coming soon...

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## License

MIT